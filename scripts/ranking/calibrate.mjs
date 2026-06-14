// One-off: replay the 47-day history with a candidate config and print the ladder, so we
// can tune curveScale / startRating / bandWidth until Conner = Diamond I and Jason = Iron I.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { replay } = await import('./_compiled/replay.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}` };
const get = (q) => fetch(`${U}/rest/v1/${q}`, { headers: H }).then((r) => r.json());

const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

// Candidate config — edit these and re-run until endpoints land.
const config = {
  curveScale: 33, kFactor: 10, dScale: 200, dailyWeight: 1, weeklyWeight: 3,
  eventMultiplier: 1, bandWidth: 100, ladderFloor: 0, startRating: 560,
  promoPlace: 3, shieldDays: 1,
};

const [profiles, scores, finalized] = await Promise.all([
  get('profiles?select=id,display_name'),
  get('scores?select=user_id,final_score,play_date&limit=2000'),
  get('daily_results?select=play_date&limit=2000'),
]);
const nameById = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
const { standings, events, champions } = replay(
  profiles.map((p) => p.id),
  scores.map((s) => ({ userId: s.user_id, finalScore: s.final_score, playDate: s.play_date })),
  finalized.map((d) => d.play_date),
  config
);

console.log('config:', JSON.stringify(config));
for (const s of standings) {
  console.log(
    `${(nameById[s.userId] ?? s.userId).padEnd(18)} ${TIERS[s.tier]} ${'I'.repeat(s.division)}  ` +
    `LP ${String(s.lp).padStart(3)}  (R ${Math.round(s.rating)})  champ ${s.championCount}`
  );
}

// Pass --write to persist this ladder to the DB (uses this file's `config`; keep it in sync
// with the ranking_config row). Mirrors lib/ranking/persistence.recomputeRanking.
if (process.argv.includes('--write')) {
  const json = { ...H, 'Content-Type': 'application/json' };
  const del = (path, filter) => fetch(`${U}/rest/v1/${path}?${filter}`, { method: 'DELETE', headers: H });
  const post = (path, body, prefer) =>
    fetch(`${U}/rest/v1/${path}`, { method: 'POST', headers: { ...json, Prefer: prefer }, body: JSON.stringify(body) });
  await del('rating_events', 'event_date=neq.1900-01-01');
  await del('weekly_champions', 'week_start=neq.1900-01-01');
  if (events.length) await post('rating_events',
    events.map((e) => ({ user_id: e.userId, kind: e.kind, event_date: e.eventDate, delta: e.delta,
      rating: e.rating, rung: e.rung, lp: e.lp, promo_pending: e.promoPending, shield_active: e.shieldActive })),
    'return=minimal');
  if (champions.length) await post('weekly_champions',
    champions.map((c) => ({ week_start: c.weekStart, champion_user_id: c.championUserId, total_score: c.totalScore })),
    'return=minimal');
  await post('ranking_standings?on_conflict=user_id',
    standings.map((s) => ({ user_id: s.userId, rating: s.rating, tier: s.tier, division: s.division, lp: s.lp,
      promo_pending: s.promoPending, shield_active: s.shieldActive, champion_count: s.championCount,
      updated_at: new Date().toISOString() })),
    'resolution=merge-duplicates,return=minimal');
  console.log('\nwrote standings/events/champions to DB');
}
