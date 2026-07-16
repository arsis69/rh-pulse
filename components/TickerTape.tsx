'use client';

import { usePulseStore } from '@/lib/store';
import { fmtEth } from '@/lib/format';

export function TickerTape() {
  const activity = usePulseStore((s) => s.activity);
  if (activity.length === 0) return null;

  const items = activity.slice(0, 20);
  const row = (keyPrefix: string) =>
    items.map((a, i) => (
      <span key={`${keyPrefix}-${i}`} className="mx-4 inline-flex items-center gap-1.5 text-[11px]">
        <span className={a.side === 'buy' ? 'text-up' : 'text-down'}>{a.side === 'buy' ? '▲' : '▼'}</span>
        <span className="num text-ink-2">{fmtEth(a.eth)}</span>
        <span className="font-semibold text-ink">${a.ticker || a.token.slice(2, 6).toUpperCase()}</span>
      </span>
    ));

  return (
    <div className="marquee-wrap overflow-hidden border-b border-edge bg-surface/60">
      <div className="marquee flex w-max whitespace-nowrap py-1.5">
        <div>{row('a')}</div>
        <div>{row('b')}</div>
      </div>
    </div>
  );
}
