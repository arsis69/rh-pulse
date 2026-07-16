'use client';

import { usePulseStore } from '@/lib/store';

export function Nav() {
  const isLive = usePulseStore((s) => s.isLive);
  return (
    <nav className="sticky top-0 z-50 border-b border-edge glass">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-[28px] font-bold tracking-tight">
            rh<span className="text-pulse text-glow">pulse</span>
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              isLive ? 'border-pulse/30 text-pulse' : 'border-edge-bright text-ink-3'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'live-dot bg-pulse' : 'bg-ink-3'}`} />
            {isLive ? 'LIVE' : 'CONNECTING'}
          </span>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-pulse/30 to-transparent" />
    </nav>
  );
}
