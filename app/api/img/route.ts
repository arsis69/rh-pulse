// Image proxy: serves token images from our own origin so Cloudflare edge-caches
// them and the browser never waits on slow IPFS gateways. Strict host allowlist
// (no open proxy / SSRF) + in-memory LRU behind the edge cache.
import { NextRequest, NextResponse } from 'next/server';
import { IMG_ALLOWED_HOSTS, IMG_IPFS_GATEWAYS } from '@/lib/imageProxy';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const CACHE_MAX_ENTRIES = 500;
const CACHE_MAX_BYTES = 80 * 1024 * 1024;
const NEG_TTL = 10 * 60 * 1000; // remember failures so broken URLs don't get re-fetched per viewer

interface CachedImage {
  body: Uint8Array;
  type: string;
}

const g = globalThis as typeof globalThis & {
  __imgCache?: Map<string, CachedImage>; // insertion order = LRU
  __imgCacheBytes?: number;
  __imgNegCache?: Map<string, number>;
};
const cache = (g.__imgCache ??= new Map());
const negCache = (g.__imgNegCache ??= new Map());
g.__imgCacheBytes ??= 0;

function cachePut(key: string, img: CachedImage) {
  cache.set(key, img);
  g.__imgCacheBytes! += img.body.byteLength;
  while (cache.size > CACHE_MAX_ENTRIES || g.__imgCacheBytes! > CACHE_MAX_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    g.__imgCacheBytes! -= cache.get(oldest)!.body.byteLength;
    cache.delete(oldest);
  }
}

async function fetchImage(url: string): Promise<CachedImage | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: 'image/*' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const len = parseInt(res.headers.get('content-length') || '0');
    if (len > MAX_BYTES) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null;
    return { body, type };
  } catch {
    return null;
  }
}

// Race two gateways at a time until one delivers.
async function fetchIpfs(path: string): Promise<CachedImage | null> {
  for (let i = 0; i < IMG_IPFS_GATEWAYS.length; i += 2) {
    const urls = IMG_IPFS_GATEWAYS.slice(i, i + 2).map((gw) => gw + path);
    const results = await Promise.allSettled(urls.map(fetchImage));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) return r.value;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  if (!u || u.length > 2048) return new NextResponse(null, { status: 400 });

  const hit = cache.get(u);
  if (hit) {
    // refresh LRU position
    cache.delete(u);
    cache.set(u, hit);
    return imageResponse(hit, 'HIT');
  }
  const negAt = negCache.get(u);
  if (negAt && Date.now() - negAt < NEG_TTL) return new NextResponse(null, { status: 404 });

  let img: CachedImage | null = null;
  if (u.startsWith('ipfs://')) {
    const path = u.slice('ipfs://'.length);
    if (!/^[a-zA-Z0-9]+(\/[\w\-./%]*)?$/.test(path)) return new NextResponse(null, { status: 400 });
    img = await fetchIpfs(path);
  } else {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return new NextResponse(null, { status: 400 });
    }
    if (parsed.protocol !== 'https:' || !IMG_ALLOWED_HOSTS.has(parsed.hostname) || parsed.username || parsed.port) {
      return new NextResponse(null, { status: 403 });
    }
    img = await fetchImage(u);
  }

  if (!img) {
    negCache.set(u, Date.now());
    if (negCache.size > 2_000) negCache.delete(negCache.keys().next().value!);
    return new NextResponse(null, { status: 404 });
  }
  cachePut(u, img);
  return imageResponse(img, 'MISS');
}

function imageResponse(img: CachedImage, cacheState: string) {
  return new NextResponse(Buffer.from(img.body), {
    headers: {
      'Content-Type': img.type,
      // token art is immutable in practice — let Cloudflare + browsers hold it
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      'X-Img-Cache': cacheState,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
