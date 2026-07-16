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

export function dexTradeUrl(token: Token): string {
  if (token.launchpad === 'pons') return `https://pons.family/launchpad/${token.address}`;
  if (token.launchpad === 'klik') return `https://klik.fun`;
  if (token.poolAddress) return `https://www.geckoterminal.com/robinhood/pools/${token.poolAddress}`;
  return `https://www.geckoterminal.com/robinhood/pools?q=${token.address}`;
}
