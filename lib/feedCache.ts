// Live feed cache + aggregation. Module-level singleton: one server process polls upstreams,
// every viewer (and the analyze route) reads from here.
// Module-level cache keeps GeckoTerminal within its ~30 req/min budget regardless of viewers.
import { Token, TradeEvent, FeedPayload, LLMAnalysis } from '@/lib/types';
import { fetchNewPools, fetchDexPools, fetchTokenInfo, GTTokenInfo } from '@/lib/gecko';
import { refreshFlap, FlapSnapshot } from '@/lib/flap';
import { refreshKlik, KlikSnapshot } from '@/lib/klik';
import { analyzeToken } from '@/lib/llm';
import { getAnalysis, saveAnalysis } from '@/lib/supabase';

const GECKO_TTL = 10_000;
const DEX_TTL = 45_000; // per-dex top-up (virtuals) changes slowly
const CHAIN_TTL = 6_000;
const ETH_TTL = 60_000;
const INFO_PER_REFRESH = 3;
const IPFS_PER_REFRESH = 4;
const MAX_TOKENS = 60;
const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://cloudflare-ipfs.com/ipfs/'];

interface IpfsMeta {
  imageUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
}

interface CacheState {
  geckoTokens: Token[];
  geckoAt: number;
  geckoInflight: Promise<void> | null;
  dexTokens: Token[];
  dexAt: number;
  flap: FlapSnapshot;
  klik: KlikSnapshot;
  chainAt: number;
  chainInflight: Promise<void> | null;
  ethUsd: number;
  ethAt: number;
  info: Map<string, GTTokenInfo | null>;
  infoQueue: string[];
  ipfs: Map<string, IpfsMeta | null>; // keyed by token address
  ipfsQueue: { addr: string; cid: string }[];
  analyses: Map<string, LLMAnalysis | null>; // null = known-missing in DB, analyze pending
  analyzeBusy: boolean;
}

const state: CacheState = {
  geckoTokens: [],
  geckoAt: 0,
  geckoInflight: null,
  dexTokens: [],
  dexAt: 0,
  flap: { tokens: [], activity: [], launches24h: 0 },
  klik: { launches: [], klikAddresses: new Set(), activity: [] },
  chainAt: 0,
  chainInflight: null,
  ethUsd: 0,
  ethAt: 0,
  info: new Map(),
  infoQueue: [],
  ipfs: new Map(),
  ipfsQueue: [],
  analyses: new Map(),
  analyzeBusy: false,
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
      state.geckoAt = Date.now() - GECKO_TTL + 5_000;
    } finally {
      state.geckoInflight = null;
    }
  })();
  return state.geckoInflight;
}

async function refreshDexTopUps() {
  if (Date.now() - state.dexAt < DEX_TTL) return;
  state.dexAt = Date.now();
  try {
    // launchpads too quiet for the network-wide newest list
    state.dexTokens = await fetchDexPools('virtuals-robinhood');
  } catch {
    /* keep stale */
  }
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
  }
}

function ipfsUrl(cidOrUrl: string, gateway = IPFS_GATEWAYS[0]): string {
  if (cidOrUrl.startsWith('http')) return cidOrUrl;
  return gateway + cidOrUrl.replace('ipfs://', '');
}

async function drainIpfsQueue() {
  const batch = state.ipfsQueue.splice(0, IPFS_PER_REFRESH);
  await Promise.all(
    batch.map(async ({ addr, cid }) => {
      if (state.ipfs.has(addr)) return;
      try {
        const res = await fetch(ipfsUrl(cid), { signal: AbortSignal.timeout(6_000), cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const m = await res.json();
        state.ipfs.set(addr, {
          imageUrl: m.image ? ipfsUrl(String(m.image)) : undefined,
          twitter: m.twitter || undefined,
          telegram: m.telegram || undefined,
          website: m.website || undefined,
          description: m.description || undefined,
        });
      } catch {
        state.ipfs.set(addr, null); // don't retry a dead CID every cycle
      }
    }),
  );
}

// Bulk-load existing analyses from Supabase for tokens we haven't seen yet —
// one query per cycle instead of one lookup per token.
let analysesLoadAt = 0;
async function loadKnownAnalyses(tokens: Token[]) {
  if (Date.now() - analysesLoadAt < 10_000) return;
  analysesLoadAt = Date.now();
  const missing = tokens.filter((t) => !state.analyses.has(t.id)).map((t) => t.id);
  if (missing.length === 0) return;
  try {
    const { getServerSupabase } = await import('@/lib/supabase');
    const db = getServerSupabase();
    if (!db) return;
    const { data } = await db.from('analyses').select('*').in('address', missing);
    for (const row of data || []) {
      state.analyses.set(row.address, {
        score: row.score,
        risk: row.risk,
        pros: row.pros || [],
        cons: row.cons || [],
        summary: row.summary || '',
      });
    }
  } catch {
    /* retry next cycle */
  }
}

// Server-side auto-analysis: one token per refresh cycle, newest first.
// Cards arrive pre-analyzed for every viewer; Supabase is the global cache.
function kickAnalyzeDrip(tokens: Token[]) {
  if (state.analyzeBusy) return;
  const next = tokens.find((t) => !state.analyses.has(t.id));
  if (!next) return;
  state.analyzeBusy = true;
  (async () => {
    try {
      const cached = await getAnalysis(next.id);
      if (cached) {
        state.analyses.set(next.id, cached);
        return;
      }
      state.analyses.set(next.id, null); // claimed
      const analysis = await analyzeToken(next, next.holders);
      state.analyses.set(next.id, analysis);
      await saveAnalysis(next.id, analysis, 'grok-4.5-low');
    } catch {
      state.analyses.delete(next.id); // retry on a later cycle
    } finally {
      state.analyzeBusy = false;
    }
  })();
}

export function setAnalysisInCache(address: string, analysis: LLMAnalysis) {
  state.analyses.set(address.toLowerCase(), analysis);
}

function mergeTokens(): Token[] {
  const byAddr = new Map<string, Token>();

  for (const t of state.flap.tokens) byAddr.set(t.id, { ...t });

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

  // gecko pools (network-newest + per-dex top-ups): real numbers win; keep attribution
  for (const g of [...state.geckoTokens, ...state.dexTokens]) {
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
      createdAt: existing?.createdAt ?? g.createdAt,
      isCurve: false,
      imageUrl: g.imageUrl ?? existing?.imageUrl,
      holders: existing?.holders,
      metaCid: existing?.metaCid,
    });
  }

  let tokens = [...byAddr.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TOKENS);

  // quiet launchpads (virtuals) launch rarely — guarantee them a few slots so
  // the filter pill always has content instead of being buried by flap volume
  const RESERVED = 4;
  if (!tokens.some((t) => t.launchpad === 'virtuals')) {
    const extras = [...byAddr.values()]
      .filter((t) => t.launchpad === 'virtuals')
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, RESERVED);
    if (extras.length) tokens = [...tokens.slice(0, MAX_TOKENS - extras.length), ...extras];
  }

  for (const t of tokens) {
    // GT token info (images/socials/gt_score for DEX tokens)
    const info = state.info.get(t.id);
    if (info) {
      t.imageUrl = t.imageUrl ?? info.imageUrl;
      t.bannerUrl = info.bannerUrl;
      t.twitter = t.twitter ?? info.twitter;
      t.telegram = t.telegram ?? info.telegram;
      t.website = t.website ?? info.website;
      t.description = t.description ?? info.description;
      t.gtScore = info.gtScore;
      if (info.gtScore !== undefined && t.scoreSource !== 'llm') {
        t.score = info.gtScore;
        t.scoreSource = 'gt';
      }
    } else if (info === undefined && t.source === 'gecko' && !state.infoQueue.includes(t.id)) {
      state.infoQueue.push(t.id);
    }

    // IPFS metadata (images/socials for flap curve tokens)
    if (t.metaCid) {
      const meta = state.ipfs.get(t.id);
      if (meta) {
        t.imageUrl = t.imageUrl ?? meta.imageUrl;
        t.twitter = t.twitter ?? meta.twitter;
        t.telegram = t.telegram ?? meta.telegram;
        t.website = t.website ?? meta.website;
        t.description = t.description ?? meta.description;
      } else if (meta === undefined && !state.ipfsQueue.some((q) => q.addr === t.id)) {
        state.ipfsQueue.push({ addr: t.id, cid: t.metaCid });
      }
    }
    t.hasX = Boolean(t.twitter);

    // attach AI analysis
    const a = state.analyses.get(t.id);
    if (a) {
      t.analysis = a;
      t.score = a.score;
      t.scoreSource = 'llm';
    }
  }
  return tokens;
}

export async function buildFeedPayload(): Promise<FeedPayload> {
  await refreshEth();
  await Promise.all([refreshGecko(), refreshDexTopUps(), refreshChain()]);
  await Promise.all([drainInfoQueue(), drainIpfsQueue()]);

  let tokens = mergeTokens();
  await loadKnownAnalyses(tokens);
  tokens = mergeTokens(); // re-merge so freshly loaded analyses attach
  kickAnalyzeDrip(tokens);

  const activity: TradeEvent[] = [...state.flap.activity, ...state.klik.activity]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 30);

  const hourAgo = Date.now() / 1000 - 3600;
  const launches1h =
    state.flap.tokens.filter((t) => t.createdAt >= hourAgo).length +
    state.klik.launches.filter((l) => l.createdAt >= hourAgo).length +
    state.geckoTokens.filter((t) => t.createdAt >= hourAgo && t.launchpad !== 'flap').length;
  const hot = [...tokens].sort((a, b) => b.volume24h - a.volume24h)[0];

  return {
    tokens,
    activity,
    stats: {
      launches24h: state.flap.launches24h + state.klik.launches.length,
      launches1h,
      hottest: hot && hot.volume24h > 0 ? { ticker: hot.ticker, volume24h: hot.volume24h, address: hot.address } : null,
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

// Background heartbeat: keep indexing + analyzing new launches even with zero
// viewers, so every card is already analyzed the moment someone opens the site.
const g = globalThis as typeof globalThis & { __rhPulseHeartbeat?: ReturnType<typeof setInterval> };
if (!g.__rhPulseHeartbeat && process.env.NEXT_PHASE !== 'phase-production-build') {
  g.__rhPulseHeartbeat = setInterval(() => {
    buildFeedPayload().catch(() => {});
  }, 8_000);
  g.__rhPulseHeartbeat.unref?.();
}
