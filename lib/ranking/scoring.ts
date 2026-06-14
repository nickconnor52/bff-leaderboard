import type { DayScore, RankingConfig } from './types';

/** Competition ranking (ties share the better place): scores [900,900,800] -> places 1,1,3. */
export function rankScores(scores: DayScore[]): Map<string, number> {
  const sorted = [...scores].sort((a, b) => b.finalScore - a.finalScore);
  const places = new Map<string, number>();
  sorted.forEach((s, i) => {
    const tiedWithPrev = i > 0 && sorted[i - 1].finalScore === s.finalScore;
    places.set(s.userId, tiedWithPrev ? places.get(sorted[i - 1].userId)! : i + 1);
  });
  return places;
}

/** Fraction of the field a player finished ahead of, counting ties as half. 1=best, 0=worst. */
export function actualFraction(userId: string, scores: DayScore[]): number {
  const self = scores.find((s) => s.userId === userId);
  if (!self || scores.length < 2) return 0;
  let beaten = 0;
  let tied = 0;
  for (const s of scores) {
    if (s.userId === userId) continue;
    if (s.finalScore < self.finalScore) beaten += 1;
    else if (s.finalScore === self.finalScore) tied += 1;
  }
  return (beaten + 0.5 * tied) / (scores.length - 1);
}

/** Expected fraction-of-field-beaten from ratings (mean pairwise logistic). */
export function expectedFraction(self: number, opponents: number[], config: RankingConfig): number {
  if (opponents.length === 0) return 0.5;
  const sum = opponents.reduce(
    (acc, o) => acc + 1 / (1 + Math.pow(10, (o - self) / config.dScale)),
    0
  );
  return sum / opponents.length;
}

export interface DayDelta {
  userId: string;
  delta: number;
  place: number;
  fieldSize: number;
}

/**
 * Per-player rating deltas for one event (daily or weekly — pass the relevant weight).
 * delta = (curveScale*(2*actual-1)*weight + kFactor*(actual-expected)) * eventMultiplier.
 * Fewer than 2 players -> no changes.
 */
export function dayDeltas(
  scores: DayScore[],
  ratingByUser: Map<string, number>,
  weight: number,
  config: RankingConfig
): DayDelta[] {
  if (scores.length < 2) return [];
  const places = rankScores(scores);
  const ratingOf = (id: string) => ratingByUser.get(id) ?? config.startRating;
  return scores.map((s) => {
    const actual = actualFraction(s.userId, scores);
    const base = config.curveScale * (2 * actual - 1);
    const opponents = scores.filter((o) => o.userId !== s.userId).map((o) => ratingOf(o.userId));
    const expected = expectedFraction(ratingOf(s.userId), opponents, config);
    const surprise = actual - expected;
    const delta = (base * weight + config.kFactor * surprise) * config.eventMultiplier;
    return { userId: s.userId, delta, place: places.get(s.userId)!, fieldSize: scores.length };
  });
}
