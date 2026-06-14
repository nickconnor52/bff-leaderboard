import type { LadderState, RankingConfig, RatingEvent, Standing, WeeklyChampion } from './types';
import { dayDeltas } from './scoring';
import { applyEvent, deriveStanding, initialState, rungForRating } from './ladder';
import { weekStartOf, weekEndOf, weeklyTotals } from './weekly';
import { rankScores } from './scoring';

export interface DatedScore {
  userId: string;
  finalScore: number;
  playDate: string;
}

export interface ReplayResult {
  standings: Standing[];
  events: RatingEvent[];
  champions: WeeklyChampion[];
}

/**
 * Deterministic replay over finalized days (and the weeks they complete), in chronological
 * order. Daily events apply first; a week's weekly event applies right after its last day,
 * before the next week begins. A week is only scored once fully in the past.
 */
export function replay(
  userIds: string[],
  scores: DatedScore[],
  finalizedDates: string[],
  config: RankingConfig
): ReplayResult {
  const states = new Map<string, LadderState>(userIds.map((id) => [id, initialState(config)]));
  const championCount = new Map<string, number>(userIds.map((id) => [id, 0]));
  const events: RatingEvent[] = [];
  const champions: WeeklyChampion[] = [];

  const ratingMap = () => new Map([...states].map(([id, s]) => [id, s.rating]));

  const scoresInRange = (start: string, end: string) =>
    scores.filter((s) => s.playDate >= start && s.playDate <= end);

  const processDaily = (date: string) => {
    const day = scores.filter((s) => s.playDate === date).map((s) => ({ userId: s.userId, finalScore: s.finalScore }));
    const deltas = dayDeltas(day, ratingMap(), config.dailyWeight, config);
    for (const d of deltas) {
      const before = states.get(d.userId)!;
      const after = applyEvent(before, d.delta, d.place, d.fieldSize, config);
      states.set(d.userId, after);
      events.push({
        userId: d.userId, kind: 'daily', eventDate: date, delta: d.delta, rating: after.rating,
        rung: rungForRating(after.rating, config),
        lp: deriveStanding(d.userId, after, 0, config).lp,
        promoPending: after.promoPending, shieldActive: after.shieldActive,
      });
    }
  };

  const processWeekly = (weekStart: string, lastDate: string) => {
    if (weekEndOf(weekStart) > lastDate) return; // week not fully in the past
    const rows = scoresInRange(weekStart, weekEndOf(weekStart));
    const totals = weeklyTotals(rows);
    if (totals.length < 2) return;
    const deltas = dayDeltas(totals, ratingMap(), config.weeklyWeight, config);
    for (const d of deltas) {
      const before = states.get(d.userId)!;
      const after = applyEvent(before, d.delta, d.place, d.fieldSize, config, false); // weekly never promotes
      states.set(d.userId, after);
      events.push({
        userId: d.userId, kind: 'weekly', eventDate: weekStart, delta: d.delta, rating: after.rating,
        rung: rungForRating(after.rating, config),
        lp: deriveStanding(d.userId, after, 0, config).lp,
        promoPending: after.promoPending, shieldActive: after.shieldActive,
      });
    }
    const places = rankScores(totals);
    const champ = totals.find((t) => places.get(t.userId) === 1)!;
    champions.push({ weekStart, championUserId: champ.userId, totalScore: champ.finalScore });
    championCount.set(champ.userId, (championCount.get(champ.userId) ?? 0) + 1);
  };

  const dates = [...finalizedDates].sort();
  const lastDate = dates[dates.length - 1];
  let currentWeek: string | null = null;

  for (const date of dates) {
    const wk = weekStartOf(date);
    if (currentWeek !== null && wk !== currentWeek) {
      processWeekly(currentWeek, lastDate); // previous week completed
    }
    currentWeek = wk;
    processDaily(date);
  }
  if (currentWeek !== null) processWeekly(currentWeek, lastDate); // final week if fully past

  const standings = userIds.map((id) =>
    deriveStanding(id, states.get(id)!, championCount.get(id) ?? 0, config)
  );
  return { standings, events, champions };
}
