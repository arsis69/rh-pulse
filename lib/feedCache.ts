// Live feed cache + aggregation. Module-level singleton: one server process polls upstreams,
// every viewer (and the analyze route) reads from here.
// Module-level cache keeps GeckoTerminal within its ~30 req/min budget regardless of viewers.
import { Token, TradeEvent, FeedPayload, ageMinutes } from '@/lib/types';
import { fetchNewPools, fetchDexPools, fetchTokenInfo, GTTokenInfo } from '@/lib/gecko';
import { fetchDexScreenerTokenInfo, fetchDexScreenerLatestProfiles } from '@/lib/dexscreener';
import { fetchOnChainMeta, OnChainMeta } from '@/lib/onchainMeta';
import { fetchVirtualsMeta, fetchClankerRecent, LaunchpadMeta } from '@/lib/launchpadMeta';
import { refreshFlap, FlapSnapshot, knownSymbol } from '@/lib/flap';
import { readSymbols } from '@/lib/onchain';
import { fetchHolderStats, HolderStats } from '@/lib/holderStats';
import { parseX, fetchTweet, classifyX, TweetInfo } from '@/lib/xMeta';
import { refreshKlik, KlikSnapshot } from '@/lib/klik';
import { analyzeToken, PROMPT_VERSION } from '@/lib/llm';
import { getAnalysis, saveAnalysis, rowToAnalysis, CachedAnalysis } from '@/lib/supabase';
import { isBlacklistedToken, computeChainScore, computeBoardStats } from '@/lib/score';
import { getSmartMoneySet } from '@/lib/smartMoney';
import { proxiedImageUrl, normalizeUpstream } from '@/lib/imageProxy';
import { getImage, isWarm } from '@/lib/imageCache';

const GECKO_TTL = 30_000; // slow down to stay inside GT ~30 req/min free tier
const DEX_TTL = 30_000; // per-dex top-up (virtuals/bankr/pons) — must catch launches GT's newest list churns past
const CHAIN_TTL = 6_000;
const ETH_TTL = 60_000;
const DS_INFO_TTL = 10 * 60_000; // DexScreener images/socials don't change often
const DS_PROFILE_TTL = 2 * 60_000; // latest profiles refresh every couple minutes
const ONCHAIN_META_PER_REFRESH = 8; // RPC calls are cheap but we still pace them
const DRAIN_MIN_INTERVAL = 8_000; // enrichment fires on the heartbeat cadence, not per viewer request
const IPFS_PER_REFRESH = 24;
const CHAIN_META_PER_REFRESH = 5; // Blockscout is generous; supply+holders lookups
const HOLDER_STATS_PER_REFRESH = 6; // concentration lookups — traction tokens only
const X_PER_REFRESH = 6; // tweet resolutions
// launch bursts hit ~15 tokens/min on this chain — at 60 a card lived ~4 minutes
// before being flushed, so a "10 minutes ago" launch was already invisible
const MAX_TOKENS = 180;
const SEEN_GECKO_MAX = 400;
const ANALYSIS_GRACE_SEC = 90; // safety valve: never hide a card longer than this waiting on the LLM
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
  holderStats: Map<string, HolderStats | null>;
  holderQueue: string[];
  xInfo: Map<string, TweetInfo | null>; // keyed by status id
  xQueue: string[];
  analyses: Map<string, CachedAnalysis | null>; // null = claimed, analysis in flight
  reanalyzing: Set<string>; // milestone refresh in flight — old text stays visible
  analyzeInflight: number;
  analyzeCandidates: Token[];
  analyzeFailAt: Map<string, number>;
  analyzeErrors: string[];
  // whale/smart-money events retained separately — the rolling trade tape churns
  // in seconds on this chain, so rare big buys must not be flushed with it
  whaleEvents: Map<string, TradeEvent>;
  symbolCache: Map<string, string>; // address → ticker, for trades on tokens outside the feed
  prewarmQueue: string[]; // upstream image refs to pull into the cache before viewers ask
  lastTokens: Token[]; // ungated merged view (pre analysis-gate), for /api/analyze lookups
  dsInfo: Map<string, GTTokenInfo | null>; // DexScreener image/social enrichment
  dsInfoAt: number;
  dsProfiles: Map<string, GTTokenInfo | null>; // DexScreener latest-profiles cache
  dsProfilesAt: number;
  onchainMeta: Map<string, OnChainMeta | null>;
  onchainMetaQueue: string[];
  // launchpad-native metadata (fastest source): virtuals per-token API + clanker rolling list
  virtualsMeta: Map<string, LaunchpadMeta | null>; // null = asked, not there yet
  virtualsNegAt: Map<string, number>;
  virtualsQueue: string[];
  clankerMap: Map<string, LaunchpadMeta>;
  clankerAt: number;
  infoNegAt: Map<string, number>; // GT/DS "no info" answers expire — young tokens get re-checked
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
  holderStats: new Map(),
  holderQueue: [],
  xInfo: new Map(),
  xQueue: [],
  analyses: new Map(),
  reanalyzing: new Set(),
  analyzeInflight: 0,
  analyzeCandidates: [],
  analyzeFailAt: new Map(),
  analyzeErrors: [],
  whaleEvents: new Map(),
  symbolCache: new Map(),
  prewarmQueue: [],
  lastTokens: [],
  dsInfo: new Map(),
  dsInfoAt: 0,
  dsProfiles: new Map(),
  dsProfilesAt: 0,
  onchainMeta: new Map(),
  onchainMetaQueue: [],
  virtualsMeta: new Map(),
  virtualsNegAt: new Map(),
  virtualsQueue: [],
  clankerMap: new Map(),
  clankerAt: 0,
  infoNegAt: new Map(),
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

// The score is deterministic and recomputed from the live board every merge, so
// it always reflects the token's current state. The LLM no longer supplies it.
function attachScores(tokens: Token[]) {
  const board = computeBoardStats(tokens);
  for (const t of tokens) {
    const { score, parts, flags } = computeChainScore(t, board);
    t.score = score;
    t.scoreParts = parts;
    t.scoreFlags = flags;
    t.scoreSource = 'chain';
  }
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
          const imageUrl = m.image ? ipfsUrl(String(m.image), gateway) : undefined;
          state.ipfs.set(addr, {
            imageUrl,
            twitter: m.twitter || undefined,
            telegram: m.telegram || undefined,
            website: m.website || undefined,
            description: m.description || undefined,
          });
          // warm the thumbnail NOW — waiting for the next prewarm cycle left
          // brand-new cards (the ones everyone watches) blank for an extra beat
          const up = normalizeUpstream(imageUrl);
          if (up) void getImage(up, 256);
          return;
        } catch {
          /* try next gateway */
        }
      }
      state.ipfs.set(addr, null); // all gateways failed — don't retry every cycle
    }),
  );
}

async function drainOnchainMetaQueue() {
  const batch = state.onchainMetaQueue.splice(0, ONCHAIN_META_PER_REFRESH);
  await Promise.all(
    batch.map(async (addr) => {
      if (state.onchainMeta.has(addr)) return;
      const meta = await fetchOnChainMeta(addr);
      state.onchainMeta.set(addr, meta);
      if (meta?.imageUrl) {
        const up = normalizeUpstream(meta.imageUrl);
        if (up) void getImage(up, 256);
      }
    }),
  );
}

// Holder concentration. Budgeted per cycle and only for tokens with traction:
// a ghost clone with one holder needs no distribution analysis, and the board is
// mostly ghosts.
async function drainHolderQueue() {
  const batch = state.holderQueue.splice(0, HOLDER_STATS_PER_REFRESH);
  await Promise.all(
    batch.map(async (addr) => {
      const t = state.lastTokens.find((x) => x.id === addr);
      const stats = await fetchHolderStats(addr, t?.poolAddress);
      if (stats) state.holderStats.set(addr, stats);
      else state.holderStats.delete(addr); // transient — retry next merge
    }),
  );
}

// Resolve linked tweets. Failures stay `undefined` (unknown), never `dead` —
// if X blocks us we must not start branding every token a fake social.
async function drainXQueue() {
  const batch = state.xQueue.splice(0, X_PER_REFRESH);
  await Promise.all(
    batch.map(async (id) => {
      const info = await fetchTweet(id);
      if (info) state.xInfo.set(id, info);
      else state.xInfo.delete(id);
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

// virtuals' own API is the only place their art exists in the first minutes —
// look tokens up one by one, retry misses (API can lag creation by a moment)
const VIRTUALS_PER_DRAIN = 2;
async function drainVirtualsQueue() {
  const batch = state.virtualsQueue.splice(0, VIRTUALS_PER_DRAIN);
  await Promise.all(
    batch.map(async (addr) => {
      const meta = await fetchVirtualsMeta(addr);
      state.virtualsMeta.set(addr, meta);
      if (!meta) {
        state.virtualsNegAt.set(addr, Date.now());
        return;
      }
      const up = normalizeUpstream(meta.imageUrl);
      if (up) void getImage(up, 256); // warm immediately
    }),
  );
}

const CLANKER_TTL = 90_000;
async function refreshClankerMap() {
  if (Date.now() - state.clankerAt < CLANKER_TTL) return;
  state.clankerAt = Date.now();
  try {
    const recent = await fetchClankerRecent(2);
    for (const [addr, meta] of recent) state.clankerMap.set(addr, meta);
    // keep bounded — clanker launches are sparse enough that 400 covers days
    while (state.clankerMap.size > 400) {
      const oldest = state.clankerMap.keys().next().value;
      if (oldest === undefined) break;
      state.clankerMap.delete(oldest);
    }
  } catch {
    /* retry next TTL */
  }
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
    const { data } = await db
      .from('analyses')
      .select('*')
      .in('address', missing)
      .eq('prompt_version', PROMPT_VERSION);
    for (const row of data || []) state.analyses.set(row.address, rowToAnalysis(row));
  } catch {
    /* retry next cycle */
  }
}

// Server-side auto-analysis worker pool. Cards must reach the board already
// analyzed, so throughput has to beat the launch rate (~15/min): one job per
// 8s cycle (the old drip) could never catch up and left most cards unanalyzed.
// Workers re-pump themselves on completion instead of waiting for the next cycle.
const ANALYZE_CONCURRENCY = 6;
const ANALYZE_RETRY_MS = 60_000; // don't hammer the LLM on a failing token
const MODEL_TAG = 'grok-4.5-low';

// What the token looked like when we last described it. Stored with the analysis
// so we can tell whether the words are still true.
function factsSnapshot(t: Token): Record<string, unknown> {
  return {
    volume24h: Math.round(t.volume24h ?? 0),
    holders: t.holders ?? 0,
    curveProgress: Number((t.curveProgress ?? 0).toFixed(3)),
    hasSocials: Boolean(t.twitter || t.telegram || t.website),
    ageMin: ageMinutes(t),
  };
}

/**
 * Milestone re-analysis.
 *
 * Analyses used to be written seconds after launch and cached forever, so the
 * busiest token on the chain ($15k volume, 41 min old) permanently read "only 2
 * minutes old, zero volume, likely rug", and 35% of tokens with an X account were
 * described as having none because enrichment hadn't landed yet. Re-describe a
 * token only when it has materially changed — ghosts never re-run, so the ~15
 * launches/min of clone spam cost nothing.
 */
function isStale(t: Token, cached: CachedAnalysis): boolean {
  const f = (cached.facts ?? {}) as Record<string, number | boolean | undefined>;
  const prevVol = Number(f.volume24h ?? 0);
  const prevHolders = Number(f.holders ?? 0);
  const prevCurve = Number(f.curveProgress ?? 0);
  const prevSocials = Boolean(f.hasSocials);
  const age = ageMinutes(t);
  const analyzedAgeMin = cached.analyzedAt ? (Date.now() / 1000 - cached.analyzedAt) / 60 : Infinity;

  // socials arrived after we said it had none — the single biggest source of
  // factually wrong analyses
  if (!prevSocials && (t.twitter || t.telegram || t.website)) return true;
  // it actually started trading
  if ((t.volume24h ?? 0) >= 1_000 && prevVol < 1_000) return true;
  if ((t.volume24h ?? 0) > prevVol * 5 && (t.volume24h ?? 0) > 200) return true;
  if ((t.holders ?? 0) >= 25 && prevHolders < 25) return true;
  if ((t.curveProgress ?? 0) - prevCurve >= 10) return true;
  // one cheap pass once it's old enough for the data to have arrived, but only
  // if it's alive — a ghost token at 10 minutes is still a ghost
  if (age >= 10 && analyzedAgeMin >= 8 && (t.volume24h ?? 0) > 0 && Number(f.ageMin ?? 0) < 5) return true;
  return false;
}

function pumpAnalyze() {
  while (state.analyzeInflight < ANALYZE_CONCURRENCY) {
    const ready = (t: Token) => Date.now() - (state.analyzeFailAt.get(t.id) ?? 0) > ANALYZE_RETRY_MS;
    // First analyses win: a card must never reach the board unanalyzed. Stale
    // refreshes fill the spare capacity behind them.
    let next = state.analyzeCandidates.find((t) => !state.analyses.has(t.id) && ready(t));
    let refresh = false;
    if (!next) {
      next = state.analyzeCandidates.find((t) => {
        if (state.reanalyzing.has(t.id) || !ready(t)) return false;
        const a = state.analyses.get(t.id);
        return Boolean(a) && isStale(t, a as CachedAnalysis);
      });
      refresh = Boolean(next);
    }
    if (!next) return;
    const token = next;
    // Claim before any await so parallel workers can't collide. A refresh keeps
    // the existing text on the card while it re-runs — never blank a live card.
    if (refresh) state.reanalyzing.add(token.id);
    else state.analyses.set(token.id, null);
    state.analyzeInflight++;
    void (async () => {
      try {
        if (!refresh) {
          const cached = await getAnalysis(token.id, PROMPT_VERSION);
          if (cached && !isStale(token, cached)) {
            state.analyses.set(token.id, cached);
            return;
          }
        }
        const analysis = await analyzeToken(token, token.holders);
        state.analyses.set(token.id, {
          ...analysis,
          analyzedAt: Date.now() / 1000,
          promptVersion: PROMPT_VERSION,
          facts: factsSnapshot(token),
        });
        await saveAnalysis(token.id, analysis, MODEL_TAG, PROMPT_VERSION, factsSnapshot(token));
      } catch (e) {
        if (!refresh) state.analyses.delete(token.id);
        state.analyzeFailAt.set(token.id, Date.now());
        state.analyzeErrors.push(`${token.ticker}: ${e instanceof Error ? e.message : String(e)}`);
        if (state.analyzeErrors.length > 20) state.analyzeErrors.shift();
      } finally {
        state.reanalyzing.delete(token.id);
        state.analyzeInflight--;
        pumpAnalyze();
      }
    })();
  }
}

// newest first: the cards people actually watch get analyzed before they land
function kickAnalyzeDrip(tokens: Token[]) {
  state.analyzeCandidates = [...tokens].sort((a, b) => b.createdAt - a.createdAt);
  pumpAnalyze();
}

export function getAnalyzeDebug() {
  let claimed = 0;
  let done = 0;
  for (const v of state.analyses.values()) v === null ? claimed++ : done++;
  return {
    inflight: state.analyzeInflight,
    candidates: state.analyzeCandidates.length,
    claimed,
    done,
    failed: state.analyzeFailAt.size,
    lastErrors: state.analyzeErrors.slice(-5),
  };
}

export function setAnalysisInCache(address: string, analysis: CachedAnalysis) {
  state.analyses.set(address.toLowerCase(), {
    ...analysis,
    analyzedAt: analysis.analyzedAt ?? Date.now() / 1000,
    promptVersion: analysis.promptVersion ?? PROMPT_VERSION,
  });
}

async function refreshDexScreenerProfiles() {
  if (Date.now() - state.dsProfilesAt < DS_PROFILE_TTL) return;
  const profiles = await fetchDexScreenerLatestProfiles();
  for (const [addr, info] of profiles) {
    state.dsProfiles.set(addr, info);
  }
  state.dsProfilesAt = Date.now();
}

async function enrichDexScreenerInfo(tokens: Token[]) {
  // DexScreener has the best token art/social index for RHChain. Only fetch
  // for tokens that still lack image metadata; cache and re-use between polls.
  const now = Date.now();
  if (now - state.dsInfoAt < DS_INFO_TTL && state.dsInfo.size > 0) {
    applyDsInfo(tokens);
    return;
  }
  const missing = tokens.filter((t) => !t.imageUrl || !t.bannerUrl).map((t) => t.id);
  if (!missing.length) return;

  const batchSize = 30;
  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += batchSize) batches.push(missing.slice(i, i + batchSize));

  const results = await Promise.all(batches.map((addrs) => fetchDexScreenerTokenInfo(addrs)));
  for (const batch of results) {
    for (const [addr, info] of batch) {
      state.dsInfo.set(addr.toLowerCase(), info);
    }
  }
  state.dsInfoAt = now;
  applyDsInfo(tokens);
}

function applyDsInfo(tokens: Token[]) {
  for (const t of tokens) {
    const info = state.dsInfo.get(t.id);
    if (!info) continue;
    if (!t.imageUrl && info.imageUrl) t.imageUrl = info.imageUrl;
    if (!t.bannerUrl && info.bannerUrl) t.bannerUrl = info.bannerUrl;
    // socials too, if GT didn't provide them
    if (!t.twitter && info.twitter) t.twitter = info.twitter;
    if (!t.telegram && info.telegram) t.telegram = info.telegram;
    if (!t.website && info.website) t.website = info.website;
    if (!t.description && info.description) t.description = info.description;
  }
}

async function mergeTokens(): Promise<Token[]> {
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

  // fill missing art from DexScreener before proxying
  await enrichDexScreenerInfo(tokens);

  const nowSec = Math.floor(Date.now() / 1000);
  for (const t of tokens) {
    // launchpad-native metadata — the only source with art in the first minutes
    if (t.launchpad === 'virtuals') {
      const vm = state.virtualsMeta.get(t.id);
      if (vm) {
        t.imageUrl = t.imageUrl ?? vm.imageUrl;
        t.twitter = t.twitter ?? vm.twitter;
        t.telegram = t.telegram ?? vm.telegram;
        t.website = t.website ?? vm.website;
        t.description = t.description ?? vm.description;
      } else if (vm === undefined && !state.virtualsQueue.includes(t.id)) {
        state.virtualsQueue.push(t.id);
      } else if (vm === null && t.createdAt > nowSec - 6 * 3600) {
        // their API can lag creation — retry young tokens every couple minutes
        const at = state.virtualsNegAt.get(t.id) ?? 0;
        if (Date.now() - at > 120_000 && !state.virtualsQueue.includes(t.id)) {
          state.virtualsMeta.delete(t.id);
          state.virtualsQueue.push(t.id);
        }
      }
    }
    const ck = state.clankerMap.get(t.id);
    if (ck) {
      t.imageUrl = t.imageUrl ?? ck.imageUrl;
      t.twitter = t.twitter ?? ck.twitter;
      t.website = t.website ?? ck.website;
      t.description = t.description ?? ck.description;
    }

    // GT token info (images/socials/gt_score for DEX tokens)
    const info = state.info.get(t.id);
    if (info) {
      t.imageUrl = t.imageUrl ?? info.imageUrl;
      t.bannerUrl = info.bannerUrl;
      t.twitter = t.twitter ?? info.twitter;
      t.telegram = t.telegram ?? info.telegram;
      t.website = t.website ?? info.website;
      t.description = t.description ?? info.description;
      // gtScore is now a component of the chain score, not a competing source
      t.gtScore = info.gtScore;
    } else if (info === undefined && t.source === 'gecko' && !state.infoQueue.includes(t.id)) {
      state.infoQueue.push(t.id);
    } else if (info === null && t.createdAt > nowSec - 6 * 3600) {
      // "no info" answers must expire for young tokens: GT/DS often publish an
      // image minutes AFTER our first ask — permanent caching meant those
      // images never arrived at all (this was bankr/virtuals' biggest gap)
      const at = state.infoNegAt.get(t.id) ?? 0;
      if (Date.now() - at > 120_000 && !state.infoQueue.includes(t.id)) {
        state.info.delete(t.id);
        state.infoNegAt.set(t.id, Date.now());
        state.infoQueue.push(t.id);
      }
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
    // GT fdv_usd is unreliable for fresh pools (e.g. stale 10M-supply values).
    // Only gecko tokens need the supply lookup (flap supply is a fixed 1B) —
    // holders for everything else come from the holder-stats drain below, which
    // prioritises tokens with traction instead of burning budget on ghosts.
    const cm = state.chainMeta.get(t.id);
    if (cm) {
      t.supply = t.supply ?? cm.supply;
      t.holders = t.holders ?? cm.holders;
    } else if (t.source === 'gecko' && !state.chainMetaQueue.includes(t.id)) {
      state.chainMetaQueue.push(t.id);
    }
    if (t.source === 'gecko' && t.priceUsd && t.priceUsd > 0) {
      t.mcap = t.priceUsd * (t.supply ?? 1_000_000_000);
    }

    // Holder concentration — only worth a call once a token has any traction
    const hs = state.holderStats.get(t.id);
    if (hs) {
      t.holders = t.holders ?? hs.holders;
      t.top1Pct = hs.top1Pct;
      t.top10Pct = hs.top10Pct;
    } else if (
      hs === undefined &&
      (t.volume24h > 0 || (t.holders ?? 0) > 2) &&
      !state.holderQueue.includes(t.id)
    ) {
      state.holderQueue.push(t.id);
    }

    // DexScreener latest profiles (rolling window of recently updated art)
    const dsProfile = state.dsProfiles.get(t.id);
    if (dsProfile) {
      t.imageUrl = t.imageUrl ?? dsProfile.imageUrl;
      t.bannerUrl = t.bannerUrl ?? dsProfile.bannerUrl;
      t.twitter = t.twitter ?? dsProfile.twitter;
      t.telegram = t.telegram ?? dsProfile.telegram;
      t.website = t.website ?? dsProfile.website;
      t.description = t.description ?? dsProfile.description;
    }

    // On-chain metadata (Pons-style tokens store logo + socials in the contract)
    const onchain = state.onchainMeta.get(t.id);
    if (onchain) {
      t.imageUrl = t.imageUrl ?? onchain.imageUrl;
      t.bannerUrl = t.bannerUrl ?? onchain.imageUrl;
      t.twitter = t.twitter ?? onchain.twitter;
      t.telegram = t.telegram ?? onchain.telegram;
      t.website = t.website ?? onchain.website;
      t.description = t.description ?? onchain.description;
      t.deployer = t.deployer ?? onchain.deployer;
    } else if (!t.imageUrl && !state.onchainMetaQueue.includes(t.id)) {
      state.onchainMetaQueue.push(t.id);
    }

    t.hasX = Boolean(t.twitter);

    // serve images through our origin as edge-cacheable webp thumbnails; queue
    // unseen art for prewarm so it's resident before the first viewer asks
    const originalImageUrl = t.imageUrl;
    const up = normalizeUpstream(originalImageUrl);
    if (up && !isWarm(up, 256) && !state.prewarmQueue.includes(up)) state.prewarmQueue.push(up);
    t.imageUrl = proxiedImageUrl(originalImageUrl, 256);
    t.bannerUrl = proxiedImageUrl(t.bannerUrl || originalImageUrl, 640);

    // attach the AI narrative — it explains the score, it no longer sets it
    const a = state.analyses.get(t.id);
    if (a) t.analysis = a;
  }

  attachXSignals(tokens); // must see the whole board to spot reused handles
  attachScores(tokens); // needs the whole board for percentile calibration
  return tokens;
}

/**
 * Borrowed-fame detection, free and API-less.
 *
 * 84 of 110 X links on this board point at someone else's tweet, and the same
 * handles recur across unrelated tokens (googlejapan x7, elonmusk x5, AP). A
 * handle cited by several different tokens provably belongs to none of them —
 * which is exactly why follower count would be the wrong signal to buy.
 */
function attachXSignals(tokens: Token[]) {
  const parsed = new Map<string, ReturnType<typeof parseX>>();
  const uses = new Map<string, Set<string>>();

  for (const t of tokens) {
    if (!t.twitter) continue;
    const p = parseX(t.twitter);
    if (!p?.handle) continue;
    parsed.set(t.id, p);
    const set = uses.get(p.handle) ?? new Set<string>();
    set.add(t.id);
    uses.set(p.handle, set);
  }

  for (const t of tokens) {
    const p = parsed.get(t.id);
    if (!p) continue;
    let tweet: TweetInfo | null = null;
    if (p.statusId) {
      const cached = state.xInfo.get(p.statusId);
      if (cached === undefined) {
        if (!state.xQueue.includes(p.statusId)) state.xQueue.push(p.statusId);
      } else {
        tweet = cached;
      }
    }
    t.xSignal = classifyX(p, tweet, t.ticker, t.name, uses.get(p.handle!)?.size ?? 1);
  }
}

// Whale trades often land on tokens that launched before our scan window, so the
// indexer never saw their TokenCreated log and the row read "$???". Resolve the
// ticker from the feed, then from the token contract itself, and remember it.
async function resolveWhaleTickers(whales: TradeEvent[], tokens: Token[]) {
  const missing = new Set<string>();
  for (const w of whales) {
    if (w.ticker) continue;
    const addr = w.token.toLowerCase();
    const known =
      state.symbolCache.get(addr) ??
      knownSymbol(addr) ??
      tokens.find((t) => t.id === addr)?.ticker ??
      state.seenGecko.get(addr)?.ticker;
    if (known) {
      state.symbolCache.set(addr, known);
      w.ticker = known;
    } else {
      missing.add(addr);
    }
  }
  if (!missing.size) return;
  const resolved = await readSymbols([...missing]);
  for (const [addr, sym] of resolved) state.symbolCache.set(addr, sym);
  for (const w of whales) {
    if (!w.ticker) w.ticker = state.symbolCache.get(w.token.toLowerCase());
  }
}

export async function buildFeedPayload(): Promise<FeedPayload> {
  if (!seenLoaded) {
    seenLoaded = true;
    await loadSeenGecko();
  }
  await refreshEth();
  await Promise.all([refreshGecko(), refreshDexTopUps(), refreshChain()]);

  let tokens = (await mergeTokens()).filter((t) => !isBlacklistedToken(t.ticker));

  // Enrichment runs on the heartbeat cadence, never per viewer request —
  // otherwise N viewers hammering /api/feed multiplies upstream calls and
  // burns the GT/LLM budget (feed reads stay cheap under load).
  if (Date.now() - state.drainAt >= DRAIN_MIN_INTERVAL) {
    state.drainAt = Date.now();
    await Promise.all([
      drainInfoQueue(),
      drainIpfsQueue(),
      drainOnchainMetaQueue(),
      drainChainMetaQueue(),
      drainHolderQueue(),
      drainXQueue(),
      drainVirtualsQueue(),
      refreshClankerMap(),
    ]);
    await refreshDexScreenerProfiles();
    await loadKnownAnalyses(tokens);
    tokens = (await mergeTokens()).filter((t) => !isBlacklistedToken(t.ticker)); // re-merge so fresh enrichment attaches
    kickAnalyzeDrip(tokens);
    // prewarm thumbnails in the background — never blocks the feed response
    const warmBatch = state.prewarmQueue.splice(0, 20);
    if (warmBatch.length) void Promise.allSettled(warmBatch.map((u) => getImage(u, 256)));
  }

  const [smartMoney] = await Promise.allSettled([getSmartMoneySet()]);
  const smartMoneySet = smartMoney.status === 'fulfilled' ? smartMoney.value : new Set<string>();

  const hourAgo = Date.now() / 1000 - 3600;
  // thresholds sized for this chain: flap curves are microcaps — a $400 buy IS a
  // whale here (the old $1000 bar fired ~never)
  const WHALE_USD = 400;
  const WHALE_ETH = 0.2;

  const supplyPct = (trade: TradeEvent, token?: Token): number | undefined => {
    const totalSupply = token?.supply ?? trade.supply;
    if (!totalSupply || totalSupply <= 0) return undefined;
    let amount = trade.amount;
    if (amount === undefined && token?.priceUsd && token.priceUsd > 0 && trade.usd > 0) {
      amount = trade.usd / token.priceUsd;
    }
    if (amount === undefined || amount <= 0) return undefined;
    return (amount / totalSupply) * 100;
  };

  const flagged: TradeEvent[] = [...state.flap.activity, ...state.klik.activity]
    .sort((a, b) => b.ts - a.ts)
    .map((trade) => {
      if (trade.whale) return trade;
      const t = tokens.find((x) => x.id === trade.token.toLowerCase());
      const pct = supplyPct(trade, t);

      // smart money = one of the top 30 holders of a top-30 coin
      const buyer = trade.address?.toLowerCase();
      if (buyer && smartMoneySet.has(buyer)) {
        return { ...trade, whale: { type: 'top_holder', context: 'smart money', pct } as const };
      }

      // whale = buy or sell > 1% of total supply
      const totalSupply = t?.supply ?? trade.supply;
      const isWhaleMove =
        totalSupply &&
        totalSupply > 0 &&
        trade.amount !== undefined &&
        Math.abs(trade.amount) > totalSupply * 0.01;
      if (isWhaleMove) {
        return { ...trade, whale: { type: 'large_buy', context: '1% supply', pct } as const };
      }

      const isLarge = trade.usd >= WHALE_USD || trade.eth >= WHALE_ETH;
      const isNew = t && t.createdAt >= hourAgo;
      if (isLarge) {
        return {
          ...trade,
          whale: { type: 'large_buy', context: isNew ? 'new coin' : undefined, pct } as const,
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
  await resolveWhaleTickers(whales, tokens);

  // applyActivityBoost used to add up to +25 here, in place, without touching
  // scoreSource — so a card labelled "AI score" showed a number the AI never
  // produced, driven by a 30-trade window it called 24h. Buy pressure is a
  // real component of computeChainScore now.

  const launches1h =
    state.flap.tokens.filter((t) => t.createdAt >= hourAgo).length +
    state.klik.launches.filter((l) => l.createdAt >= hourAgo).length +
    state.geckoTokens.filter((t) => t.createdAt >= hourAgo && t.launchpad !== 'flap').length;
  // Cards go live pre-analyzed: opening one must never show a spinner. The age
  // valve keeps the board from going blank if the LLM is down or backed up —
  // in normal operation the worker pool analyzes a launch within seconds.
  state.lastTokens = tokens;
  const visible = tokens.filter((t) => t.analysis || Date.now() / 1000 - t.createdAt > ANALYSIS_GRACE_SEC);
  const hot = [...visible].sort((a, b) => b.volume24h - a.volume24h)[0];

  return {
    tokens: visible,
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

// Snapshot for the analyze route: search the ungated list so a token still
// waiting on its first analysis is findable.
export async function getCachedToken(address: string): Promise<Token | undefined> {
  await buildFeedPayload();
  return state.lastTokens.find((t) => t.id === address.toLowerCase());
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
