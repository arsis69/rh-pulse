// Live feed cache + aggregation. Module-level singleton: one server process polls upstreams,
// every viewer (and the analyze route) reads from here.
// Module-level cache keeps GeckoTerminal within its ~30 req/min budget regardless of viewers.
import { Token, TradeEvent, FeedPayload, LLMAnalysis } from '@/lib/types';
import { fetchNewPools, fetchDexPools, fetchTokenInfo, GTTokenInfo } from '@/lib/gecko';
import { fetchDexScreenerTokenInfo } from '@/lib/dexscreener';
import { refreshFlap, FlapSnapshot } from '@/lib/flap';
import { refreshKlik, KlikSnapshot } from '@/lib/klik';
import { analyzeToken } from '@/lib/llm';
import { getAnalysis, saveAnalysis } from '@/lib/supabase';
import { isBlacklistedToken, computeTrustScore, applyActivityBoost } from '@/lib/score';
import { getSmartMoneySet } from '@/lib/smartMoney';
import { proxiedImageUrl } from '@/lib/imageProxy';

const GECKO_TTL = 30_000; // slow down to stay inside GT ~30 req/min free tier
const DEX_TTL = 30_000; // per-dex top-up (virtuals/bankr/pons) — must catch launches GT's newest list churns past
const CHAIN_TTL = 6_000;
const ETH_TTL = 60_000;
const DRAIN_MIN_INTERVAL = 8_000; // enrichment fires on the heartbeat cadence, not per viewer request
const IPFS_PER_REFRESH = 16;
const CHAIN_META_PER_REFRESH = 5; // Blockscout is generous; supply+holders lookups
// launch bursts hit ~15 tokens/min on this chain — at 60 a card lived ~4 minutes
// before being flushed, so a "10 minutes ago" launch was already invisible
const MAX_TOKENS = 180;
const SEEN_GECKO_MAX = 400;
// cloudflare-ipfs.com is dead (sunset 2024) and pinata's public gateway rate-limits hard — keep it last
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

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
  // every gecko pool token ever seen this process — GT's newest list only covers
  // ~1 minute on this chain (pons spam), so quiet launchpads (virtuals/bankr)
  // churn out of the snapshot before viewers ever see them. Accumulate instead.
  seenGecko: Map<string, Token>;
  drainAt: number;
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
  chainMeta: Map<string, { supply?: number; holders?: number } | null>;
  chainMetaQueue: string[];
  analyses: Map<string, LLMAnalysis | null>; // null = known-missing in DB, analyze pending
  analyzeBusy: boolean;
  // whale/smart-money events retained separately — the rolling trade tape churns
  // in seconds on this chain, so rare big buys must not be flushed with it
  whaleEvents: Map<string, TradeEvent>;
}

const state: CacheState = {
  geckoTokens: [],
  geckoAt: 0,
  geckoInflight: null,
  dexTokens: [],
  dexAt: 0,
  seenGecko: new Map(),
  drainAt: 0,
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
  chainMeta: new Map(),
  chainMetaQueue: [],
  analyses: new Map(),
  analyzeBusy: false,
  whaleEvents: new Map(),
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

// seenGecko survives deploys on disk — otherwise every restart forgets the quiet
// launchpads until GT's volume-sorted per-dex list happens to resurface them.
const SEEN_CACHE_FILE = '.cache/seen-gecko.json';
let seenSaveAt = 0;
let seenLoaded = false;

async function loadSeenGecko() {
  try {
    const { readFile } = await import('fs/promises');
    const rows: Token[] = JSON.parse(await readFile(SEEN_CACHE_FILE, 'utf8'));
    for (const t of rows) if (!state.seenGecko.has(t.id)) state.seenGecko.set(t.id, t);
  } catch {
    /* first boot or unreadable cache */
  }
}

async function saveSeenGecko() {
  if (Date.now() - seenSaveAt < 60_000) return;
  seenSaveAt = Date.now();
  try {
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir('.cache', { recursive: true });
    await writeFile(SEEN_CACHE_FILE, JSON.stringify([...state.seenGecko.values()]));
  } catch {
    /* best effort */
  }
}

// Remember every pool GT has ever shown us: fresh sightings replace old entries
// (updated stats), unseen ones survive list churn so cards don't vanish.
// Quiet launchpads are never evicted by the cap — pons spam (~30 pools/min)
// would otherwise flush a virtuals launch out of memory within minutes.
const PROTECTED_LAUNCHPADS = new Set(['virtuals', 'bankr']);
function absorbGecko(tokens: Token[]) {
  for (const t of tokens) state.seenGecko.set(t.id, t);
  void saveSeenGecko();
  if (state.seenGecko.size <= SEEN_GECKO_MAX) return;
  const dayAgo = Date.now() / 1000 - 86400;
  for (const [k, v] of state.seenGecko) {
    if (v.createdAt < dayAgo && !PROTECTED_LAUNCHPADS.has(v.launchpad)) state.seenGecko.delete(k);
  }
  if (state.seenGecko.size <= SEEN_GECKO_MAX) return;
  const evictable = [...state.seenGecko.values()]
    .filter((t) => !PROTECTED_LAUNCHPADS.has(t.launchpad))
    .sort((a, b) => a.createdAt - b.createdAt); // oldest first
  for (const t of evictable) {
    if (state.seenGecko.size <= SEEN_GECKO_MAX) break;
    state.seenGecko.delete(t.id);
  }
}

async function refreshGecko() {
  if (Date.now() - state.geckoAt < GECKO_TTL) return;
  if (state.geckoInflight) return state.geckoInflight;
  state.geckoInflight = (async () => {
    try {
      // two pages ≈ 2 minutes of launches on this chain — one page churns in <60s
      const [p1, p2] = await Promise.allSettled([fetchNewPools(1), fetchNewPools(2)]);
      const all: Token[] = [];
      if (p1.status === 'fulfilled') all.push(...p1.value);
      if (p2.status === 'fulfilled') all.push(...p2.value);
      if (p1.status === 'rejected' && p2.status === 'rejected') throw new Error('GT new_pools failed');
      state.geckoTokens = all;
      absorbGecko(all);
      state.geckoAt = Date.now();
    } catch {
      // failure is usually a 429 — back off instead of hammering a rate limit
      state.geckoAt = Date.now() - GECKO_TTL + 15_000;
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
    const [virtuals, bankr, pons] = await Promise.allSettled([
      fetchDexPools('virtuals-robinhood'),
      fetchDexPools('bankr-robinhood'),
      fetchDexPools('pons-dot-family'),
    ]);
    const all: Token[] = [];
    if (virtuals.status === 'fulfilled') all.push(...virtuals.value);
    if (bankr.status === 'fulfilled') all.push(...bankr.value);
    if (pons.status === 'fulfilled') all.push(...pons.value);
    state.dexTokens = all;
    absorbGecko(all);
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

function attachScore(t: Token) {
  if (t.score !== undefined) return;
  t.score = computeTrustScore(t);
  t.scoreSource = 'heuristic';
}

async function drainInfoQueue() {
  // Prefer DexScreener batch calls: one request covers up to 30 tokens and does
  // not count against GeckoTerminal's tight free-tier rate limit.
  const batch = state.infoQueue.splice(0);
  const missing = batch.filter((addr) => !state.info.has(addr));
  if (missing.length === 0) return;

  const ds = await fetchDexScreenerTokenInfo(missing);
  for (const [addr, info] of ds) {
    state.info.set(addr, Object.keys(info).length ? info : null);
  }

  // Fallback to GeckoTerminal for tokens DexScreener doesn't know yet — one per
  // drain, max: pools polling already uses most of GT's ~30/min budget.
  const fallback = missing.filter((addr) => !ds.has(addr)).slice(0, 1);
  for (const addr of fallback) {
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
      for (const gateway of IPFS_GATEWAYS) {
        try {
          const res = await fetch(ipfsUrl(cid, gateway), { signal: AbortSignal.timeout(6_000), cache: 'no-store' });
          if (!res.ok) throw new Error(String(res.status));
          const m = await res.json();
          state.ipfs.set(addr, {
            imageUrl: m.image ? ipfsUrl(String(m.image), gateway) : undefined,
            twitter: m.twitter || undefined,
            telegram: m.telegram || undefined,
            website: m.website || undefined,
            description: m.description || undefined,
          });
          return;
        } catch {
          /* try next gateway */
        }
      }
      state.ipfs.set(addr, null); // all gateways failed — don't retry every cycle
    }),
  );
}

// On-chain token meta (real supply + holders) via Blockscout — GT's fdv_usd is
// often stale for brand-new pools, so mcap is computed as live price × supply.
async function drainChainMetaQueue() {
  const batch = state.chainMetaQueue.splice(0, CHAIN_META_PER_REFRESH);
  await Promise.all(
    batch.map(async (addr) => {
      if (state.chainMeta.has(addr)) return;
      try {
        const res = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${addr}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(6_000),
        });
        if (!res.ok) throw new Error(String(res.status));
        const t = await res.json();
        const decimals = parseInt(t.decimals) || 18;
        const supply = t.total_supply ? Number(BigInt(t.total_supply) / BigInt(10) ** BigInt(decimals)) : undefined;
        const holders = parseInt(t.holders_count);
        state.chainMeta.set(addr, {
          supply: Number.isFinite(supply) ? supply : undefined,
          holders: Number.isFinite(holders) ? holders : undefined,
        });
      } catch {
        state.chainMeta.delete(addr); // transient — requeue on next merge
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
        supply: l.supply,
        imageUrl: l.imageUrl,
        hasX: false,
        isCurve: false,
        scoreSource: null,
      });
    }
  }

  // gecko pools (accumulated across polls): real numbers win; keep attribution
  for (const g of state.seenGecko.values()) {
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
      supply: existing?.supply ?? g.supply,
      metaCid: existing?.metaCid,
    });
  }

  // collapse clone spam: bots relaunch the same curve token dozens of times
  // (e.g. 5× "Mimic" in 10 minutes) — keep the copy with real traction so the
  // board isn't wallpapered with identical dead cards
  const byClone = new Map<string, Token>();
  for (const t of byAddr.values()) {
    if (!t.isCurve) continue;
    const key = `${t.launchpad}:${t.ticker.toLowerCase()}:${t.name.toLowerCase()}`;
    const best = byClone.get(key);
    if (!best) {
      byClone.set(key, t);
      continue;
    }
    const winner =
      t.volume24h !== best.volume24h ? (t.volume24h > best.volume24h ? t : best) : t.createdAt > best.createdAt ? t : best;
    const loser = winner === t ? best : t;
    byClone.set(key, winner);
    byAddr.delete(loser.id);
  }

  let tokens = [...byAddr.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_TOKENS);

  // quiet launchpads launch rarely — guarantee each a few slots so their
  // filter pills always have content instead of being buried by flap/pons volume.
  // Collect ALL extras before truncating once: truncating per launchpad would
  // evict the previous launchpad's freshly appended extras from the tail.
  const RESERVED = 4;
  const inFeed = new Set(tokens.map((t) => t.id));
  const extras: Token[] = [];
  for (const lp of ['virtuals', 'bankr', 'klik'] as const) {
    const have = tokens.filter((t) => t.launchpad === lp).length;
    if (have >= RESERVED) continue;
    for (const t of [...byAddr.values()]
      .filter((t) => t.launchpad === lp && !inFeed.has(t.id) && !isBlacklistedToken(t.ticker))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, RESERVED - have)) {
      extras.push(t);
      inFeed.add(t.id);
    }
  }
  if (extras.length) tokens = [...tokens.slice(0, Math.max(tokens.length - extras.length, 0)), ...extras];

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
    // real supply + holders from chain; recompute mcap from live price since
    // GT fdv_usd is unreliable for fresh pools (e.g. stale 10M-supply values)
    if (t.source === 'gecko') {
      const cm = state.chainMeta.get(t.id);
      if (cm) {
        t.supply = cm.supply;
        t.holders = t.holders ?? cm.holders;
      } else if (!state.chainMetaQueue.includes(t.id)) {
        state.chainMetaQueue.push(t.id);
      }
      if (t.priceUsd && t.priceUsd > 0) {
        t.mcap = t.priceUsd * (t.supply ?? 1_000_000_000);
      }
    }

    t.hasX = Boolean(t.twitter);

    // serve images through our origin: Cloudflare edge-caches them and the
    // browser never touches slow / rate-limited IPFS gateways directly
    t.imageUrl = proxiedImageUrl(t.imageUrl);
    t.bannerUrl = proxiedImageUrl(t.bannerUrl);

    // fallback heuristic score when no GT score or LLM analysis exists
    attachScore(t);

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
  if (!seenLoaded) {
    seenLoaded = true;
    await loadSeenGecko();
  }
  await refreshEth();
  await Promise.all([refreshGecko(), refreshDexTopUps(), refreshChain()]);

  let tokens = mergeTokens().filter((t) => !isBlacklistedToken(t.ticker));

  // Enrichment runs on the heartbeat cadence, never per viewer request —
  // otherwise N viewers hammering /api/feed multiplies upstream calls and
  // burns the GT/LLM budget (feed reads stay cheap under load).
  if (Date.now() - state.drainAt >= DRAIN_MIN_INTERVAL) {
    state.drainAt = Date.now();
    await Promise.all([drainInfoQueue(), drainIpfsQueue(), drainChainMetaQueue()]);
    await loadKnownAnalyses(tokens);
    tokens = mergeTokens().filter((t) => !isBlacklistedToken(t.ticker)); // re-merge so fresh enrichment attaches
    kickAnalyzeDrip(tokens);
  }

  const [smartMoney] = await Promise.allSettled([getSmartMoneySet()]);
  const smartMoneySet = smartMoney.status === 'fulfilled' ? smartMoney.value : new Set<string>();

  const hourAgo = Date.now() / 1000 - 3600;
  // thresholds sized for this chain: flap curves are microcaps — a $400 buy IS a
  // whale here (the old $1000 bar fired ~never)
  const WHALE_USD = 400;
  const WHALE_ETH = 0.2;
  const flagged: TradeEvent[] = [...state.flap.activity, ...state.klik.activity]
    .sort((a, b) => b.ts - a.ts)
    .map((trade) => {
      if (trade.whale) return trade;
      const t = tokens.find((x) => x.id === trade.token.toLowerCase());

      // smart money = one of the top 30 holders of a top-30 coin
      const buyer = trade.address?.toLowerCase();
      if (buyer && smartMoneySet.has(buyer)) {
        return { ...trade, whale: { type: 'top_holder', context: 'smart money' } as const };
      }

      // whale = buy > 1% of total supply
      const isWhaleBuy =
        trade.side === 'buy' &&
        t &&
        t.supply &&
        t.supply > 0 &&
        trade.amount !== undefined &&
        trade.amount > t.supply * 0.01;
      if (isWhaleBuy) {
        return { ...trade, whale: { type: 'large_buy', context: '1% supply' } as const };
      }

      const isLarge = trade.usd >= WHALE_USD || trade.eth >= WHALE_ETH;
      const isNew = t && t.createdAt >= hourAgo;
      if (isLarge) {
        return {
          ...trade,
          whale: { type: 'large_buy', context: isNew ? 'new coin' : undefined } as const,
        };
      }
      return trade;
    });
  const activity = flagged.slice(0, 30);

  // retain whale events for 24h so rare signals stay visible instead of being
  // flushed with the trade tape within seconds
  const dayAgoSec = Date.now() / 1000 - 86400;
  for (const t of flagged) {
    if (!t.whale) continue;
    state.whaleEvents.set(`${t.ts}:${t.token}:${t.address}:${t.side}:${t.eth}`, t);
  }
  for (const [k, t] of state.whaleEvents) if (t.ts < dayAgoSec) state.whaleEvents.delete(k);
  const whales = [...state.whaleEvents.values()].sort((a, b) => b.ts - a.ts).slice(0, 50);

  const nowSec = Date.now() / 1000;
  for (const t of tokens) applyActivityBoost(t, activity, nowSec);

  const launches1h =
    state.flap.tokens.filter((t) => t.createdAt >= hourAgo).length +
    state.klik.launches.filter((l) => l.createdAt >= hourAgo).length +
    state.geckoTokens.filter((t) => t.createdAt >= hourAgo && t.launchpad !== 'flap').length;
  const hot = [...tokens].sort((a, b) => b.volume24h - a.volume24h)[0];

  return {
    tokens,
    activity,
    whales,
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
