'use client';

import { Token } from '@/lib/types';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWriteContract, useAccount, usePublicClient } from 'wagmi';
import { parseEther, zeroAddress } from 'viem';
import { flapPortalAddress } from '@/lib/chain';

interface TradeModalProps {
  token: Token | null;
  isOpen: boolean;
  onClose: () => void;
}

// Flap Portal trade entrypoint (proxy at flapPortalAddress, impl verified on Blockscout)
const portalAbi = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'inputToken', type: 'address' },
          { internalType: 'address', name: 'outputToken', type: 'address' },
          { internalType: 'uint256', name: 'inputAmount', type: 'uint256' },
          { internalType: 'uint256', name: 'minOutputAmount', type: 'uint256' },
          { internalType: 'bytes', name: 'permitData', type: 'bytes' },
        ],
        internalType: 'struct IPortalTradeV2.ExactInputParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'swapExactInput',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

const SLIPPAGE_BPS = 1000n; // 10%

export function TradeModal({ token, isOpen, onClose }: TradeModalProps) {
  const [amount, setAmount] = useState('0.1');
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContract, isPending, isSuccess } = useWriteContract();

  // Live quote: simulate the swap to see how many tokens the ETH buys
  useEffect(() => {
    if (!isOpen || !token || !publicClient) return;
    let cancelled = false;
    setQuote(null);
    setQuoteError(false);
    const run = async () => {
      try {
        const value = parseEther(amount || '0');
        if (value === 0n) return;
        const { result } = await publicClient.simulateContract({
          address: flapPortalAddress,
          abi: portalAbi,
          functionName: 'swapExactInput',
          args: [
            {
              inputToken: zeroAddress,
              outputToken: token.address as `0x${string}`,
              inputAmount: value,
              minOutputAmount: 0n,
              permitData: '0x',
            },
          ],
          value,
          account: address ?? zeroAddress,
        });
        if (!cancelled) setQuote(result);
      } catch {
        if (!cancelled) setQuoteError(true);
      }
    };
    const t = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [amount, isOpen, token, publicClient, address]);

  if (!isOpen || !token) return null;

  const handleBuy = async () => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }
    try {
      const value = parseEther(amount);
      const minOut = quote ? (quote * (10000n - SLIPPAGE_BPS)) / 10000n : 0n;
      await writeContract({
        address: flapPortalAddress,
        abi: portalAbi,
        functionName: 'swapExactInput',
        args: [
          {
            inputToken: zeroAddress,
            outputToken: token.address as `0x${string}`,
            inputAmount: value,
            minOutputAmount: minOut,
            permitData: '0x',
          },
        ],
        value,
      });
    } catch (error) {
      console.error('Swap failed:', error);
      alert('Swap failed. Check console for details.');
    }
  };

  const estTokens = quote !== null ? Number(quote) / 1e18 : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface rounded-3xl w-full max-w-md shadow-2xl border border-edge-bright">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-edge">
          <div>
            <div className="font-display font-bold text-xl">Trade {token.ticker}</div>
            <div className="text-sm text-ink-3">Robinhood Chain • {token.launchpad}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-2 rounded-xl text-ink-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-2">Amount (ETH)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 text-lg num bg-surface-2 border border-edge rounded-2xl text-ink focus:outline-none focus:border-pulse"
              step="0.01"
            />
            <div className="flex gap-2 mt-2">
              {[0.05, 0.1, 0.25, 0.5].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v.toString())}
                  className="flex-1 py-2 text-sm rounded-xl border border-edge text-ink-2 hover:border-pulse hover:text-pulse"
                >
                  {v} ETH
                </button>
              ))}
            </div>
          </div>

          {/* Live quote via portal simulation */}
          <div className="bg-surface-2 rounded-2xl p-4 text-sm border border-edge">
            <div className="flex justify-between mb-1">
              <span className="text-ink-3">You receive (est.)</span>
              <span className="num font-medium text-ink">
                {estTokens !== null
                  ? `~${estTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${token.ticker}`
                  : quoteError
                    ? 'Quote unavailable'
                    : 'Fetching quote…'}
              </span>
            </div>
            <div className="text-xs text-ink-3">Slippage: 10% max • Flap bonding curve</div>
          </div>

          {isSuccess && (
            <div className="bg-up/10 text-up border border-up/30 rounded-2xl p-3 text-sm font-medium">
              Transaction submitted ✓
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-edge flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-edge-bright font-medium text-ink-2 hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={handleBuy}
            disabled={isPending}
            className="font-display flex-1 py-3 rounded-2xl bg-pulse text-bg font-bold hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {isPending ? 'Swapping...' : 'Buy with ETH'}
          </button>
        </div>
      </div>
    </div>
  );
}
