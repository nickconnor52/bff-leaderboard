import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeaderboardEntry } from './leaderboard';

/**
 * Picks the player the subtitle should make fun of: today's last place if anyone
 * has played today, otherwise the all-time last place. Returns null only if zero
 * scores have ever been recorded.
 */
export function getSubtitleTarget(entriesByPeriod: LeaderboardEntry[][]): LeaderboardEntry | null {
  const [daily, , , allTime] = entriesByPeriod;

  if (daily.length > 0) return daily[daily.length - 1];
  if (allTime.length > 0) return allTime[allTime.length - 1];
  return null;
}

/**
 * Returns a random nickname for the given user, or `fallbackName` if they have no
 * nicknames seeded yet.
 */
export async function fetchRandomNickname(
  supabase: SupabaseClient,
  userId: string,
  fallbackName: string
): Promise<string> {
  const { data } = await supabase.from('nicknames').select('nickname').eq('user_id', userId);

  if (!data || data.length === 0) return fallbackName;

  const index = Math.floor(Math.random() * data.length);
  return data[index].nickname;
}
