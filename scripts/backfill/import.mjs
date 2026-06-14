// Bulk service-role upsert of the extracted scores into `scores` (entry_method='import').
// Applies the one agreed manual edit: transfer Jason's last win (2026-06-01) to Nick.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;

const rows = JSON.parse(readFileSync(join(HERE, 'data', 'backfill_scores.json'), 'utf8'));

// --- Steal Jason's last win (2026-06-01): swap Nick <-> Jason that day ---
const DATE = '2026-06-01';
const NICK = 'cde3e4e8-7a7e-42fb-85b5-a5df374bdb3a';
const JASON = '4ce8c437-1a9c-433e-81ef-b5717c4a829f';
const n = rows.find((r) => r.playDate === DATE && r.profileId === NICK);
const j = rows.find((r) => r.playDate === DATE && r.profileId === JASON);
if (n && j) {
  for (const f of ['score', 'cats', 'comment', 'raw']) { const t = n[f]; n[f] = j[f]; j[f] = t; }
  console.log(`swap applied: Nick=${n.score}, Jason=${j.score} on ${DATE}`);
}

const records = rows.map((r) => ({
  user_id: r.profileId,
  play_date: r.playDate,
  final_score: r.score,
  category_scores: r.cats ?? {},
  comment_text: r.comment ?? null,
  raw_share_text: r.raw ?? String(r.score),
  parse_status: 'ok',
  entry_method: 'import',
}));

const res = await fetch(`${U}/rest/v1/scores?on_conflict=user_id,play_date`, {
  method: 'POST',
  headers: { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(records),
});
console.log('upsert status:', res.status, res.statusText);
if (!res.ok) console.log('body:', await res.text());
else console.log('imported records:', records.length);
