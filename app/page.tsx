'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search } from 'lucide-react';
import { Launchpad, Token } from '@/lib/types';
import { usePulseStore } from '@/lib/store';
import { useTokenFeed } from '@/hooks/useTokenFeed';
import { Nav } from '@/components/Nav';
import { StatsBar } from '@/components/StatsBar';
import { TickerTape } from '@/components/TickerTape';
import { RecentTrades } from '@/components/RecentTrades';
import { LaunchpadFilter } from '@/components/LaunchpadFilter';
import { SortTabs } from '@/components/SortTabs';
import { TokenDrawer } from '@/components/TokenDrawer';
import { FeedCard } from '@/components/feed/FeedCard';
import { FeedSkeleton } from '@/components/feed/FeedSkeleton';

type SortKey = 'newest' | 'score' | 'liquidity' | 'volume';

export default function RHPulse() {
  useTokenFeed();
  const tokens = usePulseStore((s) => s.tokens);
  const [search, setSearch] = useState('');
  const [launchpad, setLaunchpad] = useState<'all' | Launchpad>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
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

  return (
    <div className="min-h-screen">
      <Nav />
      <TickerTape onSelectToken={setSelectedToken} />
      <StatsBar onSelectToken={setSelectedToken} />

      <main className="mx-auto max-w-[1500px] px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_300px]">
          {/* feed area — ordered after the whale panel on narrow screens so the
              panel stays visible instead of sitting below a 180-card grid */}
          <div className="order-2 min-w-0 lg:order-none">
            {/* controls */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search ticker, name, address…"
                  className="w-full rounded-xl border border-edge bg-surface py-2.5 pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-3"
                />
              </div>
              <LaunchpadFilter value={launchpad} onChange={setLaunchpad} available={availableLaunchpads} />
              <div className="sm:ml-auto">
                <SortTabs value={sortBy} onChange={setSortBy} />
              </div>
            </div>

            {/* tokens */}
            {tokens.length === 0 ? (
              <FeedSkeleton count={8} />
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center">
                <div className="text-[17px] font-semibold text-ink-2">No tokens match</div>
                <div className="mt-1 text-[13px] text-ink-3">Try a different filter or search term.</div>
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
                <AnimatePresence mode="popLayout">
                  {filtered.map((token, i) => (
                    <motion.div
                      key={token.id}
                      layout
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    >
                      <FeedCard token={token} now={now} onSelect={() => setSelectedToken(token)} priority={i < 8} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* whale sidebar — sticky column on desktop, capped panel on mobile */}
          <aside className="order-1 lg:order-none">
            <div className="lg:sticky lg:top-20">
              <RecentTrades now={now} onSelectToken={setSelectedToken} />
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-edge py-6 text-center text-[12px] text-ink-3">
        Pulse · live data from Robinhood Chain, GeckoTerminal &amp; launchpad contracts · not financial advice
      </footer>

      <TokenDrawer
        key={selectedToken?.id ?? 'closed'}
        token={selectedToken}
        onClose={() => setSelectedToken(null)}
        now={now}
      />
    </div>
  );
}
