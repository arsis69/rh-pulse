'use client';

import { Token, LLMAnalysis } from '@/lib/types';
import { Check, X, Undo2 } from 'lucide-react';

interface CardBackProps {
  token: Token;
  analysis?: LLMAnalysis;
  pending: boolean;
  error?: boolean;
  onFlip: () => void;
}

export function CardBack({ token, analysis, pending, error, onFlip }: CardBackProps) {
  const scoreColor = (s: number) => (s >= 70 ? 'var(--color-up)' : s >= 45 ? '#e8b64c' : 'var(--color-down)');
  const riskColor =
    analysis?.risk === 'Low' ? 'var(--color-up)' : analysis?.risk === 'Medium' ? '#e8b64c' : 'var(--color-down)';

  return (
    <div className="card-face card-back-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-surface">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="text-[14px] font-bold tracking-tight">
          AI scan <span className="text-ink-3">· ${token.ticker}</span>
        </div>
        <button onClick={onFlip} className="rounded-lg bg-surface-2 p-1.5 text-ink-2 hover:text-ink">
          <Undo2 className="h-4 w-4" />
        </button>
      </div>

      {pending && (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-2 overflow-hidden">
          <div className="scanline absolute inset-x-6 h-12 rounded-full bg-gradient-to-b from-transparent via-pulse/15 to-transparent" />
          <div className="animate-pulse text-[15px] font-semibold text-ink-2">Analyzing…</div>
          <div className="text-[12px] text-ink-3">reading live chain data</div>
        </div>
      )}

      {!pending && error && !analysis && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="text-[14px] font-medium text-ink-2">Analysis unavailable.</div>
          <div className="text-[12px] text-ink-3">No fake scores — try again shortly.</div>
        </div>
      )}

      {!pending && analysis && (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="num flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[20px] font-bold"
              style={{ color: scoreColor(analysis.score), background: 'var(--color-surface-2)' }}
            >
              {analysis.score}
            </div>
            <div>
              <div className="text-[14px] font-bold" style={{ color: riskColor }}>
                {analysis.risk} risk
              </div>
              <div className="text-[11px] text-ink-3">score out of 100</div>
            </div>
          </div>

          <p className="text-[13px] leading-snug text-ink-2">{analysis.summary}</p>

          <div className="space-y-1.5">
            {analysis.pros.slice(0, 3).map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-up" /> {p}
              </div>
            ))}
            {analysis.cons.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-down" /> {c}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
