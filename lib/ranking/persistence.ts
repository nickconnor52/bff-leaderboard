import type { SupabaseClient } from '@supabase/supabase-js';
import type { RankingConfig, Standing } from './types';
import { DEFAULT_CONFIG } from './config';
import { replay, type DatedScore } from './replay';

/** Loads the single config row; falls back to DEFAULT_CONFIG on any miss. */
export async function loadConfig(supabase: SupabaseClient): Promise<RankingConfig> {
  const { data } = await supabase.from('ranking_config').select('*').eq('id', 1).maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return {
    curveScale: Number(data.curve_scale),
    kFactor: Number(data.k_factor),
    dScale: Number(data.d_scale),
    dailyWeight: Number(data.daily_weight),
    weeklyWeight: Number(data.weekly_weight),
    eventMultiplier: Number(data.event_multiplier),
    bandWidth: Number(data.band_width),
    ladderFloor: Number(data.ladder_floor),
    startRating: Number(data.start_rating),
    promoPlace: Number(data.promo_place),
    shieldDays: Number(data.shield_days),
  };
}

/** Reads current standings (highest rating first). */
export async function fetchStandings(supabase: SupabaseClient): Promise<Standing[]> {
  const { data } = await supabase
    .from('ranking_standings')
    .select('user_id, rating, tier, division, lp, promo_pending, shield_active, champion_count')
    .order('rating', { ascending: false });
  return (data ?? []).map((r) => ({
    userId: r.user_id as string,
    rating: Number(r.rating),
    tier: r.tier as number,
    division: r.division as number,
    lp: r.lp as number,
    promoPending: r.promo_pending as boolean,
    shieldActive: r.shield_active as boolean,
    championCount: r.champion_count as number,
  }));
}

/**
 * Full recompute: replay all history and overwrite standings, rating_events, and
 * weekly_champions. Idempotent. MUST use the service-role client.
 */
export async function recomputeRanking(service: SupabaseClient): Promise<void> {
  const config = await loadConfig(service);

  const [{ data: profiles }, { data: scoreRows }, { data: finalizedRows }] = await Promise.all([
    service.from('profiles').select('id'),
    service.from('scores').select('user_id, final_score, play_date'),
    service.from('daily_results').select('play_date'),
  ]);

  const userIds = (profiles ?? []).map((p) => p.id as string);
  const scores: DatedScore[] = (scoreRows ?? []).map((s) => ({
    userId: s.user_id as string,
    finalScore: s.final_score as number,
    playDate: s.play_date as string,
  }));
  const finalized = (finalizedRows ?? []).map((d) => d.play_date as string);

  const { standings, events, champions } = replay(userIds, scores, finalized, config);

  // Overwrite derived tables. Delete-all then insert (cheap at this scale).
  await service.from('rating_events').delete().neq('event_date', '1900-01-01');
  await service.from('weekly_champions').delete().neq('week_start', '1900-01-01');

  if (events.length) {
    await service.from('rating_events').insert(
      events.map((e) => ({
        user_id: e.userId, kind: e.kind, event_date: e.eventDate, delta: e.delta,
        rating: e.rating, rung: e.rung, lp: e.lp,
        promo_pending: e.promoPending, shield_active: e.shieldActive,
      }))
    );
  }
  if (champions.length) {
    await service.from('weekly_champions').insert(
      champions.map((c) => ({
        week_start: c.weekStart, champion_user_id: c.championUserId, total_score: c.totalScore,
      }))
    );
  }
  await service.from('ranking_standings').upsert(
    standings.map((s) => ({
      user_id: s.userId, rating: s.rating, tier: s.tier, division: s.division, lp: s.lp,
      promo_pending: s.promoPending, shield_active: s.shieldActive,
      champion_count: s.championCount, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'user_id' }
  );
}
