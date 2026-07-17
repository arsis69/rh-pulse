export function fmtUsd(v: number): string {
  if (!v) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  if (v >= 1) return `$${v.toFixed(0)}`;
  // sub-cent dust rendered as a flat "$0.00", which reads as a real zero and is
  // how "$0.00 1h vol" got onto the ticker tape
  if (v < 0.01) return '<$0.01';
  return `$${v.toFixed(2)}`;
}

/**
 * Descriptions arrive pre-truncated by their source — the virtuals API hard-cuts
 * at exactly 500 chars server-side (even its detail endpoint), so text lands
 * mid-word: "…confidence, coverage, and reproducible evi". The full text does not
 * exist to fetch. Cut back to the last sentence, or failing that the last whole
 * word, and mark it elided rather than showing a severed word.
 */
export function cleanDescription(raw: string): string {
  const s = raw.replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return s;
  // Only text ending mid-word is suspect. Checking for terminal punctuation
  // instead treats "…rug pulls solidly on Solana! ⚡" as truncated and eats the
  // emoji — plenty of these end on an emoji, a quote or a bracket.
  if (!/[\p{L}\p{N}]$/u.test(s)) return s;

  const sentenceEnd = Math.max(s.lastIndexOf('. '), s.lastIndexOf('! '), s.lastIndexOf('? '));
  // only trust a sentence break if it doesn't throw away most of the text
  if (sentenceEnd > s.length * 0.6) return s.slice(0, sentenceEnd + 1);
  const lastSpace = s.lastIndexOf(' ');
  return `${(lastSpace > 0 ? s.slice(0, lastSpace) : s).replace(/[,;:]$/, '')}…`;
}

export function fmtAge(createdAt: number, now = Date.now()): string {
  const s = Math.max(Math.floor(now / 1000 - createdAt), 0);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

export function fmtEth(v: number): string {
  if (v >= 1) return `${v.toFixed(2)} ETH`;
  if (v >= 0.001) return `${v.toFixed(3)} ETH`;
  return `${(v * 1e6).toFixed(0)}μΞ`;
}

export function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// Rough visual progress for bonding-curve tokens. Replace with real target when available.
export function fmtPct(v: number): string {
  const sign = v >= 0 ? '+' : '';
  if (Math.abs(v) >= 1000) return `${sign}${Math.round(v / 100) / 10}k%`;
  if (Math.abs(v) >= 100) return `${sign}${v.toFixed(0)}%`;
  return `${sign}${v.toFixed(1)}%`;
}
