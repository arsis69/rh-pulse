'use client';

import { useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Token } from '@/lib/types';
import { usePulseStore, isNewToken } from '@/lib/store';
import { getRarity, rarityStyles } from '@/lib/rarity';
import { CardFront } from './CardFront';
import { CardBack } from './CardBack';

interface TokenCardProps {
  token: Token;
  now: number;
}

export function TokenCard({ token, now }: TokenCardProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const rs = rarityStyles[getRarity(token)];

  const firstSeenAt = usePulseStore((s) => s.firstSeenAt);
  const storeAnalysis = usePulseStore((s) => s.analyses.get(token.id));
  const pending = usePulseStore((s) => s.analysisPending.has(token.id));
  const setAnalysis = usePulseStore((s) => s.setAnalysis);
  const setAnalysisPending = usePulseStore((s) => s.setAnalysisPending);
  const isNew = isNewToken(token.id, firstSeenAt, now);
  const analysis = token.analysis ?? storeAnalysis;

  // pointer-tracked tilt: CSS vars on the DOM node, zero React re-renders
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = sceneRef.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const card = el.firstElementChild as HTMLElement;
    card.classList.add('tilting');
    card.style.setProperty('--ry', `${(px - 0.5) * 10}deg`);
    card.style.setProperty('--rx', `${(0.5 - py) * 8}deg`);
  }, []);

  const onPointerLeave = useCallback(() => {
    const card = sceneRef.current?.firstElementChild as HTMLElement | null;
    if (!card) return;
    card.classList.remove('tilting');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  const flip = useCallback(() => {
    setFlipped((f) => {
      const next = !f;
      if (next && !analysis && !pending) {
        // server pre-analyzes newest-first; this is the on-demand fallback
        setAnalysisPending(token.id, true);
        setAnalysisError(false);
        fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: token.id }),
        })
          .then(async (res) => {
            if (!res.ok) throw new Error(String(res.status));
            const json = await res.json();
            setAnalysis(token.id, json.analysis);
          })
          .catch(() => {
            setAnalysisPending(token.id, false);
            setAnalysisError(true);
          });
      }
      return next;
    });
  }, [analysis, pending, token.id, setAnalysis, setAnalysisPending]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -40, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, y: 20 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="relative"
    >
      <div
        className={`rounded-2xl border ${isNew ? 'arrive-glow' : ''}`}
        style={{
          borderColor: rs.accent,
          boxShadow: rs.glow === 'transparent' ? undefined : `0 0 20px ${rs.glow}`,
        }}
      >
        <div ref={sceneRef} className="card-scene" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
          <div className="card-3d relative h-[330px] rounded-2xl">
            <div className={`card-flip relative h-full w-full ${flipped ? 'flipped' : ''}`}>
              <CardFront token={token} now={now} onFlip={flip} />
              <CardBack token={token} analysis={analysis} pending={pending && !analysis} error={analysisError} onFlip={flip} />
            </div>
          </div>
        </div>
      </div>
      {isNew && (
        <span className="num absolute -right-1.5 -top-1.5 z-10 rounded-md bg-pulse px-2 py-0.5 text-[10px] font-bold text-bg shadow-lg">
          NEW
        </span>
      )}
    </motion.div>
  );
}
