'use client';

import { useMemo, useState } from 'react';

interface TokenImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
}

// Deterministic, crisp SVG fallback so every token has a visual even when no
// upstream image exists. Hash the address/ticker into a gradient + initials.
function fallbackSvg(seed: string, label: string): string {
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    return Math.abs(h);
  };
  const h = hash(seed);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >> 8) % 60)) % 360;
  const sat = 70 + (h % 20);
  const light1 = 35 + (h % 15);
  const light2 = 45 + ((h >> 4) % 20);
  const c1 = `hsl(${hue1} ${sat}% ${light1}%)`;
  const c2 = `hsl(${hue2} ${sat}% ${light2}%)`;
  // XML-escape and NEVER btoa: tickers contain emoji/unicode, and btoa throws
  // InvalidCharacterError outside Latin1 — this crashed the whole app for every
  // visitor the moment one unicode-ticker token entered the feed.
  const text = label
    .slice(0, 2)
    .toUpperCase()
    .replace(/[<>&'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/><text x="64" y="76" font-size="52" font-weight="800" font-family="system-ui,sans-serif" text-anchor="middle" fill="rgba(0,0,0,0.55)">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Images arrive already routed through /api/img (server-side proxy handles IPFS
// gateway fallback + edge caching), so the client just renders or falls back.
export function TokenImage({ src, alt, className, fallbackClassName, priority }: TokenImageProps) {
  const [error, setError] = useState(false);
  const seed = useMemo(() => src || alt || Math.random().toString(), [src, alt]);
  const fallback = useMemo(() => fallbackSvg(seed, alt), [seed, alt]);

  const imgSrc = src && !error ? src : fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={`${className ?? ''} ${!src || error ? (fallbackClassName ?? '') : ''}`}
      onError={() => setError(true)}
    />
  );
}
