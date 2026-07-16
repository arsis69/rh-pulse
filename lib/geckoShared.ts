// Pure helpers shared by server (gecko.ts) and client (cards).
import { Token, Launchpad } from '@/lib/types';

export const DEX_TO_LAUNCHPAD: Record<string, Launchpad> = {
  'pons-dot-family': 'pons',
  'bankr-robinhood': 'bankr',
  'virtuals-robinhood': 'virtuals',
  'clanker-robinhood': 'clanker',
  hoodit: 'hoodit',
};

export function dexToLaunchpad(dexId: string): Launchpad {
  return DEX_TO_LAUNCHPAD[dexId] || 'other';
}

// Social values are set by token deployers (via GT/DexScreener metadata) and may be
// a bare handle, a URL, or something malicious like javascript: — never render raw.
export function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
  } catch {
    /* not a URL */
  }
  return undefined;
}

export function safeSocialUrl(kind: 'twitter' | 'telegram', value?: string): string | undefined {
  if (!value) return undefined;
  const asUrl = safeHttpUrl(value);
  if (asUrl) return asUrl;
  const handle = value.replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{1,32}$/.test(handle)) return undefined;
  return kind === 'twitter' ? `https://x.com/${handle}` : `https://t.me/${handle}`;
}

export function gmgnUrl(token: Token): string {
  const ref = process.env.NEXT_PUBLIC_GMGN_REF_CODE || 'AJb4ju9l';
  // GMGN token pages on Robinhood look like /robinhood/token/<address>
  // We append the ref code as a query param; if GMGN ignores it there is no harm.
  return `https://gmgn.ai/robinhood/token/${token.address}?ref=${encodeURIComponent(ref)}`;
}
