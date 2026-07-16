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
  frame: string; // border gradient
  glow: string; // box-shadow color
  foilOpacity: number;
  chip: string; // rarity chip color
}

export const rarityStyles: Record<Rarity, RarityStyle> = {
  common: {
    label: 'COMMON',
    frame: 'linear-gradient(160deg, #2A2E3F 0%, #1C1F2C 60%, #2A2E3F 100%)',
    glow: 'transparent',
    foilOpacity: 0,
    chip: '#8B93A7',
  },
  rare: {
    label: 'RARE',
    frame: 'linear-gradient(160deg, #1E3A5F 0%, #274B7A 45%, #4A90D9 75%, #1E3A5F 100%)',
    glow: 'rgba(74, 144, 217, 0.25)',
    foilOpacity: 0.16,
    chip: '#4A90D9',
  },
  epic: {
    label: 'EPIC',
    frame: 'linear-gradient(160deg, #3B2A6B 0%, #5B3FA8 40%, #9D6FFF 70%, #3B2A6B 100%)',
    glow: 'rgba(157, 111, 255, 0.32)',
    foilOpacity: 0.28,
    chip: '#9D6FFF',
  },
  legendary: {
    label: 'LEGENDARY',
    frame: 'linear-gradient(160deg, #6B4A1B 0%, #C89B3C 35%, #F5D06E 55%, #C89B3C 75%, #6B4A1B 100%)',
    glow: 'rgba(245, 208, 110, 0.38)',
    foilOpacity: 0.45,
    chip: '#F5D06E',
  },
};

// Deterministic fallback art: two hues derived from the address.
export function fallbackArt(address: string): string {
  let h = 0;
  for (let i = 2; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0;
  const h1 = h % 360;
  const h2 = (h1 + 40 + (h % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 70% 22%) 0%, hsl(${h2} 80% 38%) 100%)`;
}
