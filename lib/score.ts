import { Token, TradeEvent, ageMinutes } from '@/lib/types';

const STABLE_WRAPPED_BLACKLIST = new Set([
  'WETH',
  'ETH',
  'USDC',
  'USDT',
  'USDG',
  'DAI',
  'USDE',
  'USDD',
  'FRAX',
  'WBTC',
  'BTC',
  'SOL',
  'WSOL',
  'MATIC',
  'WMATIC',
  'BNB',
  'WBNB',
  'AVAX',
  'WAVAX',
  'ARB',
  'LINK',
  'UNI',
  'SYRUPUSDG',
  'SUSDG',
]);

export function isBlacklistedToken(ticker: string): boolean {
  return STABLE_WRAPPED_BLACKLIST.has(ticker.toUpperCase());
}

// 0-100 score built only from real on-chain/social signals.
export function computeTrustScore(token: Token): number {
  let score = 0;

  // holders: up to 30 pts
  const holders = token.holders ?? 0;
  score += Math.min(30, (holders / 300) * 30);

  // volume 24h: up to 25 pts
  score += Math.min(25, (token.volume24h / 50_000) * 25);

  // liquidity: up to 20 pts
  score += Math.min(20, (token.liquidity / 30_000) * 20);

  // age: up to 10 pts
  const ageMin = ageMinutes(token);
  if (ageMin < 5) score += 2; // too fresh, risky
  else if (ageMin < 30) score += 10; // sweet spot
  else if (ageMin < 120) score += 6;
  else score += 3;

  // socials: up to 10 pts
  let social = 0;
  if (token.twitter) social += 4;
  if (token.telegram) social += 3;
  if (token.website) social += 3;
  score += social;

  // txns 24h: up to 5 pts
  const txns = token.txns24h ?? 0;
  score += Math.min(5, (txns / 200) * 5);

  return Math.round(Math.min(100, Math.max(0, score)));
}

// Boost trust score when smart money or whales have bought the token recently.
// Applied on top of the base score (heuristic, GT, or LLM) and capped at 100.
export function applyActivityBoost(token: Token, activity: TradeEvent[], nowSec: number) {
  const dayAgo = nowSec - 86400;
  let boost = 0;
  for (const t of activity) {
    if (t.token.toLowerCase() !== token.id) continue;
    if (t.side !== 'buy') continue;
    if ((t.ts ?? 0) < dayAgo) continue;

    if (t.whale?.type === 'top_holder') {
      boost += 15; // smart money
    } else if (t.whale?.type === 'large_buy' && t.whale.context === '1% supply') {
      boost += 10; // whale
    } else if (t.whale?.type === 'large_buy') {
      boost += 5; // large buy
    }
  }
  boost = Math.min(25, boost);
  if (boost > 0 && token.score !== undefined) {
    token.score = Math.min(100, Math.round(token.score + boost));
  }
}
