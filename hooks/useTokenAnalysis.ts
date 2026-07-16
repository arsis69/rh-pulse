'use client';

import { useEffect, useState, useCallback } from 'react';
import { Token } from '@/lib/types';
import { usePulseStore } from '@/lib/store';

export function useTokenAnalysis(token: Token | null) {
  const setAnalysis = usePulseStore((s) => s.setAnalysis);
  const storeAnalysis = usePulseStore((s) => (token ? s.analyses.get(token.id) : undefined));

  const analysis = token?.analysis ?? storeAnalysis;
  const [loading, setLoading] = useState(!analysis);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    if (!token || analysis) return;
    setError(false);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }, [token, analysis]);

  useEffect(() => {
    if (!token || analysis) return;

    let cancelled = false;
    const id = token.id;

    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: id }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (!cancelled) {
          setAnalysis(id, json.analysis);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, analysis, setAnalysis, retryKey]);

  return {
    analysis,
    pending: loading && !analysis,
    error: error && !analysis,
    retry,
  };
}
