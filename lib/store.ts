'use client';

import { create } from 'zustand';
import { Token, TradeEvent, FeedStats, FeedPayload, LLMAnalysis } from '@/lib/types';

const NEW_WINDOW_MS = 90_000;

interface PulseState {
  tokens: Token[];
  activity: TradeEvent[];
  stats: FeedStats;
  firstSeenAt: Map<string, number>;
  analyses: Map<string, LLMAnalysis>;
  analysisPending: Set<string>;
  seeded: boolean;
  isLive: boolean;
  lastUpdated: number;
  ingestFeed: (payload: FeedPayload) => void;
  setLive: (live: boolean) => void;
  setAnalysis: (address: string, analysis: LLMAnalysis) => void;
  setAnalysisPending: (address: string, pending: boolean) => void;
}

export const usePulseStore = create<PulseState>((set, get) => ({
  tokens: [],
  activity: [],
  stats: { launches24h: 0, totalVol24h: 0, ethUsd: 0 },
  firstSeenAt: new Map(),
  analyses: new Map(),
  analysisPending: new Set(),
  seeded: false,
  isLive: false,
  lastUpdated: 0,

  ingestFeed: (payload) => {
    const { firstSeenAt, seeded, analyses } = get();
    const now = Date.now();
    const seen = new Map(firstSeenAt);
    for (const t of payload.tokens) {
      if (!seen.has(t.id)) {
        // initial payload seeds silently — no 60 pack-openings on page load
        seen.set(t.id, seeded ? now : 0);
      }
    }
    // apply cached LLM scores on top of feed data
    const tokens = payload.tokens.map((t) => {
      const a = analyses.get(t.id);
      return a ? { ...t, score: a.score, scoreSource: 'llm' as const } : t;
    });
    set({
      tokens,
      activity: payload.activity,
      stats: payload.stats,
      firstSeenAt: seen,
      seeded: true,
      isLive: true,
      lastUpdated: now,
    });
  },

  setLive: (live) => set({ isLive: live }),

  setAnalysis: (address, analysis) => {
    const analyses = new Map(get().analyses);
    analyses.set(address.toLowerCase(), analysis);
    const pending = new Set(get().analysisPending);
    pending.delete(address.toLowerCase());
    set({
      analyses,
      analysisPending: pending,
      tokens: get().tokens.map((t) =>
        t.id === address.toLowerCase() ? { ...t, score: analysis.score, scoreSource: 'llm' } : t,
      ),
    });
  },

  setAnalysisPending: (address, pending) => {
    const set_ = new Set(get().analysisPending);
    if (pending) set_.add(address.toLowerCase());
    else set_.delete(address.toLowerCase());
    set({ analysisPending: set_ });
  },
}));

export function isNewToken(id: string, firstSeenAt: Map<string, number>, now = Date.now()): boolean {
  const seen = firstSeenAt.get(id);
  return !!seen && now - seen < NEW_WINDOW_MS;
}
