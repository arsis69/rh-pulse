// Direct chain reads via multicall3 — the authoritative source for curve state.
// Event-derived curve math drifts (the trade backfill window is shorter than the
// launch window, so early buys are missed); the Portal exposes the real numbers.
import { createPublicClient, http, parseAbi } from 'viem';
import { flapPortalAddress } from '@/lib/chain';

const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;
const CHUNK = 100;

const client = createPublicClient({
  transport: http(RPC_URL, { batch: true }),
  batch: { multicall: true },
});

const portalAbi = parseAbi([
  'function getTokenV9Safe(address) view returns ((uint8 status,uint256 reserve,uint256 circulatingSupply,uint256 price,uint8 tokenVersion,uint256 r,uint256 h,uint256 k,uint256 dexSupplyThresh,address quoteTokenAddress,bool nativeToQuoteSwapEnabled,bytes32 extensionID,uint256 buyTaxRate,uint256 sellTaxRate,address pool,uint256 progress,uint8 lpFeeProfile,uint8 dexId))',
]);
const erc20Abi = parseAbi(['function symbol() view returns (string)']);

export interface CurveState {
  reserveEth: number; // ETH actually held by the curve
  progressPct: number; // 0-100, straight from the contract
  graduated: boolean; // curve closed, now trading on a DEX pool
  priceWei: bigint;
  // Creator tax, basis points → percent. Verified NOT enforced on curve trades:
  // every TokenBought pays exactly the 1% platform fee (getFeeRate() == 100 bps)
  // whether this field says 0 or 1000. Informational only — do not penalise a
  // fee nobody actually pays; it may only bite after graduation.
  buyTaxPct: number;
  sellTaxPct: number;
  poolAddress?: string; // excluded from holder concentration — the LP is not a whale
}

const BPS_SCALE = 100; // basis points → percent

// The Portal reports `progress` as a 1e18-scaled fraction of the graduation
// target (verified: reserve 0.0097 ETH → progress 1.94e15, i.e. 5 ETH target).
const PROGRESS_SCALE = 1e16; // → percent

async function chunked<T>(items: string[], fn: (batch: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    out.push(...(await fn(items.slice(i, i + CHUNK))));
  }
  return out;
}

export async function readCurveStates(addresses: string[]): Promise<Map<string, CurveState>> {
  const map = new Map<string, CurveState>();
  if (!addresses.length) return map;
  try {
    const results = await chunked(addresses, (batch) =>
      client.multicall({
        multicallAddress: MULTICALL3,
        allowFailure: true,
        contracts: batch.map((a) => ({
          address: flapPortalAddress,
          abi: portalAbi,
          functionName: 'getTokenV9Safe' as const,
          args: [a as `0x${string}`],
        })),
      }),
    );
    results.forEach((r, i) => {
      if (r.status !== 'success' || !r.result) return;
      const s = r.result as {
        status: number;
        reserve: bigint;
        price: bigint;
        pool: string;
        progress: bigint;
        buyTaxRate: bigint;
        sellTaxRate: bigint;
      };
      const hasPool = /[1-9a-f]/i.test(s.pool.slice(2));
      map.set(addresses[i].toLowerCase(), {
        reserveEth: Number(s.reserve) / 1e18,
        progressPct: Math.min(100, Math.max(0, Number(s.progress) / PROGRESS_SCALE)),
        graduated: s.status !== 1 || hasPool,
        priceWei: s.price,
        buyTaxPct: Number(s.buyTaxRate) / BPS_SCALE,
        sellTaxPct: Number(s.sellTaxRate) / BPS_SCALE,
        poolAddress: hasPool ? s.pool : undefined,
      });
    });
  } catch {
    /* chain read failed — callers keep their event-derived values */
  }
  return map;
}

// Trades on tokens whose TokenCreated log predates our scan window have no
// cached symbol; without this the whale feed shows "$???".
export async function readSymbols(addresses: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!addresses.length) return map;
  try {
    const results = await chunked(addresses, (batch) =>
      client.multicall({
        multicallAddress: MULTICALL3,
        allowFailure: true,
        contracts: batch.map((a) => ({
          address: a as `0x${string}`,
          abi: erc20Abi,
          functionName: 'symbol' as const,
        })),
      }),
    );
    results.forEach((r, i) => {
      if (r.status === 'success' && typeof r.result === 'string' && r.result) {
        map.set(addresses[i].toLowerCase(), r.result);
      }
    });
  } catch {
    /* leave unresolved — caller falls back to a short address */
  }
  return map;
}
