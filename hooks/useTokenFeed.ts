'use client';

import { useEffect, useRef } from 'react';
import { usePulseStore } from '@/lib/store';

const POLL_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;

// Auto-analyze: every token gets one AI scan, newest first, one per poll cycle.
// The server dedupes globally (Supabase cache + in-flight map), so many open
// tabs don't multiply LLM calls.
const analyzeFailed = new Set<string>();

function autoAnalyzeNext() {
  const { tokens, analyses, analysisPending, setAnalysis, setAnalysisPending } = usePulseStore.getState();
  if (analysisPending.size > 0) return;
  const next = tokens.find((t) => !analyses.has(t.id) && !analyzeFailed.has(t.id));
  if (!next) return;
  setAnalysisPending(next.id, true);
  fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: next.id }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setAnalysis(next.id, json.analysis);
    })
    .catch(() => {
      analyzeFailed.add(next.id); // don't hammer a failing token; card flip can retry
      setAnalysisPending(next.id, false);
    });
}

export function useTokenFeed() {
  const ingestFeed = usePulseStore((s) => s.ingestFeed);
  const setLive = usePulseStore((s) => s.setLive);
  const backoff = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch('/api/feed', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        ingestFeed(await res.json());
        backoff.current = 0;
        autoAnalyzeNext();
      } catch {
        setLive(false);
        backoff.current = Math.min((backoff.current || POLL_MS) * 2, MAX_BACKOFF_MS);
      }
      const jitter = Math.random() * 500;
      timer = setTimeout(tick, (backoff.current || POLL_MS) + jitter);
    };

    tick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ingestFeed, setLive]);
}
