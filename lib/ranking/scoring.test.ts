import { describe, it, expect } from 'vitest';
import { rankScores, actualFraction, expectedFraction, dayDeltas } from './scoring';
import { DEFAULT_CONFIG } from './config';

describe('rankScores', () => {
  it('assigns competition ranks with ties sharing the better place', () => {
    const places = rankScores([
      { userId: 'a', finalScore: 900 },
      { userId: 'b', finalScore: 900 },
      { userId: 'c', finalScore: 800 },
    ]);
    expect(places.get('a')).toBe(1);
    expect(places.get('b')).toBe(1);
    expect(places.get('c')).toBe(3); // 1,1,3
  });
});

describe('actualFraction', () => {
  it('is 1 for a clear winner and 0 for a clear loser', () => {
    const scores = [
      { userId: 'a', finalScore: 900 },
      { userId: 'b', finalScore: 700 },
    ];
    expect(actualFraction('a', scores)).toBe(1);
    expect(actualFraction('b', scores)).toBe(0);
  });
  it('counts ties as half', () => {
    const scores = [
      { userId: 'a', finalScore: 900 },
      { userId: 'b', finalScore: 900 },
      { userId: 'c', finalScore: 700 },
    ];
    // a: beaten=1 (c), tied=1 (b) -> (1 + 0.5)/2 = 0.75
    expect(actualFraction('a', scores)).toBeCloseTo(0.75, 5);
  });
});

describe('expectedFraction', () => {
  it('is 0.5 when self equals the only opponent', () => {
    expect(expectedFraction(1000, [1000], DEFAULT_CONFIG)).toBeCloseTo(0.5, 5);
  });
  it('is above 0.5 when higher rated than the field', () => {
    expect(expectedFraction(1200, [1000], DEFAULT_CONFIG)).toBeGreaterThan(0.5);
  });
});

describe('dayDeltas', () => {
  it('returns no changes for fewer than two players', () => {
    expect(dayDeltas([{ userId: 'a', finalScore: 900 }], new Map(), 1, DEFAULT_CONFIG)).toEqual([]);
  });
  it('rewards the winner positively and the loser negatively when ratings are equal', () => {
    const ratings = new Map([['a', 800], ['b', 800]]);
    const out = dayDeltas(
      [{ userId: 'a', finalScore: 900 }, { userId: 'b', finalScore: 700 }],
      ratings, 1, DEFAULT_CONFIG
    );
    const a = out.find((d) => d.userId === 'a')!;
    const b = out.find((d) => d.userId === 'b')!;
    expect(a.place).toBe(1);
    expect(a.delta).toBeGreaterThan(0);
    expect(b.delta).toBeLessThan(0);
  });
  it('gives an underdog a bigger gain than a favorite for the same win', () => {
    const favorite = dayDeltas(
      [{ userId: 'a', finalScore: 900 }, { userId: 'b', finalScore: 700 }],
      new Map([['a', 1200], ['b', 800]]), 1, DEFAULT_CONFIG
    ).find((d) => d.userId === 'a')!.delta;
    const underdog = dayDeltas(
      [{ userId: 'a', finalScore: 900 }, { userId: 'b', finalScore: 700 }],
      new Map([['a', 800], ['b', 1200]]), 1, DEFAULT_CONFIG
    ).find((d) => d.userId === 'a')!.delta;
    expect(underdog).toBeGreaterThan(favorite);
  });
});
