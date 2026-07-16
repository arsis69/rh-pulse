'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Flame, TrendingUp } from 'lucide-react';
import { usePulseStore } from '@/lib/store';
import { Token, TradeEvent } from '@/lib/types';
import { fmtUsd } from '@/lib/format';
import { TokenImage } from '@/components/ui/TokenImage';

interface TickerTapeProps {
  onSelectToken?: (token: Token) => void;
}

type TapeItem =
  | { type: 'hot1h'; token: Token; volume: number }
  | { type: 'mover'; token: Token; change: number }
  | { type: 'whale'; token: Token; trade: TradeEvent };

function TapeItemRow({ item, onClick }: { item: TapeItem; onClick?: (token: Token) => void }) {
  const token = item.token;
  const clickable = onClick ? 'cursor-pointer hover:bg-surface-2' : '';

  if (item.type === 'hot1h') {
    return (
      <span
        onClick={() => onClick?.(token)}
        className={`mx-3 inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border border-edge bg-surface px-2.5 py-1 text-[13px] leading-none ${clickable}`}
      >
        <Flame className="h-3.5 w-3.5 text-pulse" />
        <TokenImage key={token.imageUrl} src={token.imageUrl} alt={token.ticker} className="h-4 w-4 rounded-full object-cover" />
        <span className="font-bold">${token.ticker}</span>
        <span className="num text-ink-3">{fmtUsd(item.volume)} 1h vol</span>
      </span>
    );
  }

  if (item.type === 'mover') {
    const up = item.change >= 0;
    return (
      <span
        onClick={() => onClick?.(token)}
        className={`mx-3 inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border border-edge bg-surface px-2.5 py-1 text-[13px] leading-none ${clickable}`}
      >
        <TrendingUp className={`h-3.5 w-3.5 ${up ? 'text-up' : 'text-down'}`} />
        <TokenImage key={token.imageUrl} src={token.imageUrl} alt={token.ticker} className="h-4 w-4 rounded-full object-cover" />
        <span className="font-bold">${token.ticker}</span>
        <span className={`num inline-flex items-center gap-0.5 font-semibold ${up ? 'text-up' : 'text-down'}`}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(item.change) >= 100 ? item.change.toFixed(0) : Math.abs(item.change).toFixed(1)}%
        </span>
      </span>
    );
  }

  // whale / smart money
  const isBuy = item.trade.side !== 'sell';
  const isSmart = item.trade.whale?.type === 'top_holder';
  const isWhale =
    item.trade.whale?.type === 'large_buy' &&
    (item.trade.whale?.context === '1% supply' || (item.trade.whale?.pct ?? 0) >= 1);
  const color = isBuy ? 'text-up' : 'text-down';
  const icon = isSmart ? '💎' : isWhale ? '🐋' : '🐟';
  const label = isSmart
    ? 'smart money'
    : isWhale
      ? isBuy
        ? 'whale buy'
        : 'whale sell'
      : isBuy
        ? 'large buy'
        : 'large sell';
  return (
    <span
      onClick={() => onClick?.(token)}
      className={`mx-3 inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border border-edge bg-surface px-2.5 py-1 text-[13px] leading-none ${clickable}`}
    >
      <span className={`text-[13px] ${color}`} aria-hidden="true">{icon}</span>
      <TokenImage key={token.imageUrl} src={token.imageUrl} alt={token.ticker} className="h-4 w-4 rounded-full object-cover" />
      <span className="font-bold">${token.ticker}</span>
      <span className={`text-ink-2 ${color}`}>{label}</span>
      <span className="num text-ink-3">{item.trade.usd > 0 ? fmtUsd(item.trade.usd) : `${item.trade.eth.toFixed(2)} ETH`}</span>
      {item.trade.whale?.pct !== undefined && (
        <span className={`num rounded bg-surface-2 px-1.5 py-0 text-[11px] font-semibold ${color}`}>
          {item.trade.whale.pct >= 0.1 ? item.trade.whale.pct.toFixed(1) : '<0.1'}%
        </span>
      )}
    </span>
  );
}

export function TickerTape({ onSelectToken }: TickerTapeProps) {
  const tokens = usePulseStore((s) => s.tokens);
  const activity = usePulseStore((s) => s.activity);
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const tick = () => setNowSec(Date.now() / 1000);
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo<TapeItem[]>(() => {
    const byId = new Map(tokens.map((t) => [t.id, t]));

    // 1h volume from recent on-chain activity (Flap + Klik)
    const hourAgo = nowSec - 3600;
    const vol1h = new Map<string, number>();
    for (const t of activity) {
      if (t.side !== 'buy' || t.ts < hourAgo) continue;
      const key = t.token.toLowerCase();
      vol1h.set(key, (vol1h.get(key) ?? 0) + t.usd);
    }
    const hot1h = [...vol1h.entries()]
      .map(([id, volume]) => ({ token: byId.get(id), volume }))
      .filter((x): x is { token: Token; volume: number } => Boolean(x.token))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);

    // Top 24h movers (closest proxy we have to 1h surge)
    const movers = [...tokens]
      .filter((t) => t.priceChange24h !== undefined && Number.isFinite(t.priceChange24h))
      .sort((a, b) => Math.abs(b.priceChange24h!) - Math.abs(a.priceChange24h!))
      .slice(0, 5)
      .map((token) => ({ type: 'mover' as const, token, change: token.priceChange24h! }));

    // Recent whale / smart-money moves (buys + sells)
    const whales = [...activity]
      .filter((t) => t.whale)
      .slice(0, 5)
      .map((trade) => ({ token: byId.get(trade.token.toLowerCase()), trade }))
      .filter((x): x is { token: Token; trade: TradeEvent } => Boolean(x.token))
      .map((x) => ({ type: 'whale' as const, token: x.token, trade: x.trade }));

    return [
      ...hot1h.map((x) => ({ type: 'hot1h' as const, token: x.token, volume: x.volume })),
      ...movers,
      ...whales,
    ];
  }, [tokens, activity, nowSec]);

  if (items.length === 0) return null;

  const row = (keyPrefix: string) =>
    items.map((item, i) => (
      <TapeItemRow key={`${keyPrefix}-${i}-${item.token.id}`} item={item} onClick={onSelectToken} />
    ));

  return (
    <div className="marquee-wrap overflow-hidden border-b border-edge bg-surface/60">
      <div className="marquee flex w-max items-center whitespace-nowrap py-2.5">
        <div className="flex items-center">{row('a')}</div>
        <div className="flex items-center">{row('b')}</div>
      </div>
    </div>
  );
}
