'use client';

import { Crown, Fish, Rocket } from 'lucide-react';
import { usePulseStore } from '@/lib/store';
import { fmtUsd, fmtEth, fmtAge } from '@/lib/format';

interface RecentTradesProps {
  now: number;
  className?: string;
}

function isWhaleTrade(trade: import('@/lib/types').TradeEvent) {
  return trade.whale || trade.usd >= 1000 || trade.eth >= 0.5;
}

export function RecentTrades({ now, className }: RecentTradesProps) {
  const activity = usePulseStore((s) => s.activity);
  const whales = activity.filter(isWhaleTrade).slice(0, 30);

  if (whales.length === 0) {
    return (
      <div className={`glass-border bg-surface rounded-2xl p-4 ${className ?? ''}`}>
        <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Smart money & whales</div>
        <div className="mt-6 text-center text-[13px] text-ink-3">Waiting for whale moves…</div>
      </div>
    );
  }

  return (
    <div className={`glass-border bg-surface rounded-2xl ${className ?? ''}`}>
      <div className="border-b border-edge px-4 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Smart money & whales</div>
      </div>
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
        {whales.map((trade, i) => {
          const isTopHolder = trade.whale?.type === 'top_holder';
          const isLargeNew = trade.whale?.type === 'large_buy' && trade.whale?.context === 'new coin';
          const isBuy = trade.side === 'buy';
          const Icon = isTopHolder ? Crown : isLargeNew ? Rocket : Fish;
          const colorClass = isTopHolder
            ? 'text-legendary bg-legendary/10'
            : isLargeNew
              ? 'text-pulse bg-pulse/10'
              : isBuy
                ? 'text-up bg-up/10'
                : 'text-down bg-down/10';
          return (
            <div
              key={`${trade.ts}-${i}`}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-ink">
                  {isTopHolder
                    ? `Smart money aped $${trade.ticker || '???'}`
                    : `${isBuy ? 'Large buy' : 'Large sell'} $${trade.ticker || '???'}`}
                </div>
                {trade.whale?.context && !isTopHolder && (
                  <div className="text-[11px] text-pulse">{trade.whale.context}</div>
                )}
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={`num text-[12px] font-semibold ${isBuy ? 'text-up' : 'text-down'}`}>
                    {isBuy ? '+' : '-'}
                    {trade.usd > 0 ? fmtUsd(trade.usd) : fmtEth(trade.eth)}
                  </span>
                  <span className="num text-[10px] text-ink-3">{fmtAge(trade.ts, now)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
