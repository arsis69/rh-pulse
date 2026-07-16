// Server-only: called from /api/analyze. Key stays in env, never in the client bundle.
import { Token, LLMAnalysis, ageMinutes } from '@/lib/types';

const BASE_URL = 'https://madjames.bond/v1';
const MODEL = 'grok-4.5-low'; // low reasoning effort: fast + cheap, plenty for this

export async function analyzeToken(token: Token, holders?: number): Promise<LLMAnalysis> {
  const apiKey = process.env.MADJAMES_API_KEY;
  if (!apiKey) throw new Error('MADJAMES_API_KEY not configured');

  const facts = [
    `Ticker: $${token.ticker}`,
    `Name: ${token.name}`,
    `Launchpad: ${token.launchpad}${token.isCurve ? ' (still on bonding curve)' : ' (trading on DEX)'}`,
    `Age: ${ageMinutes(token)} minutes`,
    `Liquidity: $${Math.round(token.liquidity)}${token.isCurve ? ' (curve estimate)' : ''}`,
    `Market cap (FDV): $${Math.round(token.mcap)}`,
    `Volume 24h: $${Math.round(token.volume24h)}`,
    token.txns24h !== undefined ? `Trades 24h: ${token.txns24h}` : null,
    holders !== undefined ? `Holders: ${holders}` : null,
    token.gtScore !== undefined ? `GeckoTerminal trust score: ${token.gtScore}/100` : null,
    `Has Twitter/X: ${token.twitter ? `yes (@${token.twitter})` : 'no'}`,
    token.telegram ? `Telegram: ${token.telegram}` : null,
    token.website ? `Website: ${token.website}` : null,
    token.description ? `Description: ${token.description.slice(0, 400)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `You are a ruthless memecoin risk analyst. Analyze this brand-new token on Robinhood Chain using ONLY the real data below. Do not invent facts.

${facts}

Reply with strict JSON:
{
  "score": <1-100, higher = more promising relative to typical fresh memecoins>,
  "risk": "Low" | "Medium" | "High",
  "pros": [<up to 3 short concrete points>],
  "cons": [<up to 3 short concrete points>],
  "summary": "<max 2 blunt sentences>"
}`;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      // generous cap: reasoning tokens count against it, and a truncated
      // response means an empty content field → failed analysis
      max_tokens: 10_000,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM empty response');

  const parsed = JSON.parse(content);
  const score = Math.min(Math.max(Math.round(Number(parsed.score)), 1), 100);
  const risk = ['Low', 'Medium', 'High'].includes(parsed.risk) ? parsed.risk : 'High';
  if (!Number.isFinite(score)) throw new Error('LLM bad score');

  return {
    score,
    risk,
    pros: (Array.isArray(parsed.pros) ? parsed.pros : []).slice(0, 3).map(String),
    cons: (Array.isArray(parsed.cons) ? parsed.cons : []).slice(0, 3).map(String),
    summary: String(parsed.summary || '').slice(0, 300),
  };
}
