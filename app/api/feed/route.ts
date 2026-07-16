import { NextResponse } from 'next/server';
import { buildFeedPayload } from '@/lib/feedCache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await buildFeedPayload();
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=4, stale-while-revalidate=8' },
  });
}
