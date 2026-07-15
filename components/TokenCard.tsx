'use client';

import { Token } from '@/lib/types';
import { launchpadColors } from '@/lib/chain';
import { ArrowUpRight, Clock, Users } from 'lucide-react';

interface TokenCardProps {
  token: Token;
  onTrade: (token: Token) => void;
}

export function TokenCard({ token, onTrade }: TokenCardProps) {
  const color = launchpadColors[token.launchpad] || launchpadColors.other;

  const getScoreColor = (score: number) => {
    if (score >= 75) return 'bg-emerald-100 text-emerald-700';
    if (score >= 50) return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="group bg-white border border-[#E2E8F0] rounded-2xl p-5 hover:border-[#CBD5E1] transition-all duration-200 hover:shadow-sm flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-mono text-sm font-semibold"
            style={{ backgroundColor: color }}
          >
            {token.ticker.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-lg tracking-tight">{token.ticker}</div>
            <div className="text-[#64748B] text-sm truncate max-w-[140px]">{token.name}</div>
          </div>
        </div>

        <div 
          className="px-3 py-1 rounded-full text-xs font-medium"
          style={{ 
            backgroundColor: `${color}15`, 
            color: color 
          }}
        >
          {token.launchpad.toUpperCase()}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 mb-5 text-sm">
        <div>
          <div className="text-[#64748B] text-xs mb-0.5">LIQUIDITY</div>
          <div className="font-mono font-medium">${(token.liquidity / 1000).toFixed(1)}K</div>
        </div>
        <div>
          <div className="text-[#64748B] text-xs mb-0.5">MCAP</div>
          <div className="font-mono font-medium">${(token.mcap / 1000000).toFixed(2)}M</div>
        </div>
        <div>
          <div className="text-[#64748B] text-xs mb-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> AGE
          </div>
          <div className="font-mono font-medium">{token.ageMinutes}m</div>
        </div>
      </div>

      {/* LLM Score + Actions */}
      <div className="mt-auto flex items-center justify-between pt-4 border-t border-[#F1F5F9]">
        <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getScoreColor(token.llmScore)}`}>
          {token.llmScore}
          <span className="font-normal text-xs ml-0.5">/100</span>
        </div>

        <button
          onClick={() => onTrade(token)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F172A] text-white text-sm font-medium hover:bg-black transition-colors active:scale-[0.985]"
        >
          Trade
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
