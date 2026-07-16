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
  priceUsd?: number;
  txns24h?: number;
  holders?: number;
  sparkline?: number[]; // relative price points, oldest → newest
  imageUrl?: string;
  bannerUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
  gtScore?: number; // GeckoTerminal trust score 0-100
  score?: number; // 0-100, only from a real source
  scoreSource?: 'gt' | 'llm' | null;
  hasX: boolean;
  isCurve?: boolean; // still on bonding curve (pre-DEX)
}

export interface TradeEvent {
  ts: number;
  token: string;
  ticker?: string;
  side: 'buy' | 'sell';
  eth: number;
  usd: number;
}

export interface FeedStats {
  launches24h: number;
  totalVol24h: number;
  ethUsd: number;
}

export interface FeedPayload {
  tokens: Token[];
  activity: TradeEvent[];
  stats: FeedStats;
  serverTime: number;
}

export interface LLMAnalysis {
  score: number;
  risk: 'Low' | 'Medium' | 'High';
  pros: string[];
  cons: string[];
  summary: string;
}

// age helper derived from createdAt so cards can tick live
export function ageMinutes(t: Token, now = Date.now()): number {
  return Math.max(Math.round((now / 1000 - t.createdAt) / 60), 0);
}
