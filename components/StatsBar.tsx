'use client';

import { usePulseStore } from '@/lib/store';
import { fmtUsd, fmtAge } from '@/lib/format';
import { useEffect, useState } from 'react';

export function StatsBar() {
  const stats = usePulseStore((s) => s.stats);
  const tokens = usePulseStore((s) => s.tokens);
  const newest = tokens[0];

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const items = [
    { label: 'Launches 24h', value: stats.launches24h ? String(stats.launches24h) : '—', sub: 'all launchpads' },
    { label: 'Last hour', value: stats.launches1h ? String(stats.launches1h) : '—', sub: 'new tokens' },
    {
      label: 'Hottest 24h',
      value: stats.hottest ? `$${stats.hottest.ticker}` : '—',
      sub: stats.hottest ? `${fmtUsd(stats.hottest.volume24h)} volume` : '',
    },
    {
      label: 'Latest launch',
      value: newest ? `$${newest.ticker}` : '—',
      sub: newest ? `${fmtAge(newest.createdAt, now)} ago · ${newest.launchpad}` : '',
    },
  ];

  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-2.5 px-4 py-4 sm:grid-cols-4 sm:px-6">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-edge bg-surface px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">{it.label}</div>
          <div className="mt-0.5 truncate text-[22px] font-bold tracking-tight">{it.value}</div>
          <div className="num truncate text-[11px] text-ink-3">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}
