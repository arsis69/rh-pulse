import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LLMAnalysis } from '@/lib/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// browser/client-side (anon, read-only via RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// server-side (service role — bypasses RLS; only import from API routes)
let serverClient: SupabaseClient | null = null;
export function getServerSupabase(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return null;
  if (!serverClient) serverClient = createClient(supabaseUrl, key, { auth: { persistSession: false } });
  return serverClient;
}

export interface CachedAnalysis extends LLMAnalysis {
  analyzedAt?: number; // epoch seconds — drives staleness/milestone re-analysis
  promptVersion?: number;
  facts?: Record<string, unknown>; // what the token looked like when described
}

// `prompt_version` is part of the cache key: without it a prompt change silently
// keeps serving text written by the old prompt (the `model` column had exactly
// this bug — written on every save, never read back).
export function rowToAnalysis(row: Record<string, unknown>): CachedAnalysis {
  return {
    risk: row.risk as LLMAnalysis['risk'],
    pros: (row.pros as string[]) || [],
    cons: (row.cons as string[]) || [],
    summary: (row.summary as string) || '',
    analyzedAt: row.analyzed_at ? Math.floor(new Date(row.analyzed_at as string).getTime() / 1000) : undefined,
    promptVersion: (row.prompt_version as number) ?? 0,
    facts: (row.facts as Record<string, unknown>) ?? undefined,
  };
}

export async function getAnalysis(address: string, promptVersion: number): Promise<CachedAnalysis | null> {
  const db = getServerSupabase();
  if (!db) return null;
  const { data } = await db
    .from('analyses')
    .select('*')
    .eq('address', address.toLowerCase())
    .eq('prompt_version', promptVersion)
    .maybeSingle();
  return data ? rowToAnalysis(data) : null;
}

export async function saveAnalysis(
  address: string,
  a: LLMAnalysis,
  model: string,
  promptVersion: number,
  facts?: Record<string, unknown>,
): Promise<void> {
  const db = getServerSupabase();
  if (!db) return;
  await db.from('analyses').upsert(
    {
      address: address.toLowerCase(),
      risk: a.risk,
      pros: a.pros,
      cons: a.cons,
      summary: a.summary,
      model,
      prompt_version: promptVersion,
      analyzed_at: new Date().toISOString(),
      facts: facts ?? null,
    },
    { onConflict: 'address,prompt_version' },
  );
}
