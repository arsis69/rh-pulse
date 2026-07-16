// Launchpad-native metadata adapters — the fastest possible image sources,
// straight from each launchpad's own backend (found by tracing their apps):
//   virtuals → api.virtuals.io Strapi (preToken/tokenAddress filter, S3 CDN image)
//   clanker  → clanker.world API (chainId 4663 list with img_url; bankr tokens
//              are NOT in it — bankr has no public image source at launch)
export interface LaunchpadMeta {
  imageUrl?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  description?: string;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; PulseBot/1.0; +https://pulseapp.top)' };

// One address per call: a token is a preToken while bonding, tokenAddress after
// graduation — $or covers both.
export async function fetchVirtualsMeta(address: string): Promise<LaunchpadMeta | null> {
  try {
    const url =
      'https://api.virtuals.io/api/virtuals?populate%5Bimage%5D=true' +
      `&filters%5B%24or%5D%5B0%5D%5BpreToken%5D%5B%24eqi%5D=${address}` +
      `&filters%5B%24or%5D%5B1%5D%5BtokenAddress%5D%5B%24eqi%5D=${address}`;
    const res = await fetch(url, { headers: UA, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const rec = (await res.json()).data?.[0];
    if (!rec) return null;
    const socials = rec.socials || {};
    return {
      imageUrl: rec.image?.url || undefined,
      twitter: socials.TWITTER || socials.twitter || undefined,
      telegram: socials.TELEGRAM || socials.telegram || undefined,
      website: socials.WEBSITE || socials.website || undefined,
      description: rec.description || undefined,
    };
  } catch {
    return null;
  }
}

// Rolling map of recent clanker launches on Robinhood (their API caps limit=20).
export async function fetchClankerRecent(pages = 2): Promise<Map<string, LaunchpadMeta>> {
  const out = new Map<string, LaunchpadMeta>();
  for (let page = 1; page <= pages; page++) {
    try {
      const res = await fetch(`https://www.clanker.world/api/tokens?chainId=4663&limit=20&page=${page}`, {
        headers: UA,
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) break;
      const rows = (await res.json()).data || [];
      for (const r of rows) {
        const addr = (r.contract_address || '').toLowerCase();
        if (!addr) continue;
        let description: string | undefined;
        let twitter: string | undefined;
        let website: string | undefined;
        try {
          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata || {};
          description = meta.description || undefined;
          for (const s of meta.socialMediaUrls || []) {
            const u = String(s.url || s || '');
            if (/x\.com|twitter\.com/.test(u)) twitter = twitter ?? u;
            else if (u.startsWith('http')) website = website ?? u;
          }
        } catch {
          /* metadata optional */
        }
        out.set(addr, { imageUrl: r.img_url || undefined, description, twitter, website });
      }
      if (rows.length < 20) break;
    } catch {
      break;
    }
  }
  return out;
}
