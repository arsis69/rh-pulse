import { Token, ScoreBreakdown, ageMinutes } from '@/lib/types';
import { fmtUsd } from '@/lib/format';

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

// One definition of the bands — card, drawer and glow all read from here.
export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--color-up)';
  if (score >= 60) return 'var(--color-legendary)';
  if (score >= 40) return 'var(--color-pulse)';
  return 'var(--color-down)';
}

/**
 * Board calibration.
 *
 * The old scorer hardcoded Ethereum-sized thresholds (full marks at $50k volume,
 * 300 holders, $30k liquidity) on a chain whose best token does $15k and 79
 * holders — so every component sat near zero and 104 of 179 tokens tied at 8/100.
 * Instead, derive "full marks" from the live board itself, so it self-calibrates
 * as the chain grows and never needs re-tuning. Paired with absolute floors
 * below, since a board of ghosts must not make a mediocre token look great.
 */
export interface BoardStats {
  volume24hRef: number;
  volume1hRef: number;
  liquidityRef: number;
  holdersRef: number;
}

function pct(values: number[], p: number): number {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  return v[Math.min(Math.floor(v.length * p), v.length - 1)];
}

// These are "half marks" anchors for the curve in rel(), not full-marks bars —
// p75 of the tokens that have any activity at all.
export function computeBoardStats(board: Token[]): BoardStats {
  return {
    volume24hRef: pct(board.map((t) => t.volume24h ?? 0), 0.75),
    volume1hRef: pct(board.map((t) => t.volume1h ?? 0), 0.75),
    liquidityRef: pct(board.map((t) => t.liquidity ?? 0), 0.75),
    holdersRef: pct(board.map((t) => t.holders ?? 0), 0.75),
  };
}

/**
 * Diminishing-returns curve: value / (value + k), where k is the "half marks"
 * point. Never saturates, so bigger is ALWAYS better and two tokens can't tie
 * just for clearing a bar.
 *
 * The previous `min(1, value/ref)` clamped, which meant everything past the
 * reference scored identically — $8.3k of volume and $115k of volume both took
 * 25/25, and liquidity gave $6.5k and $14k the same 15/15. (The board really does
 * carry $115k tokens, so this wasn't hypothetical.) This curve gives 50% at k,
 * 67% at 2k, 91% at 10k and approaches but never reaches 100%: a genuinely huge
 * token still outranks a merely good one, at every scale, forever.
 *
 * k tracks the live board (p75 of tokens that have any) with an absolute floor,
 * so it self-calibrates upward as the chain grows.
 */
function rel(value: number, boardRef: number, floor: number): number {
  if (value <= 0) return 0;
  const k = Math.max(boardRef, floor);
  if (k <= 0) return 0;
  return value / (value + k);
}

/**
 * How much to discount Distribution for concentrated supply.
 *
 * Input is the top wallets' share of TOTAL supply (pools/curves excluded from the
 * numerator, included in the denominator), so a token still sitting in its curve
 * scores near 0% here and is simply judged on holder count instead.
 *
 * The old curve ran 1.0 at 40% down to ~0 at 95%, a 7.6x swing between two
 * tokens that were both just early. It bottoms out at 0.3 now, not 0, because
 * concentration alone shouldn't erase a token with real holders and volume —
 * a genuine whale (top1 > 50% of supply) is still capped hard at 45.
 */
// sub-1% concentration is normal for a token still mostly inside its curve
function fmtPct0(v: number): string {
  if (v > 0 && v < 1) return '<1%';
  return `${v.toFixed(0)}%`;
}

function concentrationMultiplier(top10Pct: number): number {
  const CLEAN = 20; // below this, genuinely well spread
  const HEAVY = 90; // at/above this, effectively one pocket
  const FLOOR = 0.3;
  const t = clamp01((top10Pct - CLEAN) / (HEAVY - CLEAN));
  return 1 - t * (1 - FLOOR);
}

// "Half marks" points for rel(). A token doing $1.2k of 24h volume on this chain
// is squarely mid-table and scores half of Traction; $8k scores ~87%, $115k ~99%.
const VOL24_FLOOR = 1_200;
const VOL1H_FLOOR = 500;
const LIQ_FLOOR = 4_000;
const HOLDERS_FLOOR = 12;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export interface ChainScore {
  score: number;
  parts: ScoreBreakdown[];
  flags: string[];
}

/**
 * Deterministic 0-100 score from live chain signals. Recomputed every heartbeat,
 * so unlike the old cached-forever LLM number it always reflects what the token
 * IS right now, not what it looked like in its first two seconds.
 */
export function computeChainScore(token: Token, board: BoardStats): ChainScore {
  const parts: ScoreBreakdown[] = [];
  const flags: string[] = [];
  let known = 0; // total weight of components we actually have data for

  /**
   * `value01 === undefined` means UNKNOWN, not zero.
   *
   * This distinction is the whole ballgame: the old scorer did `holders ?? 0`
   * and silently docked 30 points from any token whose holder fetch hadn't
   * landed yet, which on a 15-launch/minute chain was most of them. An unknown
   * component is dropped from the denominator instead, so a slow queue can
   * never look like bad news.
   */
  const add = (label: string, weight: number, value01: number | undefined, detail: string) => {
    if (value01 === undefined) {
      parts.push({ label, weight: 0, value: 0, detail });
      return;
    }
    known += weight;
    parts.push({ label, weight, value: Math.round(clamp01(value01) * weight), detail });
  };

  // ---- Traction (25): real money moving, recent weighted over cumulative
  const v24 = token.volume24h ?? 0;
  const v1 = token.volume1h ?? 0;
  const traction = clamp01(
    0.6 * rel(v1, board.volume1hRef, VOL1H_FLOOR) + 0.4 * rel(v24, board.volume24hRef, VOL24_FLOOR),
  );
  // Almost every token here is under an hour old, so 1h and 24h volume are the
  // same number — printing both read as "$1959 24h · $1959 1h". Only say it twice
  // when the two windows actually differ.
  // sub-dollar dust rendered as "$0.00 · all in the last hour" — same nonsense
  // the ticker tape used to print. Below a dollar, there is no volume to report.
  let tractionDetail = 'no volume';
  if (v24 >= 1) {
    tractionDetail = v1 >= v24 * 0.95 ? `${fmtUsd(v24)} · all in the last hour` : `${fmtUsd(v24)} 24h · ${fmtUsd(v1)} 1h`;
  } else if (v24 > 0) {
    tractionDetail = 'under $1 traded';
  }
  add('Traction', 25, traction, tractionDetail);

  // ---- Distribution (20): holder count, then punish concentration
  const holders = token.holders;
  const top10 = token.top10Pct;
  let dist: number | undefined;
  let distDetail = 'holders not fetched yet';
  if (holders !== undefined) {
    dist = rel(holders, board.holdersRef, HOLDERS_FLOOR);
    if (top10 !== undefined) dist *= concentrationMultiplier(top10);
    distDetail =
      top10 !== undefined
        ? `${holders} holders · top 10 wallets hold ${fmtPct0(top10)} of supply`
        : `${holders} holders`;
  }
  add('Distribution', 20, dist, distDetail);

  // ---- Progress / liquidity (15)
  const prog = token.isCurve
    ? clamp01((token.curveProgress ?? 0) / 25) // 25% to DEX is already exceptional here
    : rel(token.liquidity ?? 0, board.liquidityRef, LIQ_FLOOR);
  add(
    token.isCurve ? 'Curve progress' : 'Liquidity',
    15,
    prog,
    token.isCurve
      ? `${(token.curveProgress ?? 0).toFixed(2)}% of the way to DEX`
      : token.liquidity > 0
        ? `${fmtUsd(token.liquidity)} pooled`
        : 'no liquidity',
  );

  // ---- Buy pressure (15): replaces the old hidden +25 score mutation
  const hasSplit = token.buys24h !== undefined || token.sells24h !== undefined;
  const buys = token.buys24h ?? 0;
  const sells = token.sells24h ?? 0;
  const trades = buys + sells;
  let pressure: number | undefined;
  let pressureDetail = 'buy/sell split unavailable';
  if (hasSplit && trades > 0) {
    // Two saturating factors instead of two clamps: 19 trades at 84% buys and 84
    // trades at 74% buys both used to pin at 15/15. Conviction grows with the
    // sample (trades/(trades+10)), and the ratio has real headroom above 80%.
    const ratio = buys / trades; // 0.5 = balanced
    const ratioScore = clamp01((ratio - 0.35) / 0.55); // 35% buys = 0, 90% = 1
    const confidence = trades / (trades + 10); // 10 trades = half conviction
    pressure = ratioScore * confidence;
    pressureDetail = `${buys} buys / ${sells} sells`;
  } else if (v24 <= 0) {
    // genuinely known: nothing has traded at all
    pressure = 0;
    pressureDetail = 'no trades';
  }
  add('Buy pressure', 15, pressure, pressureDetail);

  // ---- Socials (15): quality, not "did the deployer paste a link"
  let social: number | undefined = 0;
  const x = token.xSignal;
  if (x?.own) social += 0.6;
  else if (x?.borrowed) social += 0.1; // riding someone else's tweet is near-worthless
  if (x?.blueVerified && x.own) social += 0.1;
  if ((x?.likes ?? 0) >= 50) social += 0.1;
  if (token.telegram) social += 0.1;
  if (token.website) social += 0.1;
  let socialDetail = 'no socials';
  if (x?.dead) socialDetail = 'X link is dead';
  else if (x?.own) socialDetail = `own X @${x.handle}`;
  else if (x?.borrowed) socialDetail = `borrowed @${x.handle}'s tweet`;
  else if (token.telegram || token.website) socialDetail = 'telegram/website only';
  else if (ageMinutes(token) < 5) {
    // socials arrive from IPFS/GT/DexScreener over the following minutes — a
    // brand-new token with nothing attached yet hasn't been checked, it hasn't
    // been found wanting. This race is why 35% of analyses said "no X" wrongly.
    social = undefined;
    socialDetail = 'socials not resolved yet';
  }
  add('Socials', 15, social, socialDetail);

  // ---- Deployer (10): serial cloners are the dominant pattern on this chain
  const launches = token.deployerLaunches ?? 0;
  let dep: number | undefined;
  let depDetail = 'deployer unknown';
  if (launches > 0) {
    dep = launches <= 1 ? 1 : clamp01(1 - (launches - 1) / 9);
    depDetail = launches === 1 ? 'first launch by this wallet' : `${launches} launches by this wallet`;
  }
  add('Deployer', 10, dep, depDetail);

  // Normalise over the components we could actually measure, so a token isn't
  // punished for our queues being behind.
  const earned = parts.reduce((s, p) => s + p.value, 0);
  let score = known > 0 ? (earned / known) * 100 : 0;

  // Confidence cap: normalising cuts both ways — a token we know ONE thing about
  // could otherwise ace that one thing and score 100. Certainty has to be earned,
  // so the ceiling rises with how much of the token we could actually measure.
  score = Math.min(score, 50 + known / 2);

  // ---- GT trust score folded in as a nudge when present, not as an override
  if (token.gtScore !== undefined) {
    score = Math.round(score * 0.85 + token.gtScore * 0.15);
    parts.push({ label: 'GT trust', weight: 15, value: Math.round(token.gtScore * 0.15), detail: `${token.gtScore}/100` });
  }

  // ---- Hard flags and caps -------------------------------------------------
  if (x?.dead) {
    flags.push('X link dead');
    score = Math.min(score, 35);
  }
  if (top10 !== undefined && (token.top1Pct ?? 0) > 50) {
    flags.push(`One wallet holds ${(token.top1Pct ?? 0).toFixed(0)}%`);
    score = Math.min(score, 45);
  }
  // Deliberately NOT flagged, though both were tried and measured:
  //  - "serial deployer": the MEDIAN wallet on this chain has launched 23 tokens.
  //    A warning on 57% of the board is noise; the graded Deployer component
  //    above already prices it in.
  //  - "creator tax": the buyTax/sellTax fields are dormant — every curve trade
  //    pays the same 1% platform fee whether the field says 0 or 1000 — and it
  //    fired on 64% of cards. Crying wolf on two thirds of the board trains
  //    users to ignore warnings that matter.
  // Flags are reserved for rare, severe, verified conditions.

  // ---- Absolute floor: the dead-board guard.
  // Percentile calibration alone would crown the best of 179 ghost tokens. A
  // token nobody has traded is not promising, however it ranks among ghosts.
  if (trades === 0 && v24 <= 0) score = Math.min(score, 20);
  if (holders !== undefined && holders <= 1 && v24 <= 0) score = Math.min(score, 12);
  if (ageMinutes(token) < 2 && v24 <= 0) score = Math.min(score, 15);

  return { score: Math.round(Math.min(100, Math.max(0, score))), parts, flags };
}
