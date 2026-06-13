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

/**
 * Tallies medals per user across every CLOSED day. A day is closed when its
 * `playDate` (ISO `YYYY-MM-DD`) is strictly before `todayEt`. Pure: no clock access.
 */
export function tallyMedals(
  scores: { userId: string; finalScore: number; playDate: string }[],
  todayEt: string
): Map<string, MedalCounts> {
  const byDay = new Map<string, DayScore[]>();
  for (const s of scores) {
    if (s.playDate >= todayEt) continue; // skip today + future
    const day = byDay.get(s.playDate) ?? [];
    day.push({ userId: s.userId, finalScore: s.finalScore });
    byDay.set(s.playDate, day);
  }

  const tally = new Map<string, MedalCounts>();
  const bump = (userId: string, medal: keyof MedalCounts) => {
    const counts = tally.get(userId) ?? { gold: 0, silver: 0, bronze: 0 };
    counts[medal] += 1;
    tally.set(userId, counts);
  };

  for (const day of byDay.values()) {
    const podium = computePodium(day);
    podium.gold.forEach((u) => bump(u, 'gold'));
    podium.silver.forEach((u) => bump(u, 'silver'));
    podium.bronze.forEach((u) => bump(u, 'bronze'));
  }
  return tally;
}
