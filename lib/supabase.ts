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

export async function getAnalysis(address: string): Promise<LLMAnalysis | null> {
  const db = getServerSupabase();
  if (!db) return null;
  const { data } = await db.from('analyses').select('*').eq('address', address.toLowerCase()).maybeSingle();
  if (!data) return null;
  return {
    score: data.score,
    risk: data.risk,
    pros: data.pros || [],
    cons: data.cons || [],
    summary: data.summary || '',
  };
}

export async function saveAnalysis(address: string, a: LLMAnalysis, model: string): Promise<void> {
  const db = getServerSupabase();
  if (!db) return;
  await db.from('analyses').upsert({
    address: address.toLowerCase(),
    score: a.score,
    risk: a.risk,
    pros: a.pros,
    cons: a.cons,
    summary: a.summary,
    model,
  });
}
