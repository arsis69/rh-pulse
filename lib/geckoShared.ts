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

export function gmgnUrl(token: Token): string {
  const ref = process.env.NEXT_PUBLIC_GMGN_REF_CODE || 'AJb4ju9l';
  // GMGN token pages on Robinhood look like /robinhood/token/<address>
  // We append the ref code as a query param; if GMGN ignores it there is no harm.
  return `https://gmgn.ai/robinhood/token/${token.address}?ref=${encodeURIComponent(ref)}`;
}
