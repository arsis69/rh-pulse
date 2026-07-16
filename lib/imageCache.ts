// Image fetch + thumbnail + cache engine. Shared by /api/img/[file] (viewer
// requests) and lib/feedCache (server-side prewarm), so a card's thumbnail is
// usually resident before the first browser ever asks for it.
//
// Layers: memory LRU → disk (.cache/img, survives deploys) → upstream
// (IPFS gateway race / allowlisted CDN) with sharp webp thumbnailing.
import { createHash } from 'crypto';
import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'fs/promises';
import path from 'path';
import { IMG_IPFS_GATEWAYS } from '@/lib/imageProxy';

export interface CachedImage {
  body: Uint8Array;
  type: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MEM_MAX_ENTRIES = 600;
const MEM_MAX_BYTES = 60 * 1024 * 1024;
const NEG_TTL = 10 * 60 * 1000;
const DISK_DIR = '.cache/img';
const DISK_MAX_FILES = 4_000; // ~2000 images (.bin + .meta pairs)
export const ALLOWED_WIDTHS = new Set([0, 256, 640]); // 0 = original size (still webp-transcoded)

const g = globalThis as typeof globalThis & {
  __imgMem?: Map<string, CachedImage>; // insertion order = LRU
  __imgMemBytes?: number;
  __imgNeg?: Map<string, number>;
  __imgInflight?: Map<string, Promise<CachedImage | null>>;
};
const mem = (g.__imgMem ??= new Map());
const neg = (g.__imgNeg ??= new Map());
const inflight = (g.__imgInflight ??= new Map());
g.__imgMemBytes ??= 0;

function memPut(key: string, img: CachedImage) {
  if (mem.has(key)) return;
  mem.set(key, img);
  g.__imgMemBytes! += img.body.byteLength;
  while (mem.size > MEM_MAX_ENTRIES || g.__imgMemBytes! > MEM_MAX_BYTES) {
    const oldest = mem.keys().next().value;
    if (oldest === undefined) break;
    g.__imgMemBytes! -= mem.get(oldest)!.body.byteLength;
    mem.delete(oldest);
  }
}

function diskKey(url: string, w: number): string {
  return createHash('sha1').update(`${url}|${w}`).digest('hex');
}

async function diskGet(key: string): Promise<CachedImage | null> {
  try {
    const [body, type] = await Promise.all([
      readFile(path.join(DISK_DIR, `${key}.bin`)),
      readFile(path.join(DISK_DIR, `${key}.meta`), 'utf8'),
    ]);
    return { body: new Uint8Array(body), type: type.trim() || 'image/webp' };
  } catch {
    return null;
  }
}

let diskPruneAt = 0;
async function diskPut(key: string, img: CachedImage) {
  try {
    await mkdir(DISK_DIR, { recursive: true });
    await Promise.all([
      writeFile(path.join(DISK_DIR, `${key}.bin`), Buffer.from(img.body)),
      writeFile(path.join(DISK_DIR, `${key}.meta`), img.type),
    ]);
    if (Date.now() - diskPruneAt > 10 * 60 * 1000) {
      diskPruneAt = Date.now();
      void pruneDisk();
    }
  } catch {
    /* best effort */
  }
}

async function pruneDisk() {
  try {
    const files = await readdir(DISK_DIR);
    if (files.length <= DISK_MAX_FILES) return;
    const withTimes = await Promise.all(
      files.map(async (f) => ({ f, mtime: (await stat(path.join(DISK_DIR, f))).mtimeMs })),
    );
    withTimes.sort((a, b) => a.mtime - b.mtime);
    const excess = withTimes.slice(0, files.length - DISK_MAX_FILES);
    await Promise.all(excess.map(({ f }) => unlink(path.join(DISK_DIR, f)).catch(() => {})));
  } catch {
    /* best effort */
  }
}

async function fetchRaw(url: string, signal?: AbortSignal): Promise<CachedImage | null> {
  try {
    const res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(8_000),
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

// Race every gateway at once — first image wins, losers are aborted.
async function fetchIpfs(ipfsPath: string): Promise<CachedImage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const attempts = IMG_IPFS_GATEWAYS.map((gw) =>
      fetchRaw(gw + ipfsPath, controller.signal).then((img) => {
        if (!img) throw new Error('miss');
        return img;
      }),
    );
    const img = await Promise.any(attempts);
    controller.abort(); // cancel the slower gateways
    return img;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function thumbnail(img: CachedImage, w: number): Promise<CachedImage> {
  if (w === 0) return img;
  try {
    const { default: sharp } = await import('sharp');
    const body = new Uint8Array(
      await sharp(Buffer.from(img.body), { animated: false })
        .resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer(),
    );
    return { body, type: 'image/webp' };
  } catch {
    return img; // odd format sharp can't read — serve original bytes
  }
}

// upstream: either 'ipfs://<path>' or a full https URL (host already validated by caller)
export async function getImage(upstream: string, w: number): Promise<CachedImage | null> {
  if (!ALLOWED_WIDTHS.has(w)) w = 256;
  const key = diskKey(upstream, w);

  const hit = mem.get(key);
  if (hit) {
    mem.delete(key);
    mem.set(key, hit); // refresh LRU position
    return hit;
  }

  const negAt = neg.get(`${upstream}|${w}`);
  if (negAt && Date.now() - negAt < NEG_TTL) return null;

  const running = inflight.get(key);
  if (running) return running;

  const job = (async (): Promise<CachedImage | null> => {
    const disk = await diskGet(key);
    if (disk) {
      memPut(key, disk);
      return disk;
    }

    const raw = upstream.startsWith('ipfs://')
      ? await fetchIpfs(upstream.slice('ipfs://'.length))
      : await fetchRaw(upstream);
    if (!raw) {
      neg.set(`${upstream}|${w}`, Date.now());
      if (neg.size > 2_000) neg.delete(neg.keys().next().value!);
      return null;
    }
    const img = await thumbnail(raw, w);
    memPut(key, img);
    void diskPut(key, img);
    return img;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export function isWarm(upstream: string, w: number): boolean {
  return mem.has(diskKey(upstream, w));
}
