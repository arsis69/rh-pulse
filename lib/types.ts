export type Launchpad =
  | 'flap'
  | 'virtuals'
  | 'bankr'
  | 'clanker'
  | 'hoodit'
  | 'nock'
  | 'pons'
  | 'klik'
  | 'other';

// What we can learn about a token's X link for free. Follower counts are NOT
// available without the paid API — and would be a trap anyway: most tokens link
// a famous account's meme tweet (googlejapan, elonmusk, AP) rather than their own.
export interface XSignal {
  handle?: string;
  own: boolean; // the link plausibly belongs to this project
  borrowed: boolean; // links someone else's tweet — several tokens cite the same handle
  dead: boolean; // link doesn't resolve — a fake social
  blueVerified?: boolean;
  likes?: number;
  tweetAgeSec?: number;
}

// Per-component contributions so the drawer can explain the number.
export interface ScoreBreakdown {
  label: string;
  value: number; // 0-100 contribution after weighting
  weight: number;
  detail: string;
}

// Narrative only — the score is deterministic and computed from chain data.
export interface LLMAnalysis {
  risk: 'Low' | 'Medium' | 'High';
  pros: string[];
  cons: string[];
  summary: string;
}

export interface Token {
  id: string; // lowercase token address
  address: string;
  ticker: string;
  name: string;
  launchpad: Launchpad;
  dexId?: string; // raw GeckoTerminal dex id when sourced from a DEX pool
  poolAddress?: string;
  source: 'gecko' | 'flap';
  createdAt: number; // epoch seconds — source of truth for age
  liquidity: number; // USD; for flap curve tokens this is a curve estimate
  mcap: number; // USD (fdv fallback)
  volume24h: number; // USD
  volume1h?: number; // USD in the last hour — real window, not a sample of recent trades
  priceUsd?: number;
  priceChange24h?: number; // percent; curve tokens: change since first trade
  priceChange1h?: number; // percent over the last hour
  txns24h?: number;
  buys24h?: number; // kept split from sells — sell-heavy tape is a dump signal
  sells24h?: number;
  holders?: number;
  top1Pct?: number; // largest holder's share of supply, pool/burn excluded
  top10Pct?: number;
  deployer?: string; // creator address from the launch event
  deployerLaunches?: number; // how many tokens this address has launched
  buyTax?: number; // percent; creator-set, currently NOT enforced on curve trades
  sellTax?: number;
  xSignal?: XSignal;
  supply?: number; // whole tokens, from chain
  sparkline?: number[]; // relative price points, oldest → newest
  imageUrl?: string;
  bannerUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
  gtScore?: number; // GeckoTerminal trust score 0-100
  score?: number; // 0-100, deterministic from live chain signals
  scoreSource?: 'chain' | 'gt' | null;
  scoreParts?: ScoreBreakdown[]; // why the score is what it is
  scoreFlags?: string[]; // hard warnings: dead social, extreme concentration…
  hasX: boolean;
  isCurve?: boolean; // still on bonding curve (pre-DEX)
  curveProgress?: number; // 0-100 toward DEX graduation, read from the Portal
  metaCid?: string; // IPFS metadata CID (flap launches)
  analysis?: LLMAnalysis; // attached server-side once analyzed
}

export interface WhaleMeta {
  type: 'top_holder' | 'large_buy';
  context?: string; // e.g. "top 30 $PEPE holder" or "new coin"
  pct?: number; // % of total supply bought/sold
}

export interface TradeEvent {
  ts: number;
  token: string;
  address?: string; // buyer/seller address when available
  ticker?: string;
  side: 'buy' | 'sell';
  eth: number;
  usd: number;
  amount?: number; // token units bought/sold when available
  supply?: number; // total supply at trade time, so pct can be computed even if token drops out of feed
  whale?: WhaleMeta;
}

export interface FeedStats {
  launches24h: number;
  launches1h: number;
  hottest: { ticker: string; volume24h: number; address: string } | null;
  ethUsd: number;
}

export interface FeedPayload {
  tokens: Token[];
  activity: TradeEvent[];
  whales: TradeEvent[]; // whale/smart-money events, retained 24h server-side
  stats: FeedStats;
  serverTime: number;
}

// age helper derived from createdAt so cards can tick live
export function ageMinutes(t: Token, now = Date.now()): number {
  return Math.max(Math.round((now / 1000 - t.createdAt) / 60), 0);
}
