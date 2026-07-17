// On-chain token metadata fetcher — Pons Launcher tokens (and clones that follow
// the same pattern) store logo + socials directly on the ERC-20 contract.
// We call these view functions for tokens that arrive without an upstream image.

import { createPublicClient, http, parseAbi } from 'viem';
import { robinhoodChain } from '@/lib/chain';

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http('https://rpc.mainnet.chain.robinhood.com'),
});

const metaAbi = parseAbi([
  'function getTokenInfo() view returns (address deployer, string tokenLogo, string tokenDescription, (string twitter,string telegram,string discord,string website,string farcaster) tokenSocials)',
  'function getSocials() view returns (string twitter, string telegram, string discord, string website, string farcaster)',
  'function logo() view returns (string)',
  'function tokenLogo() view returns (string)',
  'function image() view returns (string)',
  'function description() view returns (string)',
  'function socials() view returns (string twitter, string telegram, string discord, string website, string farcaster)',
]);

export interface OnChainMeta {
  imageUrl?: string;
  description?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  deployer?: string; // already decoded by getTokenInfo — was being discarded
}

export async function fetchOnChainMeta(address: string): Promise<OnChainMeta | null> {
  const addr = address as `0x${string}`;

  // Try the bundled getter first (newer Pons contracts)
  try {
    const [deployer, logo, description, socials] = await client.readContract({
      address: addr,
      abi: metaAbi,
      functionName: 'getTokenInfo',
    });
    const img = normalizeUrl(logo);
    if (img || description || socials?.twitter || socials?.website) {
      return {
        imageUrl: img,
        description: description || undefined,
        twitter: normalizeUrl(socials.twitter),
        telegram: normalizeUrl(socials.telegram),
        website: normalizeUrl(socials.website),
        deployer: deployer && /[1-9a-f]/i.test(deployer.slice(2)) ? deployer.toLowerCase() : undefined,
      };
    }
  } catch {
    /* continue */
  }

  // Older / alternate contracts expose individual getters. Race the likely
  // image functions and social getters so one hit is enough.
  const [logo, tokenLogo, image, description, socials] = await Promise.all([
    readString(addr, 'logo'),
    readString(addr, 'tokenLogo'),
    readString(addr, 'image'),
    readString(addr, 'description'),
    readSocials(addr),
  ]);

  const img = normalizeUrl(logo || tokenLogo || image);
  if (!img && !description && !socials?.twitter && !socials?.website) return null;

  return {
    imageUrl: img,
    description: description || undefined,
    twitter: normalizeUrl(socials?.twitter),
    telegram: normalizeUrl(socials?.telegram),
    website: normalizeUrl(socials?.website),
  };
}

async function readString(address: `0x${string}`, name: 'logo' | 'tokenLogo' | 'image' | 'description'): Promise<string> {
  try {
    return (await client.readContract({ address, abi: metaAbi, functionName: name })) || '';
  } catch {
    return '';
  }
}

async function readSocials(
  address: `0x${string}`,
): Promise<{ twitter?: string; telegram?: string; website?: string } | null> {
  for (const fn of ['getSocials', 'socials'] as const) {
    try {
      const s = await client.readContract({ address, abi: metaAbi, functionName: fn });
      if (!s || !Array.isArray(s)) continue;
      const [tw, tg, , web] = s;
      if (tw || web) return { twitter: tw, telegram: tg, website: web };
    } catch {
      /* try next */
    }
  }
  return null;
}

function normalizeUrl(s: string | null | undefined): string | undefined {
  if (!s || typeof s !== 'string') return undefined;
  const t = s.trim();
  if (!t) return undefined;
  if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('ipfs://') || t.startsWith('data:')) return t;
  return undefined;
}
