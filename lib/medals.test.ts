import { describe, it, expect } from 'vitest';
import { computePodium, tallyMedals } from './medals';
import { etToday } from './hall-of-fame';

describe('computePodium', () => {
  it('awards nothing when fewer than 2 players competed', () => {
    expect(computePodium([])).toEqual({ gold: [], silver: [], bronze: [] });
    expect(computePodium([{ userId: 'a', finalScore: 100 }])).toEqual({
      gold: [],
      silver: [],
      bronze: [],
    });
  });

  it('awards gold + silver for 2 players, no bronze', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 80 },
      ])
    ).toEqual({ gold: ['a'], silver: ['b'], bronze: [] });
  });

  it('awards full podium for 3+ players', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 80 },
        { userId: 'c', finalScore: 50 },
      ])
    ).toEqual({ gold: ['a'], silver: ['b'], bronze: ['c'] });
  });

  it('shares gold on a tie for 1st and skips silver (3 players)', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 100 },
        { userId: 'c', finalScore: 50 },
      ])
    ).toEqual({ gold: ['a', 'b'], silver: [], bronze: ['c'] });
  });

  it('shares silver on a tie for 2nd and awards no bronze', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 80 },
        { userId: 'c', finalScore: 80 },
      ])
    ).toEqual({ gold: ['a'], silver: ['b', 'c'], bronze: [] });
  });

  it('shares gold among two and awards no silver/bronze for a 2-player tie', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 100 },
      ])
    ).toEqual({ gold: ['a', 'b'], silver: [], bronze: [] });
  });
});

describe('tallyMedals', () => {
  const scores = [
    // day 1: a gold, b silver, c bronze
    { userId: 'a', finalScore: 100, playDate: '2026-06-10' },
    { userId: 'b', finalScore: 80, playDate: '2026-06-10' },
    { userId: 'c', finalScore: 50, playDate: '2026-06-10' },
    // day 2: b gold, a silver (2 players)
    { userId: 'b', finalScore: 90, playDate: '2026-06-11' },
    { userId: 'a', finalScore: 70, playDate: '2026-06-11' },
  ];

  it('accumulates medals per user across days', () => {
    const tally = tallyMedals(scores, '2026-06-13');
    expect(tally.get('a')).toEqual({ gold: 1, silver: 1, bronze: 0 });
    expect(tally.get('b')).toEqual({ gold: 1, silver: 1, bronze: 0 });
    expect(tally.get('c')).toEqual({ gold: 0, silver: 0, bronze: 1 });
  });

  it('excludes today and future days (only closed days count)', () => {
    // todayEt = day 2, so only day 1 counts
    const tally = tallyMedals(scores, '2026-06-11');
    expect(tally.get('a')).toEqual({ gold: 1, silver: 0, bronze: 0 });
    expect(tally.get('b')).toEqual({ gold: 0, silver: 1, bronze: 0 });
    expect(tally.get('c')).toEqual({ gold: 0, silver: 0, bronze: 1 });
  });

  it('returns an empty map when no days are closed', () => {
    expect(tallyMedals(scores, '2026-06-10').size).toBe(0);
  });
});

describe('etToday', () => {
  it('formats a date as an ISO YYYY-MM-DD string in Eastern Time', () => {
    // 2026-06-13T02:00:00Z is still 2026-06-12 (22:00) in America/New_York
    expect(etToday(new Date('2026-06-13T02:00:00Z'))).toBe('2026-06-12');
    // 2026-06-13T12:00:00Z is 2026-06-13 (08:00) in America/New_York
    expect(etToday(new Date('2026-06-13T12:00:00Z'))).toBe('2026-06-13');
  });
});
