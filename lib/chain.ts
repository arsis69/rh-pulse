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

// Launchpad brand colors, dark-surface set.
// CVD separation / normal-vision / contrast validated vs #12141C; badges always
// carry a text label so identity is never color-alone (pons gray + klik white
// are deliberate brand identities, klik inverted from black for dark theme).
export const launchpadColors: Record<string, string> = {
  flap: '#EAB308', // yellow (brand)
  virtuals: '#06B6D4', // cyan
  bankr: '#8B5CF6', // violet
  clanker: '#10B981', // green
  hoodit: '#F97316', // orange
  nock: '#14B8A6', // teal
  pons: '#8B93A7', // gray (brand)
  klik: '#E2E8F0', // near-white (brand black, inverted)
  other: '#64748B',
};

export const flapPortalAddress = '0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09' as const;
