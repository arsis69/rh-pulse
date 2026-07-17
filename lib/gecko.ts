// GeckoTerminal client — server-side only (imported by /api/feed).
// Free API, ~30 req/min: the feed route budgets calls, never the browser.
import { Token } from '@/lib/types';
import { dexToLaunchpad } from '@/lib/geckoShared';

const GT = 'https://api.geckoterminal.com/api/v2';
const NETWORK = 'robinhood';

interface GTPool {
  id: string;
  attributes: {
    name: string;
    address: string;
    reserve_in_usd: string | null;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    base_token_price_usd: string | null;
    pool_created_at: string;
    volume_usd: { h24: string | null; h1?: string | null };
    transactions: { h24?: { buys: number; sells: number } };
    price_change_percentage: Record<string, string | null>;
  };
  relationships: {
    base_token: { data: { id: string } };
    dex: { data: { id: string } };
  };
}

interface GTIncludedToken {
  id: string;
  attributes: { address: string; name: string; symbol: string; image_url: string | null };
}

const num = (v: string | null | undefined) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

// Reconstruct a 7-point relative price path from bucketed % changes — no extra API calls.
function synthSparkline(pct: Record<string, string | null>): number[] {
  const buckets = ['h24', 'h6', 'h1', 'm30', 'm15', 'm5'];
  const now = 1;
  const points = buckets.map((b) => {
    const p = num(pct?.[b]);
    return now / (1 + p / 100);
  });
  points.push(now);
  return points;
}

export async function fetchNewPools(page = 1): Promise<Token[]> {
  return fetchPoolsFrom(`${GT}/networks/${NETWORK}/new_pools?page=${page}&include=base_token`);
}

// Per-dex pools: guarantees low-traffic launchpads (e.g. virtuals) stay represented
// even when they don't crack the network-wide newest list.
export async function fetchDexPools(dexId: string): Promise<Token[]> {
  return fetchPoolsFrom(`${GT}/networks/${NETWORK}/dexes/${dexId}/pools?page=1&include=base_token`);
}

async function fetchPoolsFrom(url: string): Promise<Token[]> {
  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GT pools ${res.status}`);
  const json = await res.json();
  const included: GTIncludedToken[] = json.included || [];
  const tokenById = new Map(included.map((t) => [t.id, t]));

  const tokens: Token[] = [];
  for (const pool of (json.data || []) as GTPool[]) {
    const a = pool.attributes;
    const base = tokenById.get(pool.relationships.base_token.data.id);
    if (!base) continue;
    const address = base.attributes.address.toLowerCase();
    const dexId = pool.relationships.dex.data.id;
    tokens.push({
      id: address,
      address: base.attributes.address,
      ticker: base.attributes.symbol,
      name: base.attributes.name,
      launchpad: dexToLaunchpad(dexId),
      dexId,
      poolAddress: a.address,
      source: 'gecko',
      createdAt: Math.floor(new Date(a.pool_created_at).getTime() / 1000),
      liquidity: num(a.reserve_in_usd),
      mcap: num(a.market_cap_usd) || num(a.fdv_usd),
      volume24h: num(a.volume_usd?.h24),
      volume1h: num(a.volume_usd?.h1),
      priceUsd: num(a.base_token_price_usd) || undefined,
      priceChange24h: num(a.price_change_percentage?.h24),
      priceChange1h: num(a.price_change_percentage?.h1),
      txns24h: a.transactions?.h24 ? a.transactions.h24.buys + a.transactions.h24.sells : undefined,
      buys24h: a.transactions?.h24?.buys,
      sells24h: a.transactions?.h24?.sells,
      sparkline: synthSparkline(a.price_change_percentage),
      imageUrl: base.attributes.image_url || undefined,
      hasX: false,
      isCurve: false,
      scoreSource: null,
    });
  }
  return tokens;
}

export interface GTTokenInfo {
  imageUrl?: string;
  bannerUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
  gtScore?: number;
}

export async function fetchTokenInfo(address: string): Promise<GTTokenInfo | null> {
  const res = await fetch(`${GT}/networks/${NETWORK}/tokens/${address}/info`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 404) return {}; // token unknown to GT (e.g. curve token) — cache the miss
  if (!res.ok) return null; // transient — retry later
  const a = (await res.json()).data?.attributes || {};
  return {
    imageUrl: a.image_url || a.image?.small || undefined,
    bannerUrl: a.banner_image_url || undefined,
    twitter: a.twitter_handle || undefined,
    telegram: a.telegram_handle || undefined,
    website: a.websites?.[0] || undefined,
    description: a.description || undefined,
    gtScore: typeof a.gt_score === 'number' ? Math.round(a.gt_score) : undefined,
  };
}
