import { defineChain } from 'viem';

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'ETH',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.chain.robinhood.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain Explorer',
      url: 'https://robinhoodchain.blockscout.com',
    },
  },
});

// Launchpad colors (updated per request)
export const launchpadColors: Record<string, string> = {
  flap: '#EAB308',      // Yellow
  virtuals: '#06B6D4',  // Cyan
  bankr: '#7C3AED',     // Purple
  nock: '#10B981',      // Green
  pons: '#6B7280',      // Gray (updated)
  klik: '#111827',      // Near black (updated)
  other: '#9CA3AF',
};

export const flapPortalAddress = '0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09' as const;
