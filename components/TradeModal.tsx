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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-xl border border-[#E2E8F0]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b">
          <div>
            <div className="font-semibold text-xl">Trade {token.ticker}</div>
            <div className="text-sm text-[#64748B]">Robinhood Chain • {token.launchpad}</div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F1F5F9] rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-[#64748B] mb-2">Amount (ETH)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 text-lg font-mono border border-[#E2E8F0] rounded-2xl focus:outline-none focus:border-[#0EA5E9]"
              step="0.01"
            />
            <div className="flex gap-2 mt-2">
              {[0.05, 0.1, 0.25, 0.5].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v.toString())}
                  className="flex-1 py-2 text-sm rounded-xl border border-[#E2E8F0] hover:bg-[#F8FAFC]"
                >
                  {v} ETH
                </button>
              ))}
            </div>
          </div>

          {/* Live quote via portal simulation */}
          <div className="bg-[#F8FAFC] rounded-2xl p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-[#64748B]">You receive (est.)</span>
              <span className="font-mono font-medium">
                {estTokens !== null
                  ? `~${estTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${token.ticker}`
                  : quoteError
                    ? 'Quote unavailable'
                    : 'Fetching quote…'}
              </span>
            </div>
            <div className="text-xs text-[#94A3B8]">Slippage: 10% max • Flap bonding curve</div>
          </div>

          {isSuccess && (
            <div className="bg-emerald-50 text-emerald-700 rounded-2xl p-3 text-sm font-medium">
              Transaction submitted ✓
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-[#E2E8F0] font-medium hover:bg-[#F8FAFC]"
          >
            Cancel
          </button>
          <button
            onClick={handleBuy}
            disabled={isPending}
            className="flex-1 py-3 rounded-2xl bg-[#0F172A] text-white font-medium hover:bg-black active:bg-[#111827] disabled:opacity-70"
          >
            {isPending ? 'Swapping...' : 'Buy with ETH'}
          </button>
        </div>
      </div>
    </div>
  );
}
