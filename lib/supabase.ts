import { createClient } from '@supabase/supabase-js';

// TODO: Install with: npm install @supabase/supabase-js
// Create .env.local with:
// NEXT_PUBLIC_SUPABASE_URL=your-project-url
// NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Example: Save a token to Supabase (call this after fetching)
export async function saveTokenToSupabase(token: any) {
  if (!supabaseUrl) return; // Skip if not configured

  const { error } = await supabase
    .from('tokens')
    .upsert({
      address: token.address,
      ticker: token.ticker,
      name: token.name,
      launchpad: token.launchpad,
      liquidity: token.liquidity,
      mcap: token.mcap,
      llm_score: token.llmScore,
      updated_at: new Date().toISOString(),
    });

  if (error) console.error('Supabase save error:', error);
}

// Example: Subscribe to realtime updates (for live new tokens)
export function subscribeToNewTokens(callback: (payload: any) => void) {
  if (!supabaseUrl) return () => {};

  return supabase
    .channel('tokens')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tokens' }, callback)
    .subscribe();
}
