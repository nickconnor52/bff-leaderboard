import type { CSSProperties } from 'react';
import { TIER_ACCENT, rankLabel, fillLevel } from '@/lib/ranking/tiers';

export interface RankBadgeProps {
  tier: number;
  division: number;
  lp?: number;
  showLp?: boolean;
  size?: 'sm' | 'md';
}

function badgeStyle(tier: number, division: number): CSSProperties {
  const c = TIER_ACCENT[tier] ?? TIER_ACCENT[0];
  const fill = fillLevel(division);
  const base: CSSProperties = { borderStyle: 'solid', borderWidth: 1 };

  // Emerald III: the fanciest rung on the ladder — vivid green gradient + strong glow.
  if (tier === 6 && fill === 3) {
    return {
      ...base,
      background: 'linear-gradient(180deg,#22d98c,#0e9a63)',
      color: '#04140e',
      borderColor: '#5fefb6',
      boxShadow: '0 0 16px rgba(40,220,150,.78)',
    };
  }

  // Diamond III: gradient + strong glow.
  if (tier === 5 && fill === 3) {
    return {
      ...base,
      background: 'linear-gradient(180deg,#2f78d6,#1c4f9c)',
      color: '#eaf6ff',
      borderColor: '#7cc2ff',
      boxShadow: '0 0 14px rgba(124,194,255,.7)',
    };
  }

  let style: CSSProperties;
  if (fill === 1) {
    style = { ...base, background: 'transparent', borderColor: `color-mix(in srgb, ${c} 50%, transparent)`, color: c };
  } else if (fill === 2) {
    style = { ...base, background: `color-mix(in srgb, ${c} 18%, #0d1117)`, borderColor: `color-mix(in srgb, ${c} 65%, transparent)`, color: c };
  } else {
    style = { ...base, background: `color-mix(in srgb, ${c} 34%, #0d1117)`, borderColor: c, color: `color-mix(in srgb, ${c} 88%, white)` };
  }
  if (tier === 4 && fill === 3) style.boxShadow = '0 0 8px rgba(95,224,212,.45)'; // Platinum III
  if (tier === 5 && fill === 2) style.boxShadow = '0 0 7px rgba(124,194,255,.35)'; // Diamond II
  return style;
}

export function RankBadge({ tier, division, lp, showLp = false, size = 'md' }: RankBadgeProps) {
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <span
      style={{
        ...badgeStyle(tier, division),
        padding: size === 'sm' ? '4px 9px' : '6px 11px',
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
      }}
    >
      {rankLabel(tier, division)}
      {showLp && lp !== undefined && (
        <span style={{ opacity: 0.65, fontWeight: 500, fontSize: fontSize - 1 }}>{lp}</span>
      )}
    </span>
  );
}
