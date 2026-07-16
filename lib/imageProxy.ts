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
  'files.catbox.moe',
  'd.uguu.se',
  'r2-uploads.imageupper.com',
  'i.postimg.cc',
  'postimg.cc',
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

// URL shape: /api/img/<base64url(upstream)>.webp?w=256
// The .webp extension is what makes Cloudflare's default cache pick these up —
// extension-less /api/img?u=... was always cf-cache-status: DYNAMIC (origin hit
// per viewer). b64url carries either "ipfs://<path>" or a full https URL.
export function encodeImgPath(upstream: string, w: number): string {
  const b64 = Buffer.from(upstream, 'utf8').toString('base64url');
  return `/api/img/${b64}.webp?w=${w}`;
}

export function decodeImgFile(file: string): string | null {
  if (!file.endsWith('.webp')) return null;
  try {
    return Buffer.from(file.slice(0, -'.webp'.length), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

// Validate a decoded upstream reference. Returns the normalized upstream
// ("ipfs://<path>" or https URL) or null if it's not something we proxy.
export function validateUpstream(upstream: string): string | null {
  if (upstream.startsWith('ipfs://')) {
    const p = upstream.slice('ipfs://'.length);
    return /^[a-zA-Z0-9]+(\/[\w\-./%]*)?$/.test(p) ? upstream : null;
  }
  try {
    const u = new URL(upstream);
    if (u.protocol === 'https:' && IMG_ALLOWED_HOSTS.has(u.hostname) && !u.username && !u.port) {
      return upstream;
    }
  } catch {
    /* not a URL */
  }
  return null;
}

// Raw image URL → the upstream reference we'd proxy ("ipfs://<path>" or an
// allowlisted https URL), or null when we'd leave it untouched / drop it.
export function normalizeUpstream(url?: string): string | null {
  if (!url || url.startsWith('/api/img')) return null;
  const ipfsPath = extractIpfsPath(url);
  if (ipfsPath) return `ipfs://${ipfsPath}`;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && IMG_ALLOWED_HOSTS.has(u.hostname)) return url;
  } catch {
    /* not a URL */
  }
  return null;
}

// Rewrite an upstream image URL to go through /api/img. Unknown hosts are left
// as-is (direct load, same behavior as before) so nothing regresses.
export function proxiedImageUrl(url?: string, w = 256): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('/api/img')) return url;
  const ipfsPath = extractIpfsPath(url);
  if (ipfsPath) return encodeImgPath(`ipfs://${ipfsPath}`, w);
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && IMG_ALLOWED_HOSTS.has(u.hostname)) {
      return encodeImgPath(url, w);
    }
  } catch {
    return undefined; // not a valid absolute URL — drop it
  }
  return url;
}
