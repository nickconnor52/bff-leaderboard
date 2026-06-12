import type { SupabaseClient } from '@supabase/supabase-js';

export type HistoricalWin = {
  playerName: string;
  wins: number;
  note: string | null;
};

/**
 * Fetches the pre-app "Hall of Fame" win tallies, ranked most wins first.
 * Returns an empty array on any error (e.g. the table not existing yet) so the
 * leaderboard page degrades gracefully rather than crashing.
 */
export async function fetchHistoricalWins(supabase: SupabaseClient): Promise<HistoricalWin[]> {
  try {
    const { data, error } = await supabase
      .from('historical_wins')
      .select('player_name, wins, note')
      .order('wins', { ascending: false })
      .order('player_name', { ascending: true });

    if (error || !data) return [];

    return data.map((row) => ({
      playerName: row.player_name,
      wins: row.wins,
      note: row.note ?? null,
    }));
  } catch {
    return [];
  }
}
