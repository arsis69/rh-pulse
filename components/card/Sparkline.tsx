'use client';

// Single-series micro line: 2px stroke, polarity color, no axes/legend (title = the card).
export function Sparkline({ points, width = 96, height = 28 }: { points?: number[]; width?: number; height?: number }) {
  if (!points || points.length < 2 || points.every((p) => p === points[0])) {
    return (
      <svg width={width} height={height} aria-hidden>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--color-edge-bright)" strokeWidth={2} strokeDasharray="3 4" />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  const up = points[points.length - 1] >= points[0];
  const color = up ? 'var(--color-up)' : 'var(--color-down)';
  return (
    <svg width={width} height={height} aria-label={up ? 'price up' : 'price down'}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={height - 2 - ((points[points.length - 1] - min) / span) * (height - 4)} r={2.5} fill={color} />
    </svg>
  );
}
