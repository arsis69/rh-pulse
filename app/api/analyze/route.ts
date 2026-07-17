import { NextRequest, NextResponse } from 'next/server';
import { LLMAnalysis } from '@/lib/types';
import { getCachedToken, setAnalysisInCache } from '@/lib/feedCache';
import { analyzeToken, PROMPT_VERSION } from '@/lib/llm';
import { getAnalysis, saveAnalysis } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// one analysis per token globally: Supabase cache + in-flight dedupe
const inflight = new Map<string, Promise<LLMAnalysis>>();

// Each uncached analysis costs an LLM call, so cap what one client can trigger.
// Cache hits are never limited — browsing analyzed tokens stays free.
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 8; // fresh analyses per IP per window
const MAX_CONCURRENT_JOBS = 3; // global LLM concurrency
const rlHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rlHits.get(ip) || []).filter((t) => now - t < RL_WINDOW_MS);
  if (hits.length >= RL_MAX) {
    rlHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  rlHits.set(ip, hits);
  if (rlHits.size > 5_000) {
    for (const [k, v] of rlHits) if (v.every((t) => now - t >= RL_WINDOW_MS)) rlHits.delete(k);
  }
  return false;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    'unknown'
  );
}

async function buildFallbackToken(address: string) {
  try {
    const res = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${address}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return undefined;
    const t = await res.json();
    const holders = parseInt(t.holders_count);
    const token: import('@/lib/types').Token = {
      id: address,
      address,
      ticker: t.symbol || '???',
      name: t.name || 'Unknown',
      launchpad: 'other',
      source: 'gecko',
      createdAt: Math.floor(Date.now() / 1000),
      liquidity: 0,
      mcap: 0,
      volume24h: 0,
      holders: Number.isFinite(holders) ? holders : undefined,
      hasX: false,
      scoreSource: null,
    };
    return token;
  } catch {
    return undefined;
  }
}

async function fetchHolders(address: string): Promise<number | undefined> {
  try {
    const res = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${address}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return undefined;
    const n = parseInt((await res.json()).holders_count);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  let address: string;
  try {
    const body = await req.json();
    address = String(body.address || '').toLowerCase();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 });
  }

  const cached = await getAnalysis(address, PROMPT_VERSION);
  if (cached) return NextResponse.json({ analysis: cached, cached: true });

  const existing = inflight.get(address);
  if (existing) {
    const analysis = await existing.catch(() => null);
    if (analysis) return NextResponse.json({ analysis, cached: false });
    return NextResponse.json({ error: 'analysis failed' }, { status: 502 });
  }

  // only uncached, non-inflight analyses reach here — this is the path that spends money
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }
  if (inflight.size >= MAX_CONCURRENT_JOBS) {
    return NextResponse.json({ error: 'busy, retry shortly' }, { status: 429 });
  }

  // token may have scrolled out of the live feed — fall back to a minimal
  // on-chain snapshot so analysis still works instead of 404ing
  const token = (await getCachedToken(address)) ?? (await buildFallbackToken(address));
  if (!token) return NextResponse.json({ error: 'unknown token' }, { status: 404 });

  const job = (async () => {
    const holders = token.holders ?? (await fetchHolders(address));
    const analysis = await analyzeToken(token, holders);
    setAnalysisInCache(address, analysis);
    await saveAnalysis(address, analysis, 'grok-4.5-low', PROMPT_VERSION);
    return analysis;
  })();
  inflight.set(address, job);

  try {
    const analysis = await job;
    return NextResponse.json({ analysis, cached: false });
  } catch {
    return NextResponse.json({ error: 'analysis failed' }, { status: 502 });
  } finally {
    inflight.delete(address);
  }
}
