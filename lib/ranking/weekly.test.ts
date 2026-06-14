import { describe, it, expect } from 'vitest';
import { weekStartOf, weekEndOf, weeklyTotals } from './weekly';

describe('weekStartOf / weekEndOf', () => {
  it('returns the Monday and Sunday bounding a date (Mon-Sun week)', () => {
    // 2026-06-13 is a Saturday
    expect(weekStartOf('2026-06-13')).toBe('2026-06-08'); // Monday
    expect(weekEndOf('2026-06-08')).toBe('2026-06-14');   // Sunday
  });
  it('treats Monday as its own week start and Sunday as the prior Monday', () => {
    expect(weekStartOf('2026-06-08')).toBe('2026-06-08');
    expect(weekStartOf('2026-06-14')).toBe('2026-06-08'); // Sunday -> Monday of same week
  });
});

describe('weeklyTotals', () => {
  it('sums each user\'s scores across the week', () => {
    const totals = weeklyTotals([
      { userId: 'a', finalScore: 900, playDate: '2026-06-08' },
      { userId: 'a', finalScore: 800, playDate: '2026-06-10' },
      { userId: 'b', finalScore: 700, playDate: '2026-06-09' },
    ]);
    expect(totals).toEqual([
      { userId: 'a', finalScore: 1700 },
      { userId: 'b', finalScore: 700 },
    ]);
  });
});
