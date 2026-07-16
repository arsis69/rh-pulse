import { decodeEventLog, parseAbi } from 'viem';
import { Token } from '@/lib/types';
import { flapPortalAddress } from '@/lib/chain';

const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const EXPLORER_API = 'https://robinhoodchain.blockscout.com/api';
const TOKEN_SUPPLY = 1_000_000_000; // Flap tokens launch with fixed 1B supply
const BLOCK_WINDOW = 60_000; // ~recent history on Robinhood Chain

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

async function getLatestBlock(): Promise<number> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
  });
  const json = await res.json();
  return parseInt(json.result, 16);
}

async function getPortalLogs(topic0: string, fromBlock: number): Promise<RawLog[]> {
  const url = `${EXPLORER_API}?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=latest&address=${flapPortalAddress}&topic0=${topic0}`;
  const res = await fetch(url);
  const json = await res.json();
  return Array.isArray(json.result) ? json.result : [];
}

async function getEthUsd(): Promise<number> {
  try {
    const res = await fetch('https://robinhoodchain.blockscout.com/api/v2/stats');
    const json = await res.json();
    return parseFloat(json.coin_price) || 0;
  } catch {
    return 0;
  }
}

interface TradeStats {
  lastTs: number;
  lastPriceWei: bigint; // wei per whole token
  volume24hEth: number;
  netCurveEth: number; // buys minus sells, proxy for curve liquidity
}

function scoreToken(t: { ageMinutes: number; volume24h: number; liquidity: number }): number {
  // Heuristic placeholder until per-token LLM analysis runs (lib/llm.ts)
  let score = 40;
  if (t.volume24h > 1000) score += 15;
  if (t.volume24h > 10000) score += 15;
  if (t.liquidity > 5000) score += 10;
  if (t.ageMinutes < 60) score += 10;
  return Math.min(score, 95);
}

export async function fetchRecentFlapTokens(limit = 30): Promise<Token[]> {
  const latest = await getLatestBlock();
  const fromBlock = Math.max(latest - BLOCK_WINDOW, 0);

  const [createdLogs, boughtLogs, soldLogs, ethUsd] = await Promise.all([
    getPortalLogs(TOPIC_CREATED, fromBlock),
    getPortalLogs(TOPIC_BOUGHT, fromBlock),
    getPortalLogs(TOPIC_SOLD, fromBlock),
    getEthUsd(),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  const trades = new Map<string, TradeStats>();

  const applyTrade = (log: RawLog, sign: 1 | -1) => {
    try {
      const { args } = decodeEventLog({
        abi: portalAbi,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data,
      }) as { args: { ts: bigint; token: string; eth: bigint; postPrice: bigint } };
      const key = args.token.toLowerCase();
      const ts = Number(args.ts);
      const ethAmt = Number(args.eth) / 1e18;
      const cur = trades.get(key) || { lastTs: 0, lastPriceWei: 0n, volume24hEth: 0, netCurveEth: 0 };
      if (ts >= cur.lastTs) {
        cur.lastTs = ts;
        cur.lastPriceWei = args.postPrice;
      }
      if (ts >= dayAgo) cur.volume24hEth += ethAmt;
      cur.netCurveEth += sign * ethAmt;
      trades.set(key, cur);
    } catch {
      /* skip undecodable log */
    }
  };
  boughtLogs.forEach((l) => applyTrade(l, 1));
  soldLogs.forEach((l) => applyTrade(l, -1));

  const tokens: Token[] = [];
  for (const log of createdLogs) {
    try {
      const { args } = decodeEventLog({
        abi: portalAbi,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        data: log.data,
      }) as { args: { ts: bigint; token: string; name: string; symbol: string; meta: string } };
      const key = args.token.toLowerCase();
      const stats = trades.get(key);
      const priceEth = stats ? Number(stats.lastPriceWei) / 1e18 : 0;
      const ageMinutes = Math.max(Math.round((now - Number(args.ts)) / 60), 0);
      const base = {
        ageMinutes,
        volume24h: (stats?.volume24hEth || 0) * ethUsd,
        liquidity: Math.max(stats?.netCurveEth || 0, 0) * ethUsd,
      };
      tokens.push({
        id: key,
        address: args.token,
        ticker: args.symbol,
        name: args.name,
        launchpad: 'flap',
        liquidity: base.liquidity,
        mcap: priceEth * TOKEN_SUPPLY * ethUsd,
        ageMinutes,
        volume24h: base.volume24h,
        llmScore: scoreToken(base),
        hasX: false,
      });
    } catch {
      /* skip undecodable log */
    }
  }

  // newest first, cap at limit
  return tokens.sort((a, b) => a.ageMinutes - b.ageMinutes).slice(0, limit);
}
