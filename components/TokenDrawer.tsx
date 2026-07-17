'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ExternalLink,
  ScanSearch,
  Globe,
  MessageCircle,
  Check,
  AlertCircle,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { Token } from '@/lib/types';
import { fmtUsd, fmtAge, cleanDescription } from '@/lib/format';
import { gmgnUrl, safeHttpUrl, safeSocialUrl } from '@/lib/geckoShared';
import { scoreColor } from '@/lib/score';
import { TokenImage } from '@/components/ui/TokenImage';
import { useTokenAnalysis } from '@/hooks/useTokenAnalysis';

const RISK_COLOR: Record<string, string> = {
  Low: 'var(--color-up)',
  Medium: 'var(--color-legendary)',
  High: 'var(--color-down)',
};

interface TokenDrawerProps {
  token: Token | null;
  onClose: () => void;
  now: number;
}

export function TokenDrawer({ token, onClose, now }: TokenDrawerProps) {
  useEffect(() => {
    if (!token) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [token, onClose]);

  const { analysis, pending, error, retry } = useTokenAnalysis(token);

  return (
    <AnimatePresence>
      {token && (
        <>
          {/* overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          {/* panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            // full height, never truncated: top+bottom both pinned so the inner
            // area owns the scroll (the old max-h-[85vh] applied at every
            // breakpoint and cut the panel — and its content — at 85% of screen)
            className="fixed inset-x-0 bottom-0 top-12 z-50 flex flex-col overflow-hidden rounded-t-2xl border border-edge bg-surface shadow-2xl sm:inset-y-2 sm:left-auto sm:right-2 sm:top-2 sm:w-full sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex h-full flex-col">
              {/* header */}
              <div className="flex items-center justify-between border-b border-edge px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 overflow-hidden rounded-xl ring-1 ring-edge">
                    <TokenImage
                      key={token.imageUrl}
                      src={token.imageUrl}
                      alt={token.ticker}
                      className="h-full w-full object-cover"
                      fallbackClassName="text-[14px]"
                      priority
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[22px] font-bold leading-none">${token.ticker}</div>
                    <div className="mt-0.5 truncate text-[13px] text-ink-3">{token.name}</div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-xl bg-surface-2 p-2 text-ink-2 transition-colors hover:text-ink"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* scrollable content */}
              <div className="no-scrollbar flex-1 overflow-y-auto p-5 space-y-5">
                {/* banner */}
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-edge">
                  <TokenImage
                    key={token.bannerUrl || token.imageUrl}
                    src={token.bannerUrl || token.imageUrl}
                    alt={token.ticker}
                    className="h-full w-full object-cover"
                    fallbackClassName="text-8xl"
                    priority
                  />
                </div>

                {/* trust score hero + why it's that number */}
                {token.score !== undefined && token.scoreSource != null && (
                  <div className="rounded-2xl border border-edge bg-surface-2 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">Trust score</div>
                        <div className="mt-1 text-[13px] text-ink-2">Live chain signals · ranked vs the board</div>
                      </div>
                      <div
                        className="num flex h-12 w-12 items-center justify-center rounded-xl text-[20px] font-bold"
                        style={{ color: scoreColor(token.score), background: 'var(--color-surface)' }}
                      >
                        {token.score}
                      </div>
                    </div>

                    {/* Warning chips are hidden for now (they still cap the score
                        and feed the AI) — concentration needs to settle after the
                        contract-holder fix before we surface it as a hard claim. */}
                    {token.scoreParts && token.scoreParts.length > 0 && (
                      <div className="mt-3 space-y-2.5 border-t border-edge pt-3">
                        {/* detail sits on its own line: squeezed into a column it
                            truncated to "deployer unknown (not count" */}
                        {token.scoreParts.map((p) => {
                          const counted = p.weight > 0;
                          return (
                            // grid, not flex+manual padding: a fixed label column
                            // guarantees the detail line below lines up with the
                            // bar exactly, instead of eyeballing a padding value
                            // that has to match the label width + gap by hand
                            // (it didn't, hence the "tilted left" look).
                            <div key={p.label} className="grid grid-cols-[104px_1fr_44px] items-center gap-2">
                              <div className="text-[12px] text-ink-2">{p.label}</div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                                {counted && (
                                  <div
                                    className="h-full rounded-full bg-pulse"
                                    style={{ width: `${(p.value / p.weight) * 100}%` }}
                                  />
                                )}
                              </div>
                              <div className="num text-right text-[12px] text-ink-2">
                                {counted ? `${p.value}/${p.weight}` : '—'}
                              </div>
                              {/* the "—" already says it isn't counted */}
                              <div className="col-start-2 col-end-4 -mt-0.5 text-[11px] leading-snug text-ink-2">
                                {p.detail}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* core stats */}
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Market Cap" value={fmtUsd(token.mcap)} />
                  <Stat label="Liquidity" value={fmtUsd(token.liquidity)} />
                  <Stat label="Volume 24h" value={fmtUsd(token.volume24h)} />
                  <Stat label="Age" value={token.createdAt > 0 ? fmtAge(token.createdAt, now) : '—'} />
                  {token.holders !== undefined && <Stat label="Holders" value={token.holders.toLocaleString()} />}
                  {token.txns24h !== undefined && <Stat label="Txns 24h" value={token.txns24h.toLocaleString()} />}
                </div>

                {/* socials + links — deployer-supplied values, sanitized before rendering */}
                <div className="flex flex-wrap items-center gap-2">
                  <MaybeSocial href={safeSocialUrl('twitter', token.twitter)} icon={X} label="X" />
                  <MaybeSocial href={safeSocialUrl('telegram', token.telegram)} icon={MessageCircle} label="TG" />
                  <MaybeSocial href={safeHttpUrl(token.website)} icon={Globe} label="Web" />
                  <a
                    href={gmgnUrl(token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl border border-edge bg-surface-2 px-3 py-2 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink"
                  >
                    GMGN <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* contract */}
                <ContractBox address={token.address} />

                {/* description — sources hard-truncate it, so never show a severed word */}
                {token.description && (
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
                    {cleanDescription(token.description)}
                  </p>
                )}

                {/* ai analysis */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4">
                  <div className="flex items-center gap-2 text-[14px] font-bold">
                    <ScanSearch className="h-4 w-4 text-pulse" />
                    AI scan
                  </div>

                  {pending && (
                    <div className="mt-4 space-y-3">
                      <div className="h-4 w-3/4 rounded bg-surface shimmer" />
                      <div className="h-4 w-1/2 rounded bg-surface shimmer" />
                      <div className="h-4 w-2/3 rounded bg-surface shimmer" />
                      <div className="text-[12px] text-ink-3">Reading live chain data…</div>
                    </div>
                  )}

                  {error && !pending && !analysis && (
                    <div className="mt-4">
                      <div className="flex items-start gap-2 text-[13px] text-ink-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-down" />
                        AI analysis failed. The LLM endpoint may be busy.
                      </div>
                      <button
                        onClick={retry}
                        className="btn-press mt-3 inline-flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-2 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                      </button>
                    </div>
                  )}

                  {analysis && !pending && (
                    <div className="mt-4 space-y-4">
                      {/* the model gives the verdict + the words; the number is
                          the deterministic chain score shown above */}
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-12 items-center justify-center rounded-xl px-3 text-[14px] font-bold"
                          style={{
                            color: RISK_COLOR[analysis.risk],
                            background: 'var(--color-surface)',
                          }}
                        >
                          {analysis.risk} risk
                        </div>
                        <div className="text-[11px] text-ink-3">
                          AI verdict from live chain data
                        </div>
                      </div>

                      <p className="text-[13px] leading-relaxed text-ink-2">{analysis.summary}</p>

                      <div className="space-y-2">
                        {analysis.pros.slice(0, 3).map((p, i) => (
                          <div key={`pro-${i}`} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-up" /> {p}
                          </div>
                        ))}
                        {analysis.cons.slice(0, 3).map((c, i) => (
                          <div key={`con-${i}`} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
                            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-down" /> {c}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* trading paused */}
                <div className="rounded-2xl border border-edge bg-surface-2 p-4 text-center">
                  <div className="text-[13px] font-semibold text-ink-2">Direct trading is paused</div>
                  <div className="mt-1 text-[12px] text-ink-3">Use the GMGN link above to buy.</div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-surface-2 p-3">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-ink-2">{label}</div>
      <div className="num mt-1.5 text-[20px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function MaybeSocial({ href, icon, label }: { href?: string; icon: React.ElementType; label: string }) {
  if (!href) return null;
  return <SocialLink href={href} icon={icon} label={label} />;
}

function SocialLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded-xl border border-edge bg-surface-2 px-3 py-2 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

function ContractBox({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="group w-full rounded-xl border border-edge bg-surface-2 p-3 text-left transition-colors hover:border-pulse/50"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Contract</span>
        <span className="text-ink-3 transition-colors group-hover:text-pulse">
          {copied ? <Check className="h-4 w-4 text-up" /> : <Copy className="h-4 w-4" />}
        </span>
      </div>
      <div className="mt-1 break-all num text-[12px] text-ink">{address}</div>
    </button>
  );
}
