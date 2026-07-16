'use client';

import { usePulseStore } from '@/lib/store';
import { fmtUsd } from '@/lib/format';

export function StatsBar() {
  const stats = usePulseStore((s) => s.stats);
  const count = usePulseStore((s) => s.tokens.length);

  const items = [
    { label: 'Launches 24h', value: stats.launches24h ? String(stats.launches24h) : '—' },
    { label: 'Feed volume 24h', value: fmtUsd(stats.totalVol24h) },
    { label: 'ETH', value: stats.ethUsd ? `$${stats.ethUsd.toFixed(0)}` : '—' },
    { label: 'Cards live', value: String(count) },
  ];

  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4 sm:px-6">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-edge bg-surface px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.15em] text-ink-3">{it.label}</div>
          <div className="num text-lg font-semibold text-ink">{it.value}</div>
        </div>
      ))}
    </div>
  );
}
