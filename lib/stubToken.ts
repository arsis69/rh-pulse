import { Token } from '@/lib/types';

// A traded coin may have scrolled out of the capped feed — build a minimal Token
// so whale surfaces can still show and open it, rather than dropping the event.
export function stubToken(address: string, ticker?: string): Token {
  return {
    id: address.toLowerCase(),
    address,
    ticker: ticker || 'Unknown',
    name: ticker || 'Unknown',
    launchpad: 'other',
    source: 'flap',
    createdAt: 0,
    liquidity: 0,
    mcap: 0,
    volume24h: 0,
    hasX: false,
    scoreSource: null,
  };
}
