'use client';

import { useEffect, useState } from 'react';
import { useWriteContract, useAccount, usePublicClient } from 'wagmi';
import { parseEther, zeroAddress } from 'viem';
import { flapPortalAddress } from '@/lib/chain';
import { Token } from '@/lib/types';

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

const SLIPPAGE_OPTIONS = [
  { label: '5%', bps: 500 },
  { label: '10%', bps: 1000 },
  { label: '20%', bps: 2000 },
];

interface SwapWidgetProps {
  token: Token;
}

export function SwapWidget({ token }: SwapWidgetProps) {
  const [amount, setAmount] = useState('0.1');
  const [slippageBps, setSlippageBps] = useState(1000);
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContract, isPending } = useWriteContract();

  // fetch live quote whenever amount or connection changes
  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;

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
  }, [amount, token.address, publicClient, address]);

  const handleAmountChange = (value: string) => {
    setAmount(value);
    setQuote(null);
    setQuoteError(false);
    setSubmitted(false);
  };

  const handleBuy = async () => {
    if (!address) {
      alert('Please connect your wallet first');
      return;
    }
    setSubmitted(false);
    try {
      const value = parseEther(amount);
      const minOut = quote ? (quote * (10000n - BigInt(slippageBps))) / 10000n : 0n;
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
      setSubmitted(true);
    } catch (error) {
      console.error('Swap failed:', error);
    }
  };

  const estTokens = quote !== null ? Number(quote) / 1e18 : null;

  return (
    <div className="space-y-4 rounded-2xl border border-edge bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Buy with ETH</span>
        <span className="text-[11px] text-ink-3">Flap Portal</span>
      </div>

      <div>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="w-full rounded-2xl border border-edge bg-surface px-4 py-4 text-[24px] font-bold text-ink placeholder:text-ink-3 num"
            placeholder="0.0"
            step="0.01"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-ink-3">ETH</span>
        </div>
        <div className="mt-2 flex gap-2">
          {[0.05, 0.1, 0.25, 0.5].map((v) => (
            <button
              key={v}
              onClick={() => handleAmountChange(v.toString())}
              className="flex-1 rounded-xl border border-edge bg-surface py-2 text-[12px] font-semibold text-ink-2 transition-colors hover:border-pulse/50 hover:text-ink"
            >
              {v} ETH
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-ink-3">You receive (est.)</span>
          <span className="num text-[18px] font-bold text-ink">
            {estTokens !== null
              ? `~${estTokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${token.ticker}`
              : quoteError
                ? 'Quote unavailable'
                : 'Fetching quote…'}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-ink-3">Slippage: {slippageBps / 100}% max</div>
      </div>

      <div className="flex items-center gap-2">
        {SLIPPAGE_OPTIONS.map((opt) => (
          <button
            key={opt.bps}
            onClick={() => setSlippageBps(opt.bps)}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              slippageBps === opt.bps
                ? 'bg-pulse text-bg'
                : 'border border-edge bg-surface text-ink-2 hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {submitted && (
        <div className="rounded-xl border border-up/30 bg-up/10 p-3 text-center text-[13px] font-semibold text-up">
          Transaction submitted ✓
        </div>
      )}

      <button
        onClick={handleBuy}
        disabled={isPending}
        className="btn-press w-full rounded-2xl bg-pulse py-4 text-[15px] font-bold text-bg transition-transform hover:brightness-110 disabled:opacity-60"
      >
        {isPending ? 'Swapping…' : `Buy $${token.ticker} with ETH`}
      </button>

      {!address && <div className="text-center text-[12px] text-ink-3">Connect your wallet to trade</div>}
    </div>
  );
}
