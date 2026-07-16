// PRIVATE PREVIEW MODE: HTTP basic auth over the whole app. Delete this file
// (or unset PREVIEW_AUTH in .env.local) when relaunching publicly.
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const expected = process.env.PREVIEW_AUTH; // "user:password"
  if (!expected) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      if (decoded === expected) return NextResponse.next();
    } catch {
      /* fall through to 401 */
    }
  }
  return new NextResponse('Private preview — authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Pulse preview"' },
  });
}

export const config = {
  // protect everything, including all API routes
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
