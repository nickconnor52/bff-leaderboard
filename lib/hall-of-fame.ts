import type { SupabaseClient } from '@supabase/supabase-js';
import { tallyMedals } from './medals';

export interface HallOfFameRow {
  userId: string;
  playerName: string;
  gold: number;
  silver: number;
  bronze: number;
}

/**
 * Builds the Hall of Fame purely from medals derived over FINALIZED days
 * (`daily_results`) of the `scores` table; players are named by profile display name.
 * Sorted by gold, then silver, then bronze, then name. Degrades to [] on error.
 *
 * (Historical wins were imported into `scores` as real rows on 2026-06-13, so the
 * former `historical_wins` seed table was retired — see migration 0007.)
 */
export async function fetchHallOfFame(supabase: SupabaseClient): Promise<HallOfFameRow[]> {
  try {
    const [scoresRes, profilesRes, finalizedRes] = await Promise.all([
      supabase.from('scores').select('user_id, final_score, play_date'),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('daily_results').select('play_date'),
    ]);

    const scores = (scoresRes.data ?? []).map((r) => ({
      userId: r.user_id as string,
      finalScore: r.final_score as number,
      playDate: r.play_date as string,
    }));
    const profileNames = new Map<string, string>();
    for (const p of profilesRes.data ?? []) {
      profileNames.set(p.id as string, p.display_name as string);
    }
    const finalizedDates = new Set((finalizedRes.data ?? []).map((d) => d.play_date as string));

    const derived = tallyMedals(scores, finalizedDates);
    const rows: HallOfFameRow[] = [];
    for (const [userId, counts] of derived) {
      rows.push({
        userId,
        playerName: profileNames.get(userId) ?? 'Unknown',
        gold: counts.gold,
        silver: counts.silver,
        bronze: counts.bronze,
      });
    }

    return rows.sort(
      (a, b) =>
        b.gold - a.gold ||
        b.silver - a.silver ||
        b.bronze - a.bronze ||
        a.playerName.localeCompare(b.playerName)
    );
  } catch {
    return [];
  }
}
