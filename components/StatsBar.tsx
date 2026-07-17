'use client';

import { useEffect, useState } from 'react';
import { Clock, Flame, Rocket, Zap } from 'lucide-react';
import { usePulseStore } from '@/lib/store';
import { Token } from '@/lib/types';
import { fmtUsd, fmtAge } from '@/lib/format';

interface StatsBarProps {
  onSelectToken?: (token: Token) => void;
}

export function StatsBar({ onSelectToken }: StatsBarProps) {
  const stats = usePulseStore((s) => s.stats);
  const tokens = usePulseStore((s) => s.tokens);
  const newest = tokens[0];

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const items = [
    {
      label: 'Launches 24h',
      value: stats.launches24h ? String(stats.launches24h) : '—',
      sub: 'all launchpads',
      icon: Rocket,
      tint: 'var(--color-pulse)',
      onClick: undefined,
    },
    {
      label: 'Last hour',
      value: stats.launches1h ? String(stats.launches1h) : '—',
      sub: 'new tokens',
      icon: Clock,
      tint: 'var(--color-cool)',
      onClick: undefined,
    },
    {
      label: 'Hottest 24h',
      value: stats.hottest ? `$${stats.hottest.ticker}` : '—',
      sub: stats.hottest ? `${fmtUsd(stats.hottest.volume24h)} volume` : '',
      icon: Flame,
      tint: 'var(--color-hot)',
      onClick: () => {
        if (!stats.hottest || !onSelectToken) return;
        const t = tokens.find((x) => x.id === stats.hottest!.address.toLowerCase());
        if (t) onSelectToken(t);
      },
    },
    {
      label: 'Latest launch',
      value: newest ? `$${newest.ticker}` : '—',
      sub: newest ? `${fmtAge(newest.createdAt, now)} ago · ${newest.launchpad}` : '',
      icon: Zap,
      tint: 'var(--color-spark)',
      onClick: () => {
        if (newest && onSelectToken) onSelectToken(newest);
      },
    },
  ];

  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-2 gap-3 px-4 py-5 sm:grid-cols-4 sm:px-6">
      {items.map((it) => (
        <div
          key={it.label}
          onClick={it.onClick}
          className={`glass-border bg-surface rounded-2xl p-4 hover-lift glass-hover ${it.onClick ? 'cursor-pointer' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">{it.label}</div>
            {/* tinted chip so the icon reads as its own thing, like the tape */}
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `color-mix(in srgb, ${it.tint} 14%, transparent)` }}
            >
              <it.icon className="h-4 w-4" style={{ color: it.tint }} />
            </span>
          </div>
          <div className="mt-2 truncate text-[30px] font-bold leading-none tracking-tight">{it.value}</div>
          <div className="num mt-1.5 truncate text-[13px] text-ink-2">{it.sub}</div>
        </div>
      ))}
    </div>
  );
}
