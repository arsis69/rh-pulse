'use client';

import { Token, ageMinutes } from '@/lib/types';
import { launchpadColors } from '@/lib/chain';
import { getRarity, rarityStyles, fallbackArt } from '@/lib/rarity';
import { fmtUsd, fmtAge } from '@/lib/format';
import { dexTradeUrl } from '@/lib/geckoShared';
import { Sparkline } from './Sparkline';
import { ArrowUpRight, RefreshCw, Users, Zap } from 'lucide-react';

interface CardFrontProps {
  token: Token;
  now: number;
  onTrade: (t: Token) => void;
  onFlip: () => void;
}

function ScoreChip({ token }: { token: Token }) {
  if (token.score === undefined || token.scoreSource == null) {
    return (
      <span className="num rounded-full border border-edge px-2 py-0.5 text-[11px] text-ink-3" title="not scored yet">
        —
      </span>
    );
  }
  const c = token.score >= 70 ? 'var(--color-up)' : token.score >= 45 ? '#eab308' : 'var(--color-down)';
  return (
    <span
      className="num rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: c, border: `1px solid ${c}55`, background: `${'#000'}00` }}
      title={token.scoreSource === 'llm' ? 'AI analysis score' : 'GeckoTerminal trust score'}
    >
      {token.score} {token.scoreSource === 'llm' ? '✦' : ''}
    </span>
  );
}

export function CardFront({ token, now, onTrade, onFlip }: CardFrontProps) {
  const rarity = getRarity(token);
  const rs = rarityStyles[rarity];
  const lpColor = launchpadColors[token.launchpad] || launchpadColors.other;
  const isFresh = ageMinutes(token, now) < 60;

  return (
    <div className="card-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-surface">
      {/* art */}
      <div className="relative h-28 shrink-0 overflow-hidden" style={{ background: fallbackArt(token.address) }}>
        {token.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <div className="font-display absolute inset-0 flex items-center justify-center text-4xl font-bold text-white/25">
            {token.ticker.slice(0, 3).toUpperCase()}
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
        {/* rarity tag */}
        <span
          className="font-display absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wider"
          style={{ color: rs.chip, background: 'rgba(8,9,14,0.72)', border: `1px solid ${rs.chip}44` }}
        >
          {rs.label}
        </span>
        {/* launchpad badge — text label always present */}
        <span
          className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: lpColor, background: 'rgba(8,9,14,0.72)', border: `1px solid ${lpColor}44` }}
        >
          {token.launchpad}
        </span>
      </div>

      {/* identity */}
      <div className="flex items-start justify-between gap-2 px-3 pt-1.5">
        <div className="min-w-0">
          <div className="font-display truncate text-[15px] font-bold leading-tight">${token.ticker}</div>
          <div className="truncate text-[11px] text-ink-3">{token.name}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          <ScoreChip token={token} />
        </div>
      </div>

      {/* stats */}
      <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5 px-3 text-[11px]">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-ink-3">{token.isCurve ? 'Curve est.' : 'Liquidity'}</div>
          <div className="num font-medium text-ink">{fmtUsd(token.liquidity)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-ink-3">MCap</div>
          <div className="num font-medium text-ink">{fmtUsd(token.mcap)}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-ink-3">Vol 24h</div>
          <div className="num font-medium text-ink">{fmtUsd(token.volume24h)}</div>
        </div>
      </div>

      {/* sparkline + meta */}
      <div className="mt-2 flex items-center justify-between px-3">
        <Sparkline points={token.sparkline} />
        <div className="flex items-center gap-2 text-[10px] text-ink-3">
          {token.holders !== undefined && (
            <span className="num flex items-center gap-0.5">
              <Users className="h-3 w-3" /> {token.holders}
            </span>
          )}
          <span className={`num flex items-center gap-0.5 ${isFresh ? 'text-pulse' : ''}`}>
            <Zap className="h-3 w-3" /> {fmtAge(token.createdAt, now)}
          </span>
        </div>
      </div>

      {/* actions */}
      <div className="mt-auto flex items-center gap-1.5 border-t border-edge px-3 py-2">
        {token.launchpad === 'flap' && token.isCurve ? (
          <button
            onClick={() => onTrade(token)}
            className="font-display flex flex-1 items-center justify-center gap-1 rounded-lg bg-ink px-2 py-1.5 text-[11px] font-bold text-bg transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            TRADE <ArrowUpRight className="h-3 w-3" />
          </button>
        ) : (
          <a
            href={dexTradeUrl(token)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display flex flex-1 items-center justify-center gap-1 rounded-lg border border-edge-bright px-2 py-1.5 text-[11px] font-bold text-ink transition-colors hover:border-pulse hover:text-pulse"
          >
            VIEW <ArrowUpRight className="h-3 w-3" />
          </a>
        )}
        <button
          onClick={onFlip}
          title="AI analysis"
          className="flex items-center justify-center rounded-lg border border-edge-bright p-1.5 text-ink-2 transition-colors hover:border-pulse hover:text-pulse"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
