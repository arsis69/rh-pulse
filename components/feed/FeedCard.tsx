'use client';

import { useState } from 'react';
import { Token } from '@/lib/types';
import { usePulseStore, isNewToken } from '@/lib/store';
import { launchpadColors } from '@/lib/chain';
import { fmtUsd, fmtAge, shortAddr, curvePct } from '@/lib/format';
import { gmgnUrl } from '@/lib/geckoShared';
import { Sparkline } from '@/components/card/Sparkline';
import { TokenImage } from '@/components/ui/TokenImage';
import { Check, Copy, ScanSearch } from 'lucide-react';

interface FeedCardProps {
  token: Token;
  now: number;
  onSelect: () => void;
  priority?: boolean; // above-the-fold cards load art eagerly
}

function scoreAccent(score?: number) {
  if (score === undefined) return { color: 'var(--color-edge-bright)', glow: 'transparent' };
  if (score >= 80) return { color: 'var(--color-up)', glow: 'rgba(34,197,94,0.18)' };
  if (score >= 60) return { color: 'var(--color-legendary)', glow: 'rgba(245,158,11,0.15)' };
  if (score >= 40) return { color: 'var(--color-pulse)', glow: 'rgba(45,212,191,0.12)' };
  return { color: 'var(--color-down)', glow: 'rgba(239,68,68,0.12)' };
}

function CopyCA({ address, onClick }: { address: string; onClick?: (e: React.MouseEvent) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
        navigator.clipboard?.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy contract address"
      className="num flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-[11px] text-ink-2 transition-colors hover:text-ink"
    >
      {shortAddr(address)}
      {copied ? <Check className="h-3 w-3 text-up" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function FeedCard({ token, now, onSelect, priority }: FeedCardProps) {
  const accent = scoreAccent(token.score);
  const lpColor = launchpadColors[token.launchpad] || launchpadColors.other;
  const firstSeenAt = usePulseStore((s) => s.firstSeenAt);
  const isNew = isNewToken(token.id, firstSeenAt, now);
  const curve = token.isCurve ? curvePct(token.liquidity) : null;

  return (
    <div
      onClick={onSelect}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-edge border-t-2 bg-surface transition-all duration-200 hover:-translate-y-1 hover:border-[var(--score-color)] hover:shadow-[0_0_20px_var(--score-glow)]"
      style={{ '--score-color': accent.color, '--score-glow': accent.glow } as React.CSSProperties}
    >
      {/* image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
        <TokenImage
          key={token.bannerUrl || token.imageUrl}
          src={token.bannerUrl || token.imageUrl}
          alt={token.ticker}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          fallbackClassName="text-6xl"
          priority={priority}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />

        <span
          className="absolute left-2.5 top-2.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: lpColor, background: 'rgba(8,9,11,0.85)' }}
        >
          {token.launchpad}
        </span>
      </div>

      {/* identity */}
      <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[20px] font-bold leading-none tracking-tight">
              ${token.ticker}
            </div>
            {isNew && (
              <span className="num rounded bg-pulse px-1 py-0.5 text-[10px] font-bold text-bg shadow-sm">
                NEW
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-ink-3">{token.name}</div>
        </div>
        {token.score !== undefined && token.scoreSource != null && (
          <span
            className="num shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-bold"
            title={token.scoreSource === 'llm' ? 'AI score' : 'Trust score'}
            style={{
              color:
                token.score >= 80
                  ? 'var(--color-up)'
                  : token.score >= 60
                    ? 'var(--color-legendary)'
                    : token.score >= 40
                      ? 'var(--color-pulse)'
                      : 'var(--color-down)',
              background: 'var(--color-surface-2)',
            }}
          >
            {token.score}
          </span>
        )}
      </div>

      {/* stats */}
      <div className="mt-2 grid grid-cols-3 gap-1.5 px-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {token.isCurve ? 'Curve' : 'Liq'}
          </div>
          <div className="num text-[13px] font-semibold">{fmtUsd(token.liquidity)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">MCap</div>
          <div className="num text-[13px] font-semibold">{fmtUsd(token.mcap)}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Vol</div>
          <div className="num text-[13px] font-semibold">{fmtUsd(token.volume24h)}</div>
        </div>
      </div>

      {/* bonding curve */}
      {curve !== null && (
        <div className="mt-2 px-3">
          <div className="mb-1 flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-ink-3">
            <span>Curve</span>
            <span className="num text-pulse">{curve.toFixed(0)}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-pulse transition-all duration-500" style={{ width: `${curve}%` }} />
          </div>
        </div>
      )}

      {/* sparkline + age */}
      <div className="mt-2 flex items-center justify-between px-3">
        <Sparkline points={token.sparkline} width={90} height={24} />
        <span className="num text-[11px] text-ink-2">{fmtAge(token.createdAt, now)}</span>
      </div>

      {/* footer actions */}
      <div className="mt-auto flex items-center gap-1.5 border-t border-edge px-2.5 py-2.5">
        <CopyCA address={token.address} />
        <a
          href={gmgnUrl(token)}
          target="_blank"
          rel="noopener noreferrer"
          title="GMGN chart"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center rounded-md bg-surface-2 px-2 py-1.5 text-[11px] font-bold text-ink-2 transition-colors hover:text-ink"
        >
          GMGN
        </a>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          title="AI analysis"
          className="flex items-center justify-center rounded-md bg-surface-2 p-1.5 text-ink-2 transition-colors hover:text-pulse"
        >
          <ScanSearch className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
