'use client';

import { useEffect, useRef } from 'react';
import { usePulseStore } from '@/lib/store';

const POLL_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;
// Analysis happens server-side (once per token, forever, cached in Supabase);
// tokens arrive with `analysis` already attached.

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
