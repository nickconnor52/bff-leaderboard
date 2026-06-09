import type { SupabaseClient } from '@supabase/supabase-js';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all-time';

export interface ScoreRow {
  user_id: string;
  final_score: number;
  display_name: string;
  comment_text: string | null;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalScore: number;
  gamesPlayed: number;
  averageScore: number;
  /**
   * Only populated when exactly one game contributed to this entry — for the
   * `daily` period that's always true; for longer periods it avoids picking an
   * arbitrary comment out of several days' worth of banter.
   */
  comment: string | null;
}

export function aggregateLeaderboard(rows: ScoreRow[]): LeaderboardEntry[] {
  const byUser = new Map<
    string,
    { displayName: string; total: number; count: number; lastComment: string | null }
  >();

  for (const row of rows) {
    const existing = byUser.get(row.user_id) ?? {
      displayName: row.display_name,
      total: 0,
      count: 0,
      lastComment: null,
    };
    existing.total += row.final_score;
    existing.count += 1;
    existing.lastComment = row.comment_text;
    byUser.set(row.user_id, existing);
  }

  return Array.from(byUser.entries())
    .map(([userId, { displayName, total, count, lastComment }]) => ({
      userId,
      displayName,
      totalScore: total,
      gamesPlayed: count,
      averageScore: Math.round(total / count),
      comment: count === 1 ? lastComment : null,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getDateRange(
  period: LeaderboardPeriod,
  referenceDate: Date
): { start: string; end: string } | null {
  if (period === 'all-time') return null;

  if (period === 'daily') {
    const day = toIsoDate(referenceDate);
    return { start: day, end: day };
  }

  if (period === 'weekly') {
    const start = new Date(referenceDate);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }

  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

interface ScoreWithProfile {
  user_id: string;
  final_score: number;
  comment_text: string | null;
  profiles: { display_name: string } | { display_name: string }[] | null;
}

function displayNameFrom(profiles: ScoreWithProfile['profiles']): string {
  if (!profiles) return 'Unknown';
  return Array.isArray(profiles) ? (profiles[0]?.display_name ?? 'Unknown') : profiles.display_name;
}

export async function fetchLeaderboard(
  supabase: SupabaseClient,
  period: LeaderboardPeriod,
  referenceDate: Date = new Date()
): Promise<LeaderboardEntry[]> {
  const range = getDateRange(period, referenceDate);

  let query = supabase
    .from('scores')
    .select('user_id, final_score, comment_text, profiles(display_name)');
  if (range) {
    query = query.gte('play_date', range.start).lte('play_date', range.end);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: ScoreRow[] = (data ?? []).map((row: ScoreWithProfile) => ({
    user_id: row.user_id,
    final_score: row.final_score,
    display_name: displayNameFrom(row.profiles),
    comment_text: row.comment_text,
  }));

  return aggregateLeaderboard(rows);
}
