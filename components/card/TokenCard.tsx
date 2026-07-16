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
  onTrade: (t: Token) => void;
}

export function TokenCard({ token, now, onTrade }: TokenCardProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  const [analysisError, setAnalysisError] = useState(false);
  const rarity = getRarity(token);
  const rs = rarityStyles[rarity];

  const firstSeenAt = usePulseStore((s) => s.firstSeenAt);
  const analysis = usePulseStore((s) => s.analyses.get(token.id));
  const pending = usePulseStore((s) => s.analysisPending.has(token.id));
  const setAnalysis = usePulseStore((s) => s.setAnalysis);
  const setAnalysisPending = usePulseStore((s) => s.setAnalysisPending);
  const isNew = isNewToken(token.id, firstSeenAt, now);

  // pointer-tracked tilt + holo: CSS vars on the DOM node, zero React re-renders
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = sceneRef.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const card = el.firstElementChild as HTMLElement;
    card.classList.add('tilting');
    card.style.setProperty('--ry', `${(px - 0.5) * 20}deg`);
    card.style.setProperty('--rx', `${(0.5 - py) * 16}deg`);
    card.style.setProperty('--mx', `${px * 100}%`);
    card.style.setProperty('--my', `${py * 100}%`);
    card.style.setProperty('--holo-o', String(rsFoil(rarity)));
  }, [rarity]);

  const onPointerLeave = useCallback(() => {
    const card = sceneRef.current?.firstElementChild as HTMLElement | null;
    if (!card) return;
    card.classList.remove('tilting');
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
    card.style.setProperty('--holo-o', '0');
  }, []);

  const flip = useCallback(() => {
    setFlipped((f) => {
      const next = !f;
      if (next && !analysis && !pending) {
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
      initial={{ opacity: 0, y: -48, scale: 0.55, rotateY: -180 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 24 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      className="relative"
      style={{ perspective: 1200 }}
    >
      {/* rarity frame */}
      <div
        className={`rounded-[18px] p-[2px] ${isNew ? 'arrive-glow' : ''}`}
        style={{ background: rs.frame, boxShadow: rs.glow === 'transparent' ? undefined : `0 0 24px ${rs.glow}` }}
      >
        <div ref={sceneRef} className="card-scene" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
          <div className="card-3d relative h-[290px] rounded-2xl">
            <div className={`card-flip relative h-full w-full ${flipped ? 'flipped' : ''}`}>
              <CardFront token={token} now={now} onTrade={onTrade} onFlip={flip} />
              <CardBack token={token} analysis={analysis} pending={pending} error={analysisError} onFlip={flip} />
            </div>
            <div className="holo" />
          </div>
        </div>
      </div>
      {isNew && (
        <span className="font-display absolute -right-1.5 -top-1.5 z-10 rounded-md bg-pulse px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-bg shadow-lg">
          NEW
        </span>
      )}
    </motion.div>
  );
}

function rsFoil(r: ReturnType<typeof getRarity>): number {
  return rarityStyles[r].foilOpacity;
}
