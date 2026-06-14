import { describe, it, expect } from 'vitest';
import { replay, type DatedScore } from './replay';
import { DEFAULT_CONFIG } from './config';

const userIds = ['a', 'b', 'c'];

function makeScores(): DatedScore[] {
  // Two days in the same Mon-Sun week (2026-06-08 Mon .. 2026-06-14 Sun).
  return [
    { userId: 'a', finalScore: 900, playDate: '2026-06-08' },
    { userId: 'b', finalScore: 800, playDate: '2026-06-08' },
    { userId: 'c', finalScore: 700, playDate: '2026-06-08' },
    { userId: 'a', finalScore: 950, playDate: '2026-06-09' },
    { userId: 'b', finalScore: 850, playDate: '2026-06-09' },
    { userId: 'c', finalScore: 600, playDate: '2026-06-09' },
  ];
}

describe('replay', () => {
  it('is deterministic and ranks the consistent winner highest', () => {
    const finalized = ['2026-06-08', '2026-06-09'];
    const r1 = replay(userIds, makeScores(), finalized, DEFAULT_CONFIG);
    const r2 = replay(userIds, makeScores(), finalized, DEFAULT_CONFIG);
    expect(r1.standings).toEqual(r2.standings); // deterministic
    const byUser = Object.fromEntries(r1.standings.map((s) => [s.userId, s.rating]));
    expect(byUser['a']).toBeGreaterThan(byUser['b']);
    expect(byUser['b']).toBeGreaterThan(byUser['c']);
  });

  it('emits a daily event per submitter per day', () => {
    const { events } = replay(userIds, makeScores(), ['2026-06-08', '2026-06-09'], DEFAULT_CONFIG);
    const daily = events.filter((e) => e.kind === 'daily');
    expect(daily).toHaveLength(6);
  });

  it('crowns the weekly champion once the week has fully closed', () => {
    // Include the Sunday (2026-06-14) so the Mon-Sun week is complete.
    const scores: DatedScore[] = [
      ...makeScores(),
      { userId: 'a', finalScore: 500, playDate: '2026-06-14' },
      { userId: 'b', finalScore: 999, playDate: '2026-06-14' },
    ];
    const finalized = ['2026-06-08', '2026-06-09', '2026-06-14'];
    const { champions, events } = replay(userIds, scores, finalized, DEFAULT_CONFIG);
    // Weekly totals: a=2350, b=2649, c=1300 -> champion is b.
    expect(champions).toHaveLength(1);
    expect(champions[0].weekStart).toBe('2026-06-08');
    expect(champions[0].championUserId).toBe('b');
    expect(champions[0].totalScore).toBe(2649);
    expect(events.some((e) => e.kind === 'weekly')).toBe(true);
  });

  it('does not crown a champion for a week still in progress', () => {
    // Only Mon/Tue finalized; the week's Sunday hasn't occurred.
    const { champions } = replay(userIds, makeScores(), ['2026-06-08', '2026-06-09'], DEFAULT_CONFIG);
    expect(champions).toHaveLength(0);
  });
});
