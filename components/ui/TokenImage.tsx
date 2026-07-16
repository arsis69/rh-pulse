'use client';

import { useState } from 'react';

interface TokenImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
}

// Images arrive already routed through /api/img (server-side proxy handles IPFS
// gateway fallback + edge caching), so the client just renders or falls back.
export function TokenImage({ src, alt, className, fallbackClassName, priority }: TokenImageProps) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-2 to-surface-3 ${fallbackClassName ?? ''}`}
      >
        <span className="font-extrabold tracking-tight text-ink-3/20">
          {alt.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={className}
      onError={() => setError(true)}
    />
  );
}
