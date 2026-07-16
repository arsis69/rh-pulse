// Flap Portal indexer — server-side only (imported by /api/feed).
// Keeps an incremental block cursor in module state; cold start scans a full window.
import { decodeEventLog, parseAbi } from 'viem';
import { Token, TradeEvent } from '@/lib/types';
import { flapPortalAddress } from '@/lib/chain';

const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const EXPLORER_API = 'https://robinhoodchain.blockscout.com/api';
const TOKEN_SUPPLY = 1_000_000_000; // Flap tokens launch with fixed 1B supply
const COLD_START_WINDOW = 60_000; // blocks, covers ~1 day
const MAX_TOKENS = 80;
const MAX_ACTIVITY = 60;

const TOPIC_CREATED = '0x504e7f360b2e5fe33cbaaae4c593bc55305328341bf79009e43e0e3b7f699603';
const TOPIC_BOUGHT = '0xa800a2038683844fac66747f771bfdfae862eb28b16bcfa387afa9fbacce8ff7';
const TOPIC_SOLD = '0x03a4693e592f5e75dc7c136acb39b146d2b4966c0e509c34f362dee02b3b861a';

const portalAbi = parseAbi([
  'event TokenCreated(uint256 ts, address creator, uint256 nonce, address token, string name, string symbol, string meta)',
  'event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)',
  'event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)',
]);

interface RawLog {
  topics: string[];
  data: `0x${string}`;
}

interface CurveState {
  createdTs: number;
  name: string;
  symbol: string;
  metaCid: string;
  lastTs: number;
  lastPriceWei: bigint;
  firstPriceWei: bigint; // first observed trade price → "up since launch"
  volDayEth: number; // rolling, pruned by trade timestamps below
  trades: { ts: number; eth: number }[];
  netCurveEth: number;
}

// module-level indexer state (single Node process behind systemd)
const curve = new Map<string, CurveState>();
const activity: TradeEvent[] = [];
let cursor = 0; // last scanned block

async function rpcBlockNumber(): Promise<number> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    cache: 'no-store',
  });
  return parseInt((await res.json()).result, 16);
}

async function getPortalLogs(topic0: string, fromBlock: number, toBlock: number): Promise<RawLog[]> {
  const url = `${EXPLORER_API}?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${flapPortalAddress}&topic0=${topic0}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  return Array.isArray(json.result) ? json.result : [];
}

function decode(log: RawLog) {
  return decodeEventLog({
    abi: portalAbi,
    topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    data: log.data,
  });
}

function applyTrade(log: RawLog, side: 'buy' | 'sell', ethUsd: number) {
  try {
    const { args } = decode(log) as unknown as {
      args: {
        ts: bigint;
        token: string;
        buyer?: string;
        seller?: string;
        amount: bigint;
        eth: bigint;
        postPrice: bigint;
      };
    };
    const key = args.token.toLowerCase();
    const ts = Number(args.ts);
    const eth = Number(args.eth) / 1e18;
    const amount = Number(args.amount) / 1e18; // Flap tokens are 18 decimals
    const st = curve.get(key);
    if (st) {
      if (st.firstPriceWei === 0n) st.firstPriceWei = args.postPrice;
      if (ts >= st.lastTs) {
        st.lastTs = ts;
        st.lastPriceWei = args.postPrice;
      }
      st.trades.push({ ts, eth });
      st.netCurveEth += side === 'buy' ? eth : -eth;
    }
    activity.push({
      ts,
      token: args.token,
      address: (side === 'buy' ? args.buyer : args.seller)?.toLowerCase(),
      ticker: st?.symbol,
      side,
      eth,
      usd: eth * ethUsd,
      amount,
    });
  } catch {
    /* skip undecodable log */
  }
}

export interface FlapSnapshot {
  tokens: Token[];
  activity: TradeEvent[];
  launches24h: number;
}

export async function refreshFlap(ethUsd: number): Promise<FlapSnapshot> {
  const latest = await rpcBlockNumber();
  const from = cursor === 0 ? Math.max(latest - COLD_START_WINDOW, 0) : cursor + 1;

  if (from <= latest) {
    const [created, bought, sold] = await Promise.all([
      getPortalLogs(TOPIC_CREATED, from, latest),
      getPortalLogs(TOPIC_BOUGHT, from, latest),
      getPortalLogs(TOPIC_SOLD, from, latest),
    ]);
    for (const log of created) {
      try {
        const { args } = decode(log) as unknown as {
          args: { ts: bigint; token: string; name: string; symbol: string; meta: string };
        };
        curve.set(args.token.toLowerCase(), {
          createdTs: Number(args.ts),
          name: args.name,
          symbol: args.symbol,
          metaCid: args.meta,
          lastTs: 0,
          lastPriceWei: 0n,
          firstPriceWei: 0n,
          volDayEth: 0,
          trades: [],
          netCurveEth: 0,
        });
      } catch {
        /* skip */
      }
    }
    bought.forEach((l) => applyTrade(l, 'buy', ethUsd));
    sold.forEach((l) => applyTrade(l, 'sell', ethUsd));
    cursor = latest;
  }

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  // prune: keep tokens created in the last 24h, cap map size
  for (const [key, st] of curve) {
    if (st.createdTs < dayAgo) curve.delete(key);
    else st.trades = st.trades.filter((t) => t.ts >= dayAgo);
  }
  while (activity.length > MAX_ACTIVITY) activity.shift();

  const tokens: Token[] = [];
  for (const [key, st] of curve) {
    const priceEth = Number(st.lastPriceWei) / 1e18;
    const volEth = st.trades.reduce((s, t) => s + t.eth, 0);
    tokens.push({
      id: key,
      address: key,
      ticker: st.symbol,
      name: st.name,
      launchpad: 'flap',
      source: 'flap',
      createdAt: st.createdTs,
      liquidity: Math.max(st.netCurveEth, 0) * ethUsd,
      mcap: priceEth * TOKEN_SUPPLY * ethUsd,
      volume24h: volEth * ethUsd,
      priceUsd: priceEth * ethUsd || undefined,
      priceChange24h:
        st.firstPriceWei > 0n && st.lastPriceWei > 0n
          ? (Number(st.lastPriceWei) / Number(st.firstPriceWei) - 1) * 100
          : undefined,
      txns24h: st.trades.length,
      hasX: false,
      isCurve: true,
      scoreSource: null,
      metaCid: st.metaCid || undefined,
    });
  }
  tokens.sort((a, b) => b.createdAt - a.createdAt);

  return {
    tokens: tokens.slice(0, MAX_TOKENS),
    activity: [...activity].sort((a, b) => b.ts - a.ts),
    launches24h: curve.size,
  };
}
