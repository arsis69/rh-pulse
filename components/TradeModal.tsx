'use client';

import { Token } from '@/lib/types';
import { X } from 'lucide-react';
import { useState } from 'react';
import { useWriteContract, useAccount } from 'wagmi';
import { parseEther } from 'viem';

interface TradeModalProps {
  token: Token | null;
  isOpen: boolean;
  onClose: () => void;
}

// TODO: Replace with actual Uniswap V3 Router (or launchpad router) address on Robinhood Chain
const SWAP_ROUTER_ADDRESS = '0x0000000000000000000000000000000000000000' as const; // Placeholder - update with real address

// Basic ABI for swapExactETHForTokens (Uniswap V2 style - adjust for V3 if needed)
const swapAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactETHForTokens',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;

export function TradeModal({ token, isOpen, onClose }: TradeModalProps) {
  const [amount, setAmount] = useState('0.1');
  const { address } = useAccount();
  const { writeContract, isPending, isSuccess } = useWriteContract();

  if (!isOpen || !token) return null;

  const handleRealBuy = async () => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }

    try {
      // Example path: WETH -> Token (you need actual WETH and router on the chain)
      const path = [
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Example WETH (update for Robinhood Chain if different)
        token.address as `0x${string}`,
      ];

      await writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: swapAbi,
        functionName: 'swapExactETHForTokens',
        args: [
          0n, // amountOutMin (set slippage later)
          path,
          address,
          BigInt(Math.floor(Date.now() / 1000) + 60 * 20), // 20 min deadline
        ],
        value: parseEther(amount),
      });

      // Success will be handled by isSuccess or toast in real app
    } catch (error) {
      console.error('Swap failed:', error);
      alert('Swap failed. Check console and update router address.');
    }
  };

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

          {/* Quote (mock for now) */}
          <div className="bg-[#F8FAFC] rounded-2xl p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-[#64748B]">You receive (est.)</span>
              <span className="font-mono font-medium">~{(parseFloat(amount) * 12400).toFixed(0)} {token.ticker}</span>
            </div>
            <div className="text-xs text-[#94A3B8]">Price impact: &lt;0.5% • Slippage: 1%</div>
          </div>
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
