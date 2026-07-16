// Shared between feedCache (URL rewriting) and /api/img (fetching).
// Token images come from a handful of known CDNs plus IPFS; proxying them through
// our own origin lets Cloudflare edge-cache them (fast loads) and hides slow /
// rate-limited IPFS gateways from the browser.

export const IMG_ALLOWED_HOSTS = new Set([
  'coin-images.coingecko.com',
  'assets.geckoterminal.com',
  'assets.coingecko.com',
  'dd.dexscreener.com',
  'cdn.dexscreener.com',
  'robinhoodchain.blockscout.com',
  'raw.githubusercontent.com',
  'i.imgur.com',
  'arweave.net',
]);

// Working public gateways, fastest first (cloudflare-ipfs.com is dead, pinata rate-limits).
export const IMG_IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

const GATEWAY_HOSTS = [
  'ipfs.io',
  'dweb.link',
  'nftstorage.link',
  'gateway.pinata.cloud',
  'cloudflare-ipfs.com',
];

// "ipfs://CID/x", "https://gateway/ipfs/CID/x" → "CID/x"; anything else → null
export function extractIpfsPath(url: string): string | null {
  if (url.startsWith('ipfs://')) return url.slice('ipfs://'.length).replace(/^ipfs\//, '');
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/ipfs\/(.+)$/);
    if (m && GATEWAY_HOSTS.includes(u.hostname)) return m[1];
  } catch {
    /* not a URL */
  }
  return null;
}

// Rewrite an upstream image URL to go through /api/img. Unknown hosts are left
// as-is (direct load, same behavior as before) so nothing regresses.
export function proxiedImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/api/img')) return url;
  const ipfsPath = extractIpfsPath(url);
  if (ipfsPath) return `/api/img?u=${encodeURIComponent(`ipfs://${ipfsPath}`)}`;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && IMG_ALLOWED_HOSTS.has(u.hostname)) {
      return `/api/img?u=${encodeURIComponent(url)}`;
    }
  } catch {
    return undefined; // not a valid absolute URL — drop it
  }
  return url;
}
