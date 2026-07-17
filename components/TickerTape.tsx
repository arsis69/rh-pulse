'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Flame, Sparkles, TrendingUp } from 'lucide-react';
import { usePulseStore } from '@/lib/store';
import { Token, TradeEvent } from '@/lib/types';
import { fmtUsd } from '@/lib/format';
import { TokenImage } from '@/components/ui/TokenImage';
import { stubToken } from '@/lib/stubToken';

interface TickerTapeProps {
  onSelectToken?: (token: Token) => void;
}

// Every chip states the window it measures. The old tape showed a flame next to
// "1h vol" that was really a sum over the last 30 trades server-side — tokens with
// a $0.004 buy read as "hot" at $0.00.
const HOT_MIN_1H_VOL = 100; // USD — below this, a flame is a lie on this chain
const SURGE_MIN_PCT = 5; // 1h moves smaller than this aren't news
const SURGE_MIN_1H_VOL = 25; // ignore % swings on near-zero volume
const MOVER_MIN_24H_VOL = 500; // a 24h mover needs real turnover behind it
const NEW_MAX_AGE_SEC = 300;
const WHALE_MAX_AGE_SEC = 1800; // the tape is a 'right now' surface — older whales live in the sidebar

type TapeItem =
  | { type: 'hot1h'; token: Token; volume: number }
  | { type: 'surge1h'; token: Token; change: number }
  | { type: 'mover24h'; token: Token; change: number }
  | { type: 'fresh'; token: Token; age: number }
  | { type: 'whale'; token: Token; trade: TradeEvent };

const CHIP =
  'mx-3 inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border border-edge bg-surface px-2.5 py-1 text-[13px] leading-none';

// The window tag is the whole point: "+197%" means nothing without it.
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-surface-2 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-3">
      {children}
    </span>
  );
}

function TapeItemRow({ item, onClick }: { item: TapeItem; onClick?: (token: Token) => void }) {
  const token = item.token;
  const clickable = onClick ? 'cursor-pointer hover:bg-surface-2' : '';
  const avatar = (
    <TokenImage key={token.imageUrl} src={token.imageUrl} alt={token.ticker} className="h-4 w-4 rounded-full object-cover" />
  );

  if (item.type === 'hot1h') {
    return (
      <span
        onClick={() => onClick?.(token)}
        title={`${token.ticker} traded ${fmtUsd(item.volume)} in the last hour — the most on the chain`}
        className={`${CHIP} ${clickable}`}
      >
        <Flame className="h-3.5 w-3.5 text-pulse" />
        <Tag>hot</Tag>
        {avatar}
        <span className="font-bold">${token.ticker}</span>
        <span className="num text-ink-3">{fmtUsd(item.volume)} vol · 1h</span>
      </span>
    );
  }

  if (item.type === 'fresh') {
    return (
      <span
        onClick={() => onClick?.(token)}
        title={`${token.ticker} launched on ${token.launchpad} moments ago`}
        className={`${CHIP} ${clickable}`}
      >
        <Sparkles className="h-3.5 w-3.5 text-pulse" />
        <Tag>new</Tag>
        {avatar}
        <span className="font-bold">${token.ticker}</span>
        <span className="num text-ink-3">{item.age < 60 ? `${Math.floor(item.age)}s` : `${Math.floor(item.age / 60)}m`} old</span>
      </span>
    );
  }

  if (item.type === 'surge1h' || item.type === 'mover24h') {
    const up = item.change >= 0;
    const window = item.type === 'surge1h' ? '1h' : '24h';
    return (
      <span
        onClick={() => onClick?.(token)}
        title={`${token.ticker} is ${up ? 'up' : 'down'} ${Math.abs(item.change).toFixed(1)}% over the last ${window}`}
        className={`${CHIP} ${clickable}`}
      >
        <TrendingUp className={`h-3.5 w-3.5 ${up ? 'text-up' : 'text-down'}`} />
        <Tag>{window}</Tag>
        {avatar}
        <span className="font-bold">${token.ticker}</span>
        <span className={`num inline-flex items-center gap-0.5 font-semibold ${up ? 'text-up' : 'text-down'}`}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(item.change) >= 100 ? Math.abs(item.change).toFixed(0) : Math.abs(item.change).toFixed(1)}%
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
  // the retained whale feed, not the 30-trade tape — big buys are rare enough
  // that sampling recent trades almost never catches one
  const whaleFeed = usePulseStore((s) => s.whales);
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);

  useEffect(() => {
    const tick = () => setNowSec(Date.now() / 1000);
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo<TapeItem[]>(() => {
    const byId = new Map(tokens.map((t) => [t.id, t]));
    const used = new Set<string>(); // one chip per token — no dupes across sections

    const take = <T extends { token: Token }>(xs: T[], n: number) => {
      const out: T[] = [];
      for (const x of xs) {
        if (used.has(x.token.id) || out.length >= n) continue;
        used.add(x.token.id);
        out.push(x);
      }
      return out;
    };

    // Surging first: a token that is both hot and moving should show the move,
    // since `take` gives each token exactly one chip.
    const surge1h = take(
      tokens
        .filter(
          (t) =>
            t.priceChange1h !== undefined &&
            Number.isFinite(t.priceChange1h) &&
            Math.abs(t.priceChange1h) >= SURGE_MIN_PCT &&
            (t.volume1h ?? 0) >= SURGE_MIN_1H_VOL,
        )
        .sort((a, b) => Math.abs(b.priceChange1h!) - Math.abs(a.priceChange1h!))
        .map((token) => ({ type: 'surge1h' as const, token, change: token.priceChange1h! })),
      4,
    );

    // Real 1h volume, computed server-side over an actual hour of trades
    const hot1h = take(
      tokens
        .filter((t) => (t.volume1h ?? 0) >= HOT_MIN_1H_VOL)
        .sort((a, b) => (b.volume1h ?? 0) - (a.volume1h ?? 0))
        .map((token) => ({ type: 'hot1h' as const, token, volume: token.volume1h! })),
      4,
    );

    // Fresh launches — the whole point of the site
    const fresh = take(
      tokens
        .filter((t) => t.createdAt > 0 && nowSec - t.createdAt <= NEW_MAX_AGE_SEC)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((token) => ({ type: 'fresh' as const, token, age: nowSec - token.createdAt })),
      4,
    );

    // Biggest 24h moves, but only where real turnover backs them
    const movers24h = take(
      tokens
        .filter(
          (t) =>
            t.priceChange24h !== undefined &&
            Number.isFinite(t.priceChange24h) &&
            Math.abs(t.priceChange24h) >= 1 &&
            t.volume24h >= MOVER_MIN_24H_VOL,
        )
        .sort((a, b) => Math.abs(b.priceChange24h!) - Math.abs(a.priceChange24h!))
        .map((token) => ({ type: 'mover24h' as const, token, change: token.priceChange24h! })),
      4,
    );

    const whales = take(
      whaleFeed
        .filter((t) => t.whale && nowSec - t.ts <= WHALE_MAX_AGE_SEC)
        .map((trade) => ({
          type: 'whale' as const,
          // whales often hit coins outside the capped feed — stub rather than drop
          token: byId.get(trade.token.toLowerCase()) ?? stubToken(trade.token, trade.ticker),
          trade,
        })),
      4,
    );

    // Interleave so the tape doesn't run as blocks of one kind
    const groups = [hot1h, surge1h, fresh, whales, movers24h];
    const out: TapeItem[] = [];
    for (let i = 0; i < 4; i++) for (const g of groups) if (g[i]) out.push(g[i]);
    return out;
  }, [tokens, whaleFeed, nowSec]);

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
