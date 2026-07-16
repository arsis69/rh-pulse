// Legacy shim: /api/img?u=<upstream> → 301 to the edge-cacheable
// /api/img/<b64url>.webp shape (kept for stale clients / old payloads).
import { NextRequest, NextResponse } from 'next/server';
import { encodeImgPath, validateUpstream } from '@/lib/imageProxy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || '';
  if (!u || u.length > 2048) return new NextResponse(null, { status: 400 });
  const upstream = validateUpstream(u);
  if (!upstream) return new NextResponse(null, { status: 403 });
  return NextResponse.redirect(new URL(encodeImgPath(upstream, 256), req.nextUrl.origin), 301);
}
