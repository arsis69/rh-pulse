// Flap Portal indexer — server-side only (imported by /api/feed).
// Keeps an incremental block cursor in module state; cold start scans a full window.
import { decodeEventLog, parseAbi } from 'viem';
import { Token, TradeEvent } from '@/lib/types';
import { flapPortalAddress } from '@/lib/chain';
import { readCurveStates } from '@/lib/onchain';

const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const EXPLORER_API = 'https://robinhoodchain.blockscout.com/api';
const TOKEN_SUPPLY = 1_000_000_000; // Flap tokens launch with fixed 1B supply
const COLD_START_WINDOW = 150_000; // blocks — chain runs ~9 blk/s, so ≈4.5h of launches
const TRADE_COLD_WINDOW = 30_000; // trades backfill less: only recent volume matters, and buys are 10× launch volume
const MAX_TOKENS = 250; // pre-dedupe pool — flap bursts hit 8+ launches/min, mostly clone spam that mergeTokens collapses
const MAX_ACTIVITY = 200; // whale detection scans this buffer — too small and big buys vanish between refreshes

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
  creator?: string;
  name: string;
  symbol: string;
  metaCid: string;
  lastTs: number;
  lastPriceWei: bigint;
  firstPriceWei: bigint; // first observed trade price → "up since launch"
  volDayEth: number; // rolling, pruned by trade timestamps below
  trades: { ts: number; eth: number; priceWei: bigint; side: 'buy' | 'sell' }[];
  netCurveEth: number;
}

// module-level indexer state (single Node process behind systemd)
const curve = new Map<string, CurveState>();
const activity: TradeEvent[] = [];
// Symbols outlive curve state: `curve` is pruned to the last 24h of launches,
// but trades on older tokens still need a ticker for the whale feed.
const symbols = new Map<string, string>();
const SYMBOL_MAX = 20_000;

export function knownSymbol(address: string): string | undefined {
  return symbols.get(address.toLowerCase());
}

// Deployer history: `creator` rides on every TokenCreated log and used to be
// dropped on the floor. Kept outside `curve` (which prunes to 24h) so a serial
// launcher's record survives its dead tokens.
const deployers = new Map<string, { tokens: Set<string>; firstSeen: number }>();
const DEPLOYER_MAX = 5_000;

function rememberLaunch(creator: string | undefined, token: string, ts: number) {
  if (!creator) return;
  const key = creator.toLowerCase();
  const rec = deployers.get(key) ?? { tokens: new Set<string>(), firstSeen: ts };
  rec.tokens.add(token);
  deployers.set(key, rec);
  while (deployers.size > DEPLOYER_MAX) deployers.delete(deployers.keys().next().value!);
}

export interface DeployerStats {
  launches: number; // total launches we've indexed from this address
  firstSeen: number;
}

export function deployerStats(creator?: string): DeployerStats | undefined {
  if (!creator) return undefined;
  const rec = deployers.get(creator.toLowerCase());
  return rec ? { launches: rec.tokens.size, firstSeen: rec.firstSeen } : undefined;
}
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

// Blockscout silently truncates getLogs at 1000 rows, returning the OLDEST ones —
// a capped cold-start scan would ingest stale launches, then advance the cursor
// past everything newer (this is how launches went missing). Bisect on cap.
const LOG_CAP = 1000;
async function getPortalLogsPaged(topic0: string, fromBlock: number, toBlock: number, depth = 0): Promise<RawLog[]> {
  const logs = await getPortalLogs(topic0, fromBlock, toBlock);
  if (logs.length < LOG_CAP || depth >= 7 || toBlock - fromBlock < 2_000) return logs;
  const mid = Math.floor((fromBlock + toBlock) / 2);
  const [a, b] = await Promise.all([
    getPortalLogsPaged(topic0, fromBlock, mid, depth + 1),
    getPortalLogsPaged(topic0, mid + 1, toBlock, depth + 1),
  ]);
  return [...a, ...b];
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
      st.trades.push({ ts, eth, priceWei: args.postPrice, side });
      st.netCurveEth += side === 'buy' ? eth : -eth;
    }
    activity.push({
      ts,
      token: args.token,
      address: (side === 'buy' ? args.buyer : args.seller)?.toLowerCase(),
      ticker: st?.symbol ?? symbols.get(key),
      side,
      eth,
      usd: eth * ethUsd,
      amount,
      supply: TOKEN_SUPPLY,
    });
  } catch {
    /* skip undecodable log */
  }
}

// Real price path from the curve's own trade prints — evenly sampled so the
// line isn't dominated by whichever second had the most trades.
function buildSparkline(trades: { ts: number; priceWei: bigint }[]): number[] | undefined {
  if (trades.length < 2) return undefined;
  const sorted = [...trades].sort((a, b) => a.ts - b.ts).filter((t) => t.priceWei > 0n);
  if (sorted.length < 2) return undefined;
  const POINTS = 12;
  const out: number[] = [];
  for (let i = 0; i < POINTS; i++) {
    const idx = Math.round((i / (POINTS - 1)) * (sorted.length - 1));
    out.push(Number(sorted[idx].priceWei) / 1e18);
  }
  return out;
}

// Price move across a window, from the curve's own prints. Anchored on the last
// print *before* the window when there is one, so a token whose only trades are
// inside the hour still reports the move that happened during it.
function pctChangeSince(trades: { ts: number; priceWei: bigint }[], since: number): number | undefined {
  const sorted = [...trades].filter((t) => t.priceWei > 0n).sort((a, b) => a.ts - b.ts);
  if (!sorted.length) return undefined;
  const inWindow = sorted.filter((t) => t.ts >= since);
  if (!inWindow.length) return undefined;
  const before = sorted.filter((t) => t.ts < since).pop();
  const start = Number((before ?? inWindow[0]).priceWei);
  const end = Number(inWindow[inWindow.length - 1].priceWei);
  if (!start || !end) return undefined;
  return (end / start - 1) * 100;
}

// Overwrite event-derived guesses with the Portal's own numbers: `reserve` is
// the ETH really in the curve and `progress` is the real graduation percent.
async function applyCurveStates(tokens: Token[], ethUsd: number) {
  const states = await readCurveStates(tokens.map((t) => t.address));
  for (const t of tokens) {
    const s = states.get(t.id);
    if (!s) continue;
    t.liquidity = s.reserveEth * ethUsd;
    t.curveProgress = s.progressPct;
    t.buyTax = s.buyTaxPct;
    t.sellTax = s.sellTaxPct;
    t.poolAddress = t.poolAddress ?? s.poolAddress;
    if (s.graduated) t.isCurve = false;
    if (s.priceWei > 0n) {
      const priceEth = Number(s.priceWei) / 1e18;
      t.priceUsd = priceEth * ethUsd || undefined;
      t.mcap = priceEth * TOKEN_SUPPLY * ethUsd;
    }
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
  const tradeFrom = cursor === 0 ? Math.max(latest - TRADE_COLD_WINDOW, 0) : cursor + 1;

  if (from <= latest) {
    const [created, bought, sold] = await Promise.all([
      getPortalLogsPaged(TOPIC_CREATED, from, latest),
      getPortalLogsPaged(TOPIC_BOUGHT, tradeFrom, latest),
      getPortalLogsPaged(TOPIC_SOLD, tradeFrom, latest),
    ]);
    for (const log of created) {
      try {
        const { args } = decode(log) as unknown as {
          args: { ts: bigint; creator: string; token: string; name: string; symbol: string; meta: string };
        };
        const addr = args.token.toLowerCase();
        symbols.set(addr, args.symbol);
        rememberLaunch(args.creator, addr, Number(args.ts));
        curve.set(addr, {
          createdTs: Number(args.ts),
          creator: args.creator?.toLowerCase(),
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
  const hourAgo = now - 3600;

  // prune: keep tokens created in the last 24h, cap map size
  for (const [key, st] of curve) {
    if (st.createdTs < dayAgo) curve.delete(key);
    else st.trades = st.trades.filter((t) => t.ts >= dayAgo);
  }
  while (symbols.size > SYMBOL_MAX) symbols.delete(symbols.keys().next().value!);
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
      volume1h: st.trades.filter((t) => t.ts >= hourAgo).reduce((s, t) => s + t.eth, 0) * ethUsd,
      priceChange1h: pctChangeSince(st.trades, hourAgo),
      sparkline: buildSparkline(st.trades),
      deployer: st.creator,
      deployerLaunches: deployerStats(st.creator)?.launches,
      buys24h: st.trades.filter((t) => t.side === 'buy').length,
      sells24h: st.trades.filter((t) => t.side === 'sell').length,
      hasX: false,
      isCurve: true,
      scoreSource: null,
      metaCid: st.metaCid || undefined,
    });
  }
  tokens.sort((a, b) => b.createdAt - a.createdAt);
  const top = tokens.slice(0, MAX_TOKENS);
  await applyCurveStates(top, ethUsd);

  return {
    tokens: top,
    activity: [...activity].sort((a, b) => b.ts - a.ts),
    launches24h: curve.size,
  };
}
