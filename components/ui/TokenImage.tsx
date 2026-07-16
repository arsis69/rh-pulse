'use client';

import { useState } from 'react';

interface TokenImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  priority?: boolean;
}

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://nftstorage.link/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
];

function ipfsGatewayUrl(url: string, index: number): string {
  for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
    if (url.startsWith(IPFS_GATEWAYS[i])) {
      const next = i + index;
      if (next >= IPFS_GATEWAYS.length) return url;
      return url.replace(IPFS_GATEWAYS[i], IPFS_GATEWAYS[next]);
    }
  }
  return url;
}

export function TokenImage({ src, alt, className, fallbackClassName, priority }: TokenImageProps) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
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

  const currentSrc = ipfsGatewayUrl(src, gatewayIndex);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
      className={className}
      onError={() => {
        const next = gatewayIndex + 1;
        // count how many IPFS gateways exist for this url; if exhausted, show fallback
        let gatewayCount = 0;
        for (const g of IPFS_GATEWAYS) {
          if (src.startsWith(g)) {
            gatewayCount = IPFS_GATEWAYS.length;
            break;
          }
        }
        if (gatewayCount > 0 && next < gatewayCount) {
          setGatewayIndex(next);
        } else {
          setError(true);
        }
      }}
    />
  );
}
