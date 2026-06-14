// Finalize every imported day (direct daily_results inserts -> no push spam), then
// recompute the Hall of Fame from the live DB exactly as the app does, to verify.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { tallyMedals } = await import('./_compiled/medals.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const get = (q) => fetch(`${U}/rest/v1/${q}`, { headers: H }).then((r) => r.json());

const imp = JSON.parse(readFileSync(join(HERE, 'data', 'backfill_scores.json'), 'utf8'));
const dates = [...new Set(imp.map((r) => r.playDate))].sort();
const res = await fetch(`${U}/rest/v1/daily_results?on_conflict=play_date`, {
  method: 'POST', headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
  body: JSON.stringify(dates.map((d) => ({ play_date: d }))),
});
console.log('finalize daily_results:', res.status, '| distinct days:', dates.length);

const [scores, profiles, finalized] = await Promise.all([
  get('scores?select=user_id,final_score,play_date&limit=2000'),
  get('profiles?select=id,display_name'),
  get('daily_results?select=play_date&limit=2000'),
]);
const nameById = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
const finals = new Set(finalized.map((d) => d.play_date));
const tally = tallyMedals(scores.map((s) => ({ userId: s.user_id, finalScore: s.final_score, playDate: s.play_date })), finals);
const board = [...tally.entries()].map(([id, c]) => ({ name: nameById[id], ...c })).sort((a, b) => b.gold - a.gold || b.silver - a.silver);

console.log('\n=== LIVE Hall of Fame (derived from scores) ===');
for (const r of board) console.log(' ', r.name.padEnd(18), '🥇', String(r.gold).padStart(2), '🥈', String(r.silver).padStart(2), '🥉', String(r.bronze).padStart(2));
console.log('total golds:', board.reduce((a, b) => a + b.gold, 0), '| finalized days:', finals.size, '| total scores:', scores.length);
