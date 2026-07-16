'use client';

import { Token, LLMAnalysis } from '@/lib/types';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface CardBackProps {
  token: Token;
  analysis?: LLMAnalysis;
  pending: boolean;
  error?: boolean;
  onFlip: () => void;
}

function ScoreDial({ score }: { score: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? 'var(--color-up)' : score >= 45 ? '#eab308' : 'var(--color-down)';
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--color-edge)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <span className="num absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

export function CardBack({ token, analysis, pending, error, onFlip }: CardBackProps) {
  const riskColor =
    analysis?.risk === 'Low' ? 'var(--color-up)' : analysis?.risk === 'Medium' ? '#eab308' : 'var(--color-down)';

  return (
    <div className="card-face card-back-face card-back-pattern absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-surface-2">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <div className="font-display text-[11px] font-bold tracking-wider text-pulse">AI SCAN · ${token.ticker}</div>
        <button onClick={onFlip} className="rounded-md border border-edge-bright p-1 text-ink-2 hover:border-pulse hover:text-pulse">
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {pending && (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden">
          <div className="scanline absolute inset-x-4 h-10 rounded-full bg-gradient-to-b from-transparent via-pulse/20 to-transparent" />
          <div className="font-display animate-pulse text-[11px] tracking-widest text-ink-2">ANALYZING…</div>
          <div className="text-[10px] text-ink-3">grok is reading the chain</div>
        </div>
      )}

      {!pending && error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <div className="text-[11px] text-ink-2">Analysis unavailable right now.</div>
          <div className="text-[10px] text-ink-3">No fake scores here — flip back and retry in a bit.</div>
        </div>
      )}

      {!pending && !error && analysis && (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          <div className="flex items-center gap-3">
            <ScoreDial score={analysis.score} />
            <div>
              <div
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ color: riskColor, border: `1px solid ${riskColor}55` }}
              >
                {analysis.risk} risk
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-ink-2">{analysis.summary}</p>
            </div>
          </div>
          <div className="space-y-1">
            {analysis.pros.slice(0, 3).map((p, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-ink-2">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-up" /> {p}
              </div>
            ))}
            {analysis.cons.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-ink-2">
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-down" /> {c}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
