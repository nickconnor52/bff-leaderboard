import type { SupabaseClient } from '@supabase/supabase-js';
import { computePodium, formatPodiumText, type DayScore } from './medals';
import { notifyPodium } from './push';
import { etToday } from './dates';

interface ScoreWithProfile {
  user_id: string;
  final_score: number;
  profiles: { display_name: string } | { display_name: string }[] | null;
}

function displayNameFrom(profiles: ScoreWithProfile['profiles']): string {
  if (!profiles) return 'Unknown';
  return Array.isArray(profiles) ? (profiles[0]?.display_name ?? 'Unknown') : profiles.display_name;
}

/**
 * Finalizes a day exactly once: records it in `daily_results` and sends the podium push.
 * Returns true if it finalized on this call, false otherwise (already finalized, no
 * scores, or — without `force` — not everyone has submitted yet). Must use the
 * service-role client. Best-effort: callers should not let a thrown error fail their work.
 */
export async function finalizeDay(
  supabase: SupabaseClient,
  playDate: string,
  opts: { force?: boolean } = {}
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('daily_results')
    .select('play_date')
    .eq('play_date', playDate)
    .maybeSingle();
  if (existing) return false;

  const { data: profileRows } = await supabase.from('profiles').select('id');
  const { data: scoreRows } = await supabase
    .from('scores')
    .select('user_id, final_score, profiles(display_name)')
    .eq('play_date', playDate);

  const scores = (scoreRows ?? []) as ScoreWithProfile[];
  const totalProfiles = (profileRows ?? []).length;

  if (scores.length === 0) return false;
  if (!opts.force && scores.length < totalProfiles) return false;

  // Insert the finalize record; a PK conflict means a concurrent call won the race.
  const { error: insertError } = await supabase
    .from('daily_results')
    .insert({ play_date: playDate });
  if (insertError) return false;

  const dayScores: DayScore[] = scores.map((s) => ({
    userId: s.user_id,
    finalScore: s.final_score,
  }));
  const nameByUserId = new Map<string, string>();
  for (const s of scores) nameByUserId.set(s.user_id, displayNameFrom(s.profiles));

  const podium = computePodium(dayScores);
  await notifyPodium(supabase, formatPodiumText(podium, nameByUserId));
  return true;
}

/** Instant path: try to finalize today (no force). */
export async function maybeFinalizeToday(supabase: SupabaseClient): Promise<boolean> {
  return finalizeDay(supabase, etToday());
}
