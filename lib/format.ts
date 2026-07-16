export function fmtUsd(v: number): string {
  if (!v) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  if (v >= 1) return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
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
export function curvePct(liquidity: number): number {
  return Math.min(100, Math.max(0, (liquidity / 60_000) * 100));
}
