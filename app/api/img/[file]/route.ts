// Edge-cacheable image endpoint: /api/img/<base64url(upstream)>.webp?w=256
// The .webp path extension makes Cloudflare cache these at the edge with zero
// dashboard config; heavy lifting lives in lib/imageCache (LRU/disk/sharp).
import { NextRequest, NextResponse } from 'next/server';
import { decodeImgFile, validateUpstream } from '@/lib/imageProxy';
import { getImage, ALLOWED_WIDTHS } from '@/lib/imageCache';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!file || file.length > 2048) return new NextResponse(null, { status: 400 });

  const decoded = decodeImgFile(file);
  if (!decoded) return new NextResponse(null, { status: 400 });
  const upstream = validateUpstream(decoded);
  if (!upstream) return new NextResponse(null, { status: 403 });

  const wParam = parseInt(req.nextUrl.searchParams.get('w') || '256');
  const w = ALLOWED_WIDTHS.has(wParam) ? wParam : 256;

  const img = await getImage(upstream, w);
  if (!img) {
    // cacheable-but-short 404 so CF absorbs retries for broken images too
    return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
  }

  return new NextResponse(Buffer.from(img.body), {
    headers: {
      'Content-Type': img.type,
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
