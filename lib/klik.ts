// Klik launchpad indexer — server-side only.
// Klik's verified Factory (found via KLIK token creation trace) emits
// ERC20TokenCreated and launches tokens straight into Uniswap v4 via KlikHook,
// so market numbers arrive through GeckoTerminal; this module supplies
// attribution + brand-new launches before GT indexes them.
import { TradeEvent } from '@/lib/types';

const KLIK_FACTORY = '0x16cF6788B762EE8969744586eD16fc5705140dd7';
const EXPLORER_API = 'https://robinhoodchain.blockscout.com/api';
const EXPLORER_V2 = 'https://robinhoodchain.blockscout.com/api/v2';
const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const COLD_START_WINDOW = 120_000; // klik launches are sparser than flap

const TOPIC_CREATED = '0x60122e78030aba0a2e4a67adb3e52b411343cc51778f919095d3fe394090c1b2'; // ERC20TokenCreated(address)
const TOPIC_PURCHASED = '0x8daf503382665d950e449b86172be5222275c90f4ddf69c29fdaa8237a562a6d'; // TokenPurchased(buyer, tokenOut, ethSpent, tokensReceived)

export interface KlikLaunch {
  address: string; // lowercase
  name: string;
  ticker: string;
  createdAt: number;
  holders?: number;
  imageUrl?: string;
}

const launches = new Map<string, KlikLaunch>();
const activity: TradeEvent[] = [];
let cursor = 0;

async function rpcBlockNumber(): Promise<number> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    cache: 'no-store',
  });
  return parseInt((await res.json()).result, 16);
}

interface RawLog {
  topics: string[];
  data: string;
  timeStamp?: string;
}

async function getFactoryLogs(topic0: string, fromBlock: number, toBlock: number): Promise<RawLog[]> {
  const url = `${EXPLORER_API}?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${KLIK_FACTORY}&topic0=${topic0}`;
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  return Array.isArray(json.result) ? json.result : [];
}

async function fetchTokenMeta(address: string): Promise<{ name: string; ticker: string; holders?: number; imageUrl?: string } | null> {
  try {
    const res = await fetch(`${EXPLORER_V2}/tokens/${address}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const t = await res.json();
    return {
      name: t.name || 'Unknown',
      ticker: t.symbol || '???',
      holders: t.holders_count ? parseInt(t.holders_count) : undefined,
      imageUrl: t.icon_url || undefined,
    };
  } catch {
    return null;
  }
}

export interface KlikSnapshot {
  launches: KlikLaunch[];
  klikAddresses: Set<string>;
  activity: TradeEvent[];
}

export async function refreshKlik(ethUsd: number): Promise<KlikSnapshot> {
  const latest = await rpcBlockNumber();
  const from = cursor === 0 ? Math.max(latest - COLD_START_WINDOW, 0) : cursor + 1;

  if (from <= latest) {
    const [created, purchased] = await Promise.all([
      getFactoryLogs(TOPIC_CREATED, from, latest),
      getFactoryLogs(TOPIC_PURCHASED, from, latest),
    ]);
    for (const log of created) {
      // ERC20TokenCreated(address tokenAddress) — address is the sole data word
      const addr = ('0x' + log.data.slice(-40)).toLowerCase();
      const ts = log.timeStamp ? parseInt(log.timeStamp, 16) : Math.floor(Date.now() / 1000);
      const meta = await fetchTokenMeta(addr);
      launches.set(addr, {
        address: addr,
        name: meta?.name ?? 'Klik Launch',
        ticker: meta?.ticker ?? '???',
        createdAt: ts,
        holders: meta?.holders,
        imageUrl: meta?.imageUrl,
      });
    }
    for (const log of purchased) {
      // TokenPurchased(address buyer, address tokenOut, uint256 ethSpent, uint256 tokensReceived)
      try {
        const data = log.data.replace(/^0x/, '');
        const tokenOut = ('0x' + data.slice(64 + 24, 128)).toLowerCase();
        const eth = Number(BigInt('0x' + data.slice(128, 192))) / 1e18;
        const ts = log.timeStamp ? parseInt(log.timeStamp, 16) : Math.floor(Date.now() / 1000);
        activity.push({
          ts,
          token: tokenOut,
          ticker: launches.get(tokenOut)?.ticker,
          side: 'buy',
          eth,
          usd: eth * ethUsd,
        });
      } catch {
        /* skip */
      }
    }
    cursor = latest;
  }

  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  for (const [k, l] of launches) if (l.createdAt < weekAgo) launches.delete(k);
  while (activity.length > 40) activity.shift();

  return {
    launches: [...launches.values()].sort((a, b) => b.createdAt - a.createdAt),
    klikAddresses: new Set(launches.keys()),
    activity: [...activity].sort((a, b) => b.ts - a.ts),
  };
}
