import { Token } from '@/lib/types';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

// Tiers come from REAL metrics only — never invented numbers.
export function getRarity(t: Token): Rarity {
  const gt = t.gtScore ?? 0;
  if (gt >= 70 || t.liquidity > 50_000) return 'legendary';
  if (gt >= 50 || t.liquidity > 10_000 || t.volume24h > 25_000) return 'epic';
  if (t.liquidity > 2_500 || (t.imageUrl && t.hasX)) return 'rare';
  return 'common';
}

export interface RarityStyle {
  label: string;
  accent: string; // border + chip color
  glow: string; // subtle outer glow, legendary/epic only
}

export const rarityStyles: Record<Rarity, RarityStyle> = {
  common: { label: 'COMMON', accent: '#3a3f47', glow: 'transparent' },
  rare: { label: 'RARE', accent: '#4a90d9', glow: 'transparent' },
  epic: { label: 'EPIC', accent: '#9d6fff', glow: 'rgba(157, 111, 255, 0.18)' },
  legendary: { label: 'LEGENDARY', accent: '#e8b64c', glow: 'rgba(232, 182, 76, 0.22)' },
};
