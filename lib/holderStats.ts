// Holder concentration — the strongest free risk signal on this chain and the
// one nothing used before. Blockscout returns per-holder balances in a single
// call; smartMoney.ts hits the same endpoint but throws the balances away.
import { flapPortalAddress } from '@/lib/chain';

const EXPLORER_V2 = 'https://robinhoodchain.blockscout.com/api/v2';

export interface HolderStats {
  realHolders: number; // wallets (not contracts) holding a balance
  /**
   * Largest wallets' share of TOTAL supply — curve/pool included in the
   * denominator, excluded from the numerator.
   *
   * Measuring share-of-wallet-held-supply instead looks rigorous and is useless:
   * on a fresh curve token the contract holds ~99.9% and the single person who
   * has bought trivially owns "100% of wallet-held supply", which reads as
   * "one wallet holds 100%" when the truth is "one person has bought $3 so far".
   * Against total supply that same buyer is 0.1% — accurate and unalarming —
   * while a deployer really sitting on 80% still reads 80%.
   */
  top1Pct?: number;
  top10Pct?: number;
  walletHeldPct?: number; // how much of supply has actually left the curve/pool
}

const DEAD = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
]);

/**
 * A holder that is a CONTRACT is not a whale.
 *
 * This is the whole game for concentration on this chain, and an explicit pool
 * allowlist doesn't cut it: virtuals keeps unsold supply in its curve contract,
 * bankr's top holder is the launch contract that drains as people buy, DEX
 * tokens park supply in an LP, and tokens can have several pools. Every one of
 * those reads as "one wallet holds 97%" if you count it — a real example being a
 * virtuals token whose 96.94% "whale" was simply its own bonding curve.
 *
 * Blockscout returns `is_contract` per holder, so we can filter generically
 * rather than guessing addresses. What's left is supply in real wallets, and the
 * concentration of THAT is what actually decides whether someone can dump on you.
 *
 * Trade-off: supply held via a multisig/Safe is ignored too, and a deployer
 * could park supply in a contract to dodge the check. That's much rarer here
 * than pools/curves, and the alternative flags every healthy token as rugged.
 */
function isExcluded(addr: string, isContract: boolean, exclude: Set<string>): boolean {
  const a = addr.toLowerCase();
  return isContract || DEAD.has(a) || exclude.has(a);
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
    const items: { address?: { hash?: string; is_contract?: boolean }; value?: string }[] = json.items || [];
    if (!items.length) return null;

    // Everything the API returned, contracts included — this is the denominator.
    const totalAll = items.reduce((s, i) => s + Number(i.value ?? 0), 0);

    const wallets = items
      .filter((i) => i.address?.hash && !isExcluded(i.address.hash, i.address.is_contract === true, exclude))
      .map((i) => Number(i.value ?? 0))
      .filter((v) => v > 0)
      .sort((a, b) => b - a);

    // Nothing in wallets yet (or an empty answer). Valid — cache it so we don't
    // retry forever — but there's no distribution to judge.
    if (!totalAll || !wallets.length) return { realHolders: 0 };

    const share = (n: number) => (wallets.slice(0, n).reduce((s, v) => s + v, 0) / totalAll) * 100;
    return {
      realHolders: wallets.length,
      top1Pct: share(1),
      top10Pct: share(10),
      walletHeldPct: (wallets.reduce((s, v) => s + v, 0) / totalAll) * 100,
    };
  } catch {
    return null;
  }
}
