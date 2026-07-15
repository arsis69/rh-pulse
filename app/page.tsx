'use client';

import { useState, useEffect } from 'react';
import { TokenCard } from '@/components/TokenCard';
import { TradeModal } from '@/components/TradeModal';
import { Token } from '@/lib/types';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Search, RefreshCw } from 'lucide-react';
import { fetchRecentFlapTokens } from '@/lib/flap';

const initialTokens: Token[] = [
  {
    id: '1',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    ticker: 'HOOD',
    name: 'Robinhood Chain',
    launchpad: 'flap',
    liquidity: 245000,
    mcap: 1250000,
    ageMinutes: 47,
    volume24h: 892000,
    llmScore: 82,
    hasX: true,
  },
  {
    id: '2',
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    ticker: 'AGENT',
    name: 'Virtual Agent',
    launchpad: 'virtuals',
    liquidity: 98000,
    mcap: 420000,
    ageMinutes: 12,
    volume24h: 310000,
    llmScore: 91,
    hasX: true,
  },
  {
    id: '3',
    address: '0x7890abcdef1234567890abcdef1234567890abcd',
    ticker: 'BANK',
    name: 'Bankr Token',
    launchpad: 'bankr',
    liquidity: 156000,
    mcap: 780000,
    ageMinutes: 89,
    volume24h: 445000,
    llmScore: 67,
    hasX: false,
  },
];

export default function RHPulse() {
  const [tokens, setTokens] = useState<Token[]>(initialTokens);
  const [search, setSearch] = useState('');
  const [selectedLaunchpad, setSelectedLaunchpad] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'liquidity'>('newest');
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [isTradeOpen, setIsTradeOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-fetch latest tokens from Flap on load (Step 2)
  useEffect(() => {
    const loadInitialTokens = async () => {
      setLoading(true);
      try {
        const liveTokens = await fetchRecentFlapTokens();
        if (liveTokens.length > 0) {
          setTokens(liveTokens);
        }
      } catch (e) {
        console.error('Failed to auto-fetch tokens', e);
      }
      setLoading(false);
    };
    loadInitialTokens();
  }, []);

  const filteredTokens = tokens
    .filter((t) => {
      const matchesSearch = t.ticker.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase());
      const matchesLaunchpad = selectedLaunchpad === 'all' || t.launchpad === selectedLaunchpad;
      return matchesSearch && matchesLaunchpad;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return a.ageMinutes - b.ageMinutes;
      if (sortBy === 'score') return b.llmScore - a.llmScore;
      return b.liquidity - a.liquidity;
    });

  const handleTrade = (token: Token) => {
    setSelectedToken(token);
    setIsTradeOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <nav className="border-b border-[#E2E8F0] bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-2xl bg-[#0F172A] flex items-center justify-center">
              <span className="text-white font-bold text-lg tracking-[-1px]">RP</span>
            </div>
            <div>
              <div className="font-semibold text-[21px] tracking-[-0.5px]">RH Pulse</div>
              <div className="text-[10px] text-[#64748B] -mt-1.5">ROBINHOOD CHAIN</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ConnectButton />
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 pt-10 pb-20">
        <div className="mb-8">
          <h1 className="text-6xl font-semibold tracking-[-2.5px]">Live Tokens</h1>
          <p className="text-[#64748B] mt-3 text-[17px]">Clean discovery for every new token on Robinhood Chain</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search by ticker or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 h-12 bg-white border border-[#E2E8F0] rounded-2xl text-[15px] focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>

          <select value={selectedLaunchpad} onChange={(e) => setSelectedLaunchpad(e.target.value)} className="h-12 px-4 bg-white border border-[#E2E8F0] rounded-2xl text-sm min-w-[180px]">
            <option value="all">All Launchpads</option>
            <option value="flap">Flap (Yellow)</option>
            <option value="virtuals">Virtuals</option>
            <option value="bankr">Bankr</option>
            <option value="nock">Nock Terminal</option>
            <option value="pons">Pons</option>
            <option value="klik">Klik</option>
          </select>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-12 px-4 bg-white border border-[#E2E8F0] rounded-2xl text-sm min-w-[170px]">
            <option value="newest">Newest first</option>
            <option value="score">Best LLM Score</option>
            <option value="liquidity">Highest Liquidity</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredTokens.length > 0 ? (
            filteredTokens.map((token) => (
              <TokenCard key={token.id} token={token} onTrade={handleTrade} />
            ))
          ) : (
            <div className="col-span-full py-20 text-center text-[#64748B]">No tokens match your filters.</div>
          )}
        </div>
      </div>

      <TradeModal token={selectedToken} isOpen={isTradeOpen} onClose={() => { setIsTradeOpen(false); setSelectedToken(null); }} />
    </div>
  );
}
