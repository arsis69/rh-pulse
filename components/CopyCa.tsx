'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyCaProps {
  address: string;
  label?: string;
}

export function CopyCa({ address, label = '$PULSE Contract Address' }: CopyCaProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers / restricted contexts
      const input = document.createElement('input');
      input.value = address;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-[640px] rounded-2xl border border-edge bg-surface p-5 shadow-sm sm:p-6">
      <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-3">{label}</div>
      <div className="mt-3 flex items-start gap-3">
        <code className="flex-1 break-all font-mono text-[17px] font-medium leading-snug text-ink sm:text-[20px]">
          {address}
        </code>
        <button
          onClick={handleCopy}
          aria-label="Copy contract address"
          className="btn-press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-edge bg-surface-2 text-ink-2 transition-colors hover:border-edge-bright hover:text-ink"
        >
          {copied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
