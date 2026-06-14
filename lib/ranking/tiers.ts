export const TIER_NAMES = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Emerald'] as const;

/** Accent hex per tier index (0=Iron .. 6=Emerald, the top tier). */
export const TIER_ACCENT: Record<number, string> = {
  0: '#6f7fa3', // Iron — dark cobalt-gray
  1: '#d9a36b', // Bronze
  2: '#cdd6df', // Silver
  3: '#ecc658', // Gold
  4: '#5fe0d4', // Platinum — cyan-teal
  5: '#7cc2ff', // Diamond
  6: '#1fc983', // Emerald — medium jewel-green (kept distinct from Platinum's cyan)
};

const ROMAN = ['I', 'II', 'III'];

/** e.g. rankLabel(5, 1) => "Diamond I". `division` is 1..3. */
export function rankLabel(tier: number, division: number): string {
  const name = TIER_NAMES[tier] ?? 'Unranked';
  return `${name} ${ROMAN[division - 1] ?? ''}`.trim();
}

/** Division 1..3 -> fill level 1..3 (1=outline, 2=semi, 3=solid), clamped. */
export function fillLevel(division: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, division)) as 1 | 2 | 3;
}
