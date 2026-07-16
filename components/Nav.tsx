'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { usePulseStore } from '@/lib/store';

export function Nav() {
  const isLive = usePulseStore((s) => s.isLive);
  return (
    <nav className="sticky top-0 z-50 border-b border-edge bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="font-display flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-pulse/80 to-[#9d6fff]/80 text-sm font-extrabold text-bg">
            RP
          </div>
          <div>
            <div className="font-display text-lg font-bold leading-tight tracking-tight">
              RH <span className="text-pulse">PULSE</span>
            </div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-ink-3">Robinhood Chain radar</div>
          </div>
          <span
            className={`ml-3 hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:flex ${
              isLive ? 'border-up/40 text-up' : 'border-edge-bright text-ink-3'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'live-dot bg-up' : 'bg-ink-3'}`} />
            {isLive ? 'LIVE' : 'CONNECTING'}
          </span>
        </div>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>
    </nav>
  );
}
