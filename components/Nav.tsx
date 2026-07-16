'use client';

import { usePulseStore } from '@/lib/store';

export function Nav() {
  const isLive = usePulseStore((s) => s.isLive);
  return (
    <nav className="sticky top-0 z-50 border-b border-edge glass">
      <div className="bg-pulse/10 py-1.5 text-center text-[12px] font-semibold tracking-wide text-pulse">
        No token yet, but soon!
      </div>
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-[28px] font-bold tracking-tight">
            <span className="text-pulse text-glow">Pulse</span>
          </span>
          <span
            title={isLive ? 'Live — feed updating' : 'Connecting…'}
            className={`h-2 w-2 rounded-full ${isLive ? 'live-dot bg-pulse' : 'bg-ink-3'}`}
          />
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-pulse/30 to-transparent" />
    </nav>
  );
}
