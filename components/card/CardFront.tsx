'use client';

import { useState } from 'react';
import { Token } from '@/lib/types';
import { launchpadColors } from '@/lib/chain';
import { getRarity, rarityStyles } from '@/lib/rarity';
import { fmtUsd, fmtAge, shortAddr } from '@/lib/format';
import { dexTradeUrl } from '@/lib/geckoShared';
import { Sparkline } from './Sparkline';
import { ArrowUpRight, Check, Copy, ScanSearch } from 'lucide-react';

interface CardFrontProps {
  token: Token;
  now: number;
  onFlip: () => void;
}

function CopyCA({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy contract address"
      className="num flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:text-ink"
    >
      {shortAddr(address)}
      {copied ? <Check className="h-3.5 w-3.5 text-up" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function CardFront({ token, now, onFlip }: CardFrontProps) {
  const rs = rarityStyles[getRarity(token)];
  const lpColor = launchpadColors[token.launchpad] || launchpadColors.other;

  return (
    <div className="card-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-surface">
      {/* art */}
      <div className="relative h-36 shrink-0 overflow-hidden bg-surface-2">
        {token.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.imageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl font-extrabold tracking-tight text-ink-3/40">
            {token.ticker.slice(0, 1).toUpperCase()}
          </div>
        )}
        <span
          className="absolute left-2.5 top-2.5 rounded-md px-2 py-0.5 text-[10px] font-bold tracking-widest"
          style={{ color: rs.accent, background: 'rgba(11,12,14,0.8)' }}
        >
          {rs.label}
        </span>
        <span
          className="absolute right-2.5 top-2.5 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
          style={{ color: lpColor, background: 'rgba(11,12,14,0.8)' }}
        >
          {token.launchpad}
        </span>
      </div>

      {/* identity */}
      <div className="flex items-start justify-between gap-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="truncate text-[20px] font-bold leading-tight tracking-tight">${token.ticker}</div>
          <div className="truncate text-[13px] text-ink-3">{token.name}</div>
        </div>
        {token.score !== undefined && token.scoreSource != null && (
          <span
            className="num shrink-0 rounded-lg px-2 py-1 text-[13px] font-semibold"
            title={token.scoreSource === 'llm' ? 'AI score' : 'Trust score'}
            style={{
              color:
                token.score >= 70 ? 'var(--color-up)' : token.score >= 45 ? '#e8b64c' : 'var(--color-down)',
              background: 'var(--color-surface-2)',
            }}
          >
            {token.score}
          </span>
        )}
      </div>

      {/* stats */}
      <div className="mt-3 grid grid-cols-3 gap-2 px-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">
            {token.isCurve ? 'Curve' : 'Liquidity'}
          </div>
          <div className="num text-[14px] font-semibold">{fmtUsd(token.liquidity)}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">MCap</div>
          <div className="num text-[14px] font-semibold">{fmtUsd(token.mcap)}</div>
        </div>
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-ink-3">Vol 24h</div>
          <div className="num text-[14px] font-semibold">{fmtUsd(token.volume24h)}</div>
        </div>
      </div>

      {/* sparkline + age */}
      <div className="mt-2.5 flex items-center justify-between px-4">
        <Sparkline points={token.sparkline} width={110} height={30} />
        <span className="num text-[13px] text-ink-2">{fmtAge(token.createdAt, now)}</span>
      </div>

      {/* CA + actions */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-edge px-3 py-2.5">
        <CopyCA address={token.address} />
        <div className="flex items-center gap-1.5">
          <a
            href={dexTradeUrl(token)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open on launchpad / chart"
            className="flex items-center justify-center rounded-lg bg-surface-2 p-2 text-ink-2 transition-colors hover:text-ink"
          >
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <button
            onClick={onFlip}
            title="AI analysis"
            className="flex items-center justify-center rounded-lg bg-surface-2 p-2 text-ink-2 transition-colors hover:text-pulse"
          >
            <ScanSearch className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
