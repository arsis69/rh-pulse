'use client';

import Link from 'next/link';
import { usePulseStore } from '@/lib/store';

export function Nav() {
  const isLive = usePulseStore((s) => s.isLive);
  return (
    <nav className="sticky top-0 z-50 border-b border-edge glass">
      <Link
        href="/intro"
        className="block bg-pulse/10 py-1.5 text-center text-[12px] font-semibold tracking-wide text-pulse transition-colors hover:bg-pulse/20"
      >
        Meet $PULSE, the token that powers Pulse
      </Link>
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Pulse" className="h-9 w-9 rounded-xl ring-1 ring-edge" />
          <span className="text-[28px] font-bold tracking-tight">
            <span className="text-pulse text-glow">Pulse</span>
          </span>
          <span
            title={isLive ? 'Live, feed updating' : 'Connecting…'}
            className={`h-2 w-2 rounded-full ${isLive ? 'live-dot bg-pulse' : 'bg-ink-3'}`}
          />
        </Link>
        <div className="flex items-center gap-1 text-[13px] font-semibold sm:gap-2">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            Dashboard
          </Link>
          <Link
            href="/intro"
            className="rounded-lg px-3 py-2 text-pulse transition-colors hover:bg-pulse/10"
          >
            $PULSE
          </Link>
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-transparent via-pulse/30 to-transparent" />
    </nav>
  );
}
