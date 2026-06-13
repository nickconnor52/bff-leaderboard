import type { SupabaseClient } from '@supabase/supabase-js';
import { tallyMedals, type MedalCounts } from './medals';

export interface HallOfFameRow {
  playerName: string;
  gold: number;
  silver: number;
  bronze: number;
  note: string | null;
}

/** Current date in America/New_York as an ISO `YYYY-MM-DD` string. */
export function etToday(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

interface SeedRow {
  player_name: string;
  wins: number;
  note: string | null;
  user_id: string | null;
}

/** Fetches the pre-app seed; returns [] on error so the page degrades gracefully. */
async function fetchSeed(supabase: SupabaseClient): Promise<SeedRow[]> {
  try {
    const { data, error } = await supabase
      .from('historical_wins')
      .select('player_name, wins, note, user_id');
    if (error || !data) return [];
    return data as SeedRow[];
  } catch {
    return [];
  }
}

/**
 * Builds the Hall of Fame: pre-app seed golds merged with medals derived live from the
 * `scores` table (matched by `historical_wins.user_id`). Unlinked seed rows show golds
 * only; derived-only players (no seed row) appear by their profile display name.
 * Sorted by gold, then silver, then bronze, then name. Degrades to seed-only on error.
 */
export async function fetchHallOfFame(supabase: SupabaseClient): Promise<HallOfFameRow[]> {
  const seed = await fetchSeed(supabase);

  let derived = new Map<string, MedalCounts>();
  const profileNames = new Map<string, string>();
  try {
    const [scoresRes, profilesRes] = await Promise.all([
      supabase.from('scores').select('user_id, final_score, play_date'),
      supabase.from('profiles').select('id, display_name'),
    ]);
    const scores = (scoresRes.data ?? []).map((r) => ({
      userId: r.user_id as string,
      finalScore: r.final_score as number,
      playDate: r.play_date as string,
    }));
    for (const p of profilesRes.data ?? []) {
      profileNames.set(p.id as string, p.display_name as string);
    }
    derived = tallyMedals(scores, etToday());
  } catch {
    // Leave derived empty -> Hall of Fame falls back to seed-only.
  }

  const rows: HallOfFameRow[] = [];
  const linkedUserIds = new Set<string>();

  for (const s of seed) {
    const d = s.user_id ? derived.get(s.user_id) : undefined;
    if (s.user_id) linkedUserIds.add(s.user_id);
    rows.push({
      playerName: s.player_name,
      gold: s.wins + (d?.gold ?? 0),
      silver: d?.silver ?? 0,
      bronze: d?.bronze ?? 0,
      note: s.note ?? null,
    });
  }

  for (const [userId, counts] of derived) {
    if (linkedUserIds.has(userId)) continue;
    rows.push({
      playerName: profileNames.get(userId) ?? 'Unknown',
      gold: counts.gold,
      silver: counts.silver,
      bronze: counts.bronze,
      note: null,
    });
  }

  return rows.sort(
    (a, b) =>
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.playerName.localeCompare(b.playerName)
  );
}
