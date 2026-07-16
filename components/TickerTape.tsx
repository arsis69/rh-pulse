'use client';

import { usePulseStore } from '@/lib/store';
import { fmtUsd } from '@/lib/format';

// Launched-token tape: ticker, move since launch / 24h, and heat (volume).
export function TickerTape() {
  const tokens = usePulseStore((s) => s.tokens);
  const items = tokens.filter((t) => t.ticker && t.ticker !== '???').slice(0, 22);
  if (items.length === 0) return null;

  const row = (keyPrefix: string) =>
    items.map((t, i) => {
      const chg = t.priceChange24h;
      const hasChg = chg !== undefined && Number.isFinite(chg) && chg !== 0;
      const up = (chg ?? 0) >= 0;
      return (
        <span key={`${keyPrefix}-${i}`} className="mx-5 inline-flex items-center gap-2 text-[12.5px]">
          <span className="font-bold text-ink">${t.ticker}</span>
          {hasChg ? (
            <span className={`num font-semibold ${up ? 'text-up' : 'text-down'}`}>
              {up ? '+' : ''}
              {Math.abs(chg) >= 100 ? chg.toFixed(0) : chg.toFixed(1)}%
            </span>
          ) : (
            <span className="text-[11px] font-medium text-pulse">just launched</span>
          )}
          {t.volume24h > 100 && <span className="num text-ink-3">{fmtUsd(t.volume24h)} vol</span>}
        </span>
      );
    });

  return (
    <div className="marquee-wrap overflow-hidden border-b border-edge bg-surface/70">
      <div className="marquee flex w-max whitespace-nowrap py-2">
        <div>{row('a')}</div>
        <div>{row('b')}</div>
      </div>
    </div>
  );
}
