// DexScreener client — used as a faster/alternative source for token images/socials
// so we don't burn GeckoTerminal's tight free-tier rate limit on /tokens/{addr}/info.

import { GTTokenInfo } from '@/lib/gecko';

const BASE = 'https://api.dexscreener.com';

interface DSInfo {
  imageUrl?: string;
  header?: string;
  websites?: { url?: string }[];
  socials?: { type?: string; url?: string }[];
}

interface DSPair {
  baseToken: { address: string };
  info?: DSInfo;
}

export async function fetchDexScreenerTokenInfo(addresses: string[]): Promise<Map<string, GTTokenInfo>> {
  const out = new Map<string, GTTokenInfo>();
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    try {
      const res = await fetch(`${BASE}/tokens/v1/robinhood/${batch.join(',')}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!res.ok) continue;
      const pairs: DSPair[] = await res.json();
      for (const p of pairs) {
        const addr = p.baseToken.address.toLowerCase();
        if (out.has(addr)) continue;
        const info = p.info || {};
        out.set(addr, {
          imageUrl: info.imageUrl || undefined,
          bannerUrl: info.header || undefined,
          website: info.websites?.[0]?.url || undefined,
          twitter: info.socials?.find((s) => s.type === 'twitter')?.url || undefined,
          telegram: info.socials?.find((s) => s.type === 'telegram')?.url || undefined,
        });
      }
    } catch {
      /* skip batch */
    }
  }
  return out;
}
