'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Search } from 'lucide-react';
import { Token, Launchpad } from '@/lib/types';
import { usePulseStore } from '@/lib/store';
import { useTokenFeed } from '@/hooks/useTokenFeed';
import { launchpadColors } from '@/lib/chain';
import { Nav } from '@/components/Nav';
import { StatsBar } from '@/components/StatsBar';
import { TickerTape } from '@/components/TickerTape';
import { TokenCard } from '@/components/card/TokenCard';
import { TradeModal } from '@/components/TradeModal';

type SortKey = 'newest' | 'score' | 'liquidity' | 'volume';

export default function RHPulse() {
  useTokenFeed();
  const tokens = usePulseStore((s) => s.tokens);
  const [search, setSearch] = useState('');
  const [launchpad, setLaunchpad] = useState<'all' | Launchpad>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [isTradeOpen, setIsTradeOpen] = useState(false);

  // live-ticking clock for ages + NEW badges
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const availableLaunchpads = useMemo(() => {
    const set = new Set(tokens.map((t) => t.launchpad));
    const order: Launchpad[] = ['flap', 'pons', 'klik', 'virtuals', 'bankr', 'clanker', 'hoodit', 'nock', 'other'];
    return order.filter((l) => set.has(l));
  }, [tokens]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tokens
      .filter((t) => {
        const matchesSearch =
          !q || t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q;
        return matchesSearch && (launchpad === 'all' || t.launchpad === launchpad);
      })
      .sort((a, b) => {
        if (sortBy === 'newest') return b.createdAt - a.createdAt;
        if (sortBy === 'score') return (b.score ?? -1) - (a.score ?? -1);
        if (sortBy === 'volume') return b.volume24h - a.volume24h;
        return b.liquidity - a.liquidity;
      });
  }, [tokens, search, launchpad, sortBy]);

  const handleTrade = (token: Token) => {
    setSelectedToken(token);
    setIsTradeOpen(true);
  };

  return (
    <div className="min-h-screen">
      <Nav />
      <TickerTape />
      <StatsBar />

      {/* controls */}
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-4 pb-4 sm:px-6">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker, name, address…"
            className="w-full rounded-xl border border-edge bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-3"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill active={launchpad === 'all'} color="var(--color-pulse)" label="ALL" onClick={() => setLaunchpad('all')} />
          {availableLaunchpads.map((l) => (
            <FilterPill
              key={l}
              active={launchpad === l}
              color={launchpadColors[l]}
              label={l.toUpperCase()}
              onClick={() => setLaunchpad(l)}
            />
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="ml-auto rounded-xl border border-edge bg-surface px-3 py-2 text-xs text-ink-2"
        >
          <option value="newest">Newest first</option>
          <option value="score">Top score</option>
          <option value="liquidity">Top liquidity</option>
          <option value="volume">Top volume</option>
        </select>
      </div>

      {/* the card feed */}
      <main className="mx-auto max-w-[1500px] px-4 pb-16 sm:px-6">
        {tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="font-display animate-pulse text-sm tracking-widest text-ink-2">TUNING INTO THE CHAIN…</div>
            <div className="text-xs text-ink-3">first cards land in a few seconds</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <AnimatePresence mode="popLayout">
              {filtered.map((token) => (
                <TokenCard key={token.id} token={token} now={now} onTrade={handleTrade} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <TradeModal token={selectedToken} isOpen={isTradeOpen} onClose={() => setIsTradeOpen(false)} />

      <footer className="border-t border-edge py-6 text-center text-[10px] text-ink-3">
        RH Pulse · live data from Robinhood Chain, GeckoTerminal &amp; launchpad contracts · not financial advice
      </footer>
    </div>
  );
}

function FilterPill({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide transition-colors"
      style={
        active
          ? { color: '#0a0b10', background: color, borderColor: color }
          : { color, borderColor: `${color}55`, background: 'transparent' }
      }
    >
      {label}
    </button>
  );
}
