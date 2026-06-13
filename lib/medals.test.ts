import { describe, it, expect } from 'vitest';
import { computePodium } from './medals';

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
