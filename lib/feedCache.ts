// Live feed cache + aggregation. Module-level singleton: one server process polls upstreams,
// every viewer (and the analyze route) reads from here.
// Module-level cache keeps GeckoTerminal within its ~30 req/min budget regardless of viewers.
import { Token, TradeEvent, FeedPayload } from '@/lib/types';
import { fetchNewPools, fetchTokenInfo, GTTokenInfo } from '@/lib/gecko';
import { refreshFlap, FlapSnapshot } from '@/lib/flap';
import { refreshKlik, KlikSnapshot } from '@/lib/klik';



const GECKO_TTL = 10_000;
const CHAIN_TTL = 6_000;
const ETH_TTL = 60_000;
const INFO_PER_REFRESH = 2; // ≤ ~12 info calls/min, inside GT budget
const MAX_TOKENS = 60;

interface CacheState {
  geckoTokens: Token[];
  geckoAt: number;
  geckoInflight: Promise<void> | null;
  flap: FlapSnapshot;
  klik: KlikSnapshot;
  chainAt: number;
  chainInflight: Promise<void> | null;
  ethUsd: number;
  ethAt: number;
  info: Map<string, GTTokenInfo | null>; // null = permanent miss recorded
  infoQueue: string[];
}

const state: CacheState = {
  geckoTokens: [],
  geckoAt: 0,
  geckoInflight: null,
  flap: { tokens: [], activity: [], launches24h: 0 },
  klik: { launches: [], klikAddresses: new Set(), activity: [] },
  chainAt: 0,
  chainInflight: null,
  ethUsd: 0,
  ethAt: 0,
  info: new Map(),
  infoQueue: [],
};

async function refreshEth() {
  if (Date.now() - state.ethAt < ETH_TTL && state.ethUsd > 0) return;
  try {
    const res = await fetch('https://robinhoodchain.blockscout.com/api/v2/stats', { cache: 'no-store' });
    const price = parseFloat((await res.json()).coin_price);
    if (Number.isFinite(price)) {
      state.ethUsd = price;
      state.ethAt = Date.now();
    }
  } catch {
    /* keep stale price */
  }
}

async function refreshGecko() {
  if (Date.now() - state.geckoAt < GECKO_TTL) return;
  if (state.geckoInflight) return state.geckoInflight;
  state.geckoInflight = (async () => {
    try {
      state.geckoTokens = await fetchNewPools();
      state.geckoAt = Date.now();
    } catch {
      /* keep stale list; stretch effective TTL on failure */
      state.geckoAt = Date.now() - GECKO_TTL + 5_000;
    } finally {
      state.geckoInflight = null;
    }
  })();
  return state.geckoInflight;
}

async function refreshChain() {
  if (Date.now() - state.chainAt < CHAIN_TTL) return;
  if (state.chainInflight) return state.chainInflight;
  state.chainInflight = (async () => {
    try {
      const [flap, klik] = await Promise.all([refreshFlap(state.ethUsd), refreshKlik(state.ethUsd)]);
      state.flap = flap;
      state.klik = klik;
      state.chainAt = Date.now();
    } catch {
      state.chainAt = Date.now() - CHAIN_TTL + 3_000;
    } finally {
      state.chainInflight = null;
    }
  })();
  return state.chainInflight;
}

async function drainInfoQueue() {
  const batch = state.infoQueue.splice(0, INFO_PER_REFRESH);
  for (const addr of batch) {
    if (state.info.has(addr)) continue;
    const info = await fetchTokenInfo(addr);
    if (info !== null) state.info.set(addr, Object.keys(info).length ? info : null);
    // transient failure: drop silently; token re-queues on next merge
  }
}

function mergeTokens(): Token[] {
  const byAddr = new Map<string, Token>();

  // flap curve tokens first
  for (const t of state.flap.tokens) byAddr.set(t.id, { ...t });

  // klik launches (metadata-only until GT indexes their v4 pool)
  for (const l of state.klik.launches) {
    if (!byAddr.has(l.address)) {
      byAddr.set(l.address, {
        id: l.address,
        address: l.address,
        ticker: l.ticker,
        name: l.name,
        launchpad: 'klik',
        source: 'flap',
        createdAt: l.createdAt,
        liquidity: 0,
        mcap: 0,
        volume24h: 0,
        holders: l.holders,
        imageUrl: l.imageUrl,
        hasX: false,
        isCurve: false,
        scoreSource: null,
      });
    }
  }

  // gecko pools: real numbers win; keep flap/klik attribution when known
  for (const g of state.geckoTokens) {
    const existing = byAddr.get(g.id);
    const launchpad = state.klik.klikAddresses.has(g.id)
      ? ('klik' as const)
      : existing?.launchpad === 'flap'
        ? ('flap' as const)
        : g.launchpad;
    byAddr.set(g.id, {
      ...existing,
      ...g,
      launchpad,
      createdAt: existing?.createdAt ?? g.createdAt, // launch time beats pool-creation time
      isCurve: false,
      imageUrl: g.imageUrl ?? existing?.imageUrl,
      holders: existing?.holders,
    });
  }

  const tokens = [...byAddr.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TOKENS);

  // enrich from info cache; queue unknowns
  for (const t of tokens) {
    const info = state.info.get(t.id);
    if (info) {
      t.imageUrl = t.imageUrl ?? info.imageUrl;
      t.bannerUrl = info.bannerUrl;
      t.twitter = info.twitter;
      t.telegram = info.telegram;
      t.website = info.website;
      t.description = info.description;
      t.gtScore = info.gtScore;
      if (info.gtScore !== undefined && t.scoreSource !== 'llm') {
        t.score = info.gtScore;
        t.scoreSource = 'gt';
      }
      t.hasX = Boolean(info.twitter);
    } else if (info === undefined && t.source === 'gecko' && !state.infoQueue.includes(t.id)) {
      state.infoQueue.push(t.id);
    }
  }
  return tokens;
}

export async function buildFeedPayload(): Promise<FeedPayload> {
  await refreshEth();
  await Promise.all([refreshGecko(), refreshChain()]);
  await drainInfoQueue();

  const tokens = mergeTokens();
  const activity: TradeEvent[] = [...state.flap.activity, ...state.klik.activity]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 30);

  return {
    tokens,
    activity,
    stats: {
      launches24h: state.flap.launches24h + state.klik.launches.length,
      totalVol24h: tokens.reduce((s, t) => s + t.volume24h, 0),
      ethUsd: state.ethUsd,
    },
    serverTime: Date.now(),
  };
}

// Snapshot for the analyze route: current merged view of one token.
export async function getCachedToken(address: string): Promise<Token | undefined> {
  const payload = await buildFeedPayload();
  return payload.tokens.find((t) => t.id === address.toLowerCase());
}
