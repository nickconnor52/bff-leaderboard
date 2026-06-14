import { describe, it, expect } from 'vitest';
import { TIER_NAMES, TIER_ACCENT, rankLabel, fillLevel } from './tiers';

describe('tiers', () => {
  it('has seven tier names with a hex accent for each (Emerald is the top tier)', () => {
    expect(TIER_NAMES).toHaveLength(7);
    expect(TIER_NAMES[6]).toBe('Emerald');
    for (let t = 0; t < 7; t++) expect(TIER_ACCENT[t]).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('formats rank labels with roman division numerals', () => {
    expect(rankLabel(6, 1)).toBe('Emerald I');
    expect(rankLabel(5, 1)).toBe('Diamond I');
    expect(rankLabel(0, 3)).toBe('Iron III');
    expect(rankLabel(2, 2)).toBe('Silver II');
  });
  it('clamps division to a 1..3 fill level', () => {
    expect(fillLevel(1)).toBe(1);
    expect(fillLevel(2)).toBe(2);
    expect(fillLevel(3)).toBe(3);
  });
});
