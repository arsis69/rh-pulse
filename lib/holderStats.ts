// Holder concentration — the strongest free risk signal on this chain and the
// one nothing used before. Blockscout returns per-holder balances in a single
// call; smartMoney.ts hits the same endpoint but throws the balances away.
import { flapPortalAddress } from '@/lib/chain';

const EXPLORER_V2 = 'https://robinhoodchain.blockscout.com/api/v2';

export interface HolderStats {
  holders: number;
  top1Pct: number; // share of circulating supply held by the largest real wallet
  top10Pct: number;
}

// Contracts that hold supply but are not "a whale": the LP pool, the bonding
// curve itself, burn sinks and the token contract. Counting these is how a
// healthy DEX token reads as 90% rugged.
const DEAD = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
]);

function isExcluded(addr: string, exclude: Set<string>): boolean {
  const a = addr.toLowerCase();
  return DEAD.has(a) || exclude.has(a);
}

export async function fetchHolderStats(
  address: string,
  poolAddress?: string,
): Promise<HolderStats | null> {
  const exclude = new Set(
    [address, poolAddress, flapPortalAddress].filter(Boolean).map((a) => a!.toLowerCase()),
  );
  try {
    const res = await fetch(`${EXPLORER_V2}/tokens/${address}/holders`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const items: { address?: { hash?: string }; value?: string }[] = json.items || [];
    if (!items.length) return null;

    const balances = items
      .filter((i) => i.address?.hash && !isExcluded(i.address.hash, exclude))
      .map((i) => Number(i.value ?? 0))
      .filter((v) => v > 0)
      .sort((a, b) => b - a);

    // Everything real is locked in the curve/pool — no distribution to judge yet.
    if (!balances.length) return { holders: 0, top1Pct: 0, top10Pct: 0 };

    const total = balances.reduce((s, v) => s + v, 0);
    if (!total) return null;
    const share = (n: number) => (balances.slice(0, n).reduce((s, v) => s + v, 0) / total) * 100;
    return {
      holders: balances.length,
      top1Pct: share(1),
      top10Pct: share(10),
    };
  } catch {
    return null;
  }
}
