export interface DayScore {
  userId: string;
  finalScore: number;
}

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export interface Podium {
  gold: string[];
  silver: string[];
  bronze: string[];
}

/**
 * Awards medals for ONE day's scores using competition ranking + scaled eligibility:
 *   - fewer than 2 players  -> no medals
 *   - tied players share the better medal; the next medal slot is skipped by the
 *     number tied (positions 1,1,3 -> two golds, no silver, next group is bronze)
 *   - bronze only exists when a group lands on rank 3 (requires 3+ players)
 */
export function computePodium(dayScores: DayScore[]): Podium {
  const podium: Podium = { gold: [], silver: [], bronze: [] };
  if (dayScores.length < 2) return podium;

  // Group userIds by score, then order groups by score descending.
  const byScore = new Map<number, string[]>();
  for (const { userId, finalScore } of dayScores) {
    const group = byScore.get(finalScore) ?? [];
    group.push(userId);
    byScore.set(finalScore, group);
  }
  const groups = [...byScore.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, ids]) => ids);

  let startRank = 1;
  for (const ids of groups) {
    if (startRank === 1) podium.gold = ids;
    else if (startRank === 2) podium.silver = ids;
    else if (startRank === 3) podium.bronze = ids;
    else break;
    startRank += ids.length;
  }
  return podium;
}
