// Parse the dumped iMessage thread into reviewable scores, reusing the app's own parser.
// In:  scripts/backfill/data/raw.json  (from dump-chat.sql)
// Out: scripts/backfill/data/backfill_scores.{csv,json}
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseShareText, parseManualScore } from './_compiled/parser.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');
const RAW = join(DATA, 'raw.json');

// phone (last 10 digits) -> [profile_id, display_name]; 'Me' = Nick
const BY10 = {
  '5134779530': ['544ee572-28d3-4706-b6dd-424eef9f58ad', 'Sach Thomas'],
  '5135025993': ['4ce8c437-1a9c-433e-81ef-b5717c4a829f', 'Jason Ratterman'],
  '5857343160': ['3fa1d4a0-70b6-405a-a90f-e9a50f352e10', 'Conner Craig'],
  '6147389585': ['0859e149-590e-4385-87c2-bdfbe14d9709', 'Jordan Mosier'],
  '6149491132': ['e37aade2-9b18-4205-a32e-82147fe37daa', 'RBI Machine'],
  '6307467682': ['df73707a-0100-42e2-a556-fb9c44798f2f', 'Christian Lobello'],
};
const ME = ['cde3e4e8-7a7e-42fb-85b5-a5df374bdb3a', 'Nick'];

function resolveSender(sender) {
  if (sender === 'Me') return ME;
  return BY10[String(sender).replace(/\D/g, '').slice(-10)] ?? null;
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};
// Card month+day anywhere (a URL parenthetical can sit between "maptap.gg" and the date).
const CARD_DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\b/i;
// Custom-emoji reactions are stored as amt=0 but echo the reacted-to card; drop them.
const REACTION_RE = /^(Loved|Liked|Laughed at|Emphasized|Disliked|Questioned|Reacted .*? to)\s+[“"]/u;

const etFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});
function etParts(tsUnix) {
  const p = Object.fromEntries(etFmt.formatToParts(new Date(tsUnix * 1000)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, ymd: `${p.year}-${p.month}-${p.day}` };
}
const pad = (n) => String(n).padStart(2, '0');

function cardPlayDate(text, et) {
  const m = text.match(CARD_DATE_RE);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  let year = et.y;
  if (month === 12 && et.m === 1) year = et.y - 1;
  else if (month === 1 && et.m === 12) year = et.y + 1;
  return `${year}-${pad(month)}-${pad(+m[2])}`;
}

const rows = JSON.parse(readFileSync(RAW, 'utf8'));
const out = [];
let shares = 0, bares = 0, skippedUnknownSender = 0, nonScore = 0, noCardDate = 0, reactions = 0;

for (const r of rows) {
  const who = resolveSender(r.sender);
  const et = etParts(r.ts_unix);
  const text = r.text ?? '';
  if (REACTION_RE.test(text)) { reactions++; continue; }

  const share = parseShareText(text);
  if (share) {
    if (!who) { skippedUnknownSender++; continue; }
    let playDate = cardPlayDate(text, et);
    let needsReview = false, reason = '';
    if (!playDate) { playDate = et.ymd; needsReview = true; reason = 'no card date (used msg date)'; noCardDate++; }
    shares++;
    out.push({ playDate, profileId: who[0], name: who[1], score: share.finalScore,
      source: 'share', needsReview, reason, msgEt: et.ymd, raw: text,
      cats: share.categoryScores, comment: share.commentText });
    continue;
  }

  if (/^\d{1,3}$/.test(text.trim())) {
    const score = parseManualScore(text);
    if (score === null) { nonScore++; continue; }
    if (!who) { skippedUnknownSender++; continue; }
    bares++;
    out.push({ playDate: et.ymd, profileId: who[0], name: who[1], score,
      source: 'bare', needsReview: true, reason: 'bare number — confirm', msgEt: et.ymd, raw: text,
      cats: {}, comment: null });
    continue;
  }
  nonScore++;
}

// Bound to the maptap era (first real share) and drop implausible bare noise.
const eraStart = out.filter((r) => r.source === 'share').map((r) => r.playDate).sort()[0];
const MIN_BARE = 300; // observed share floor ~387; <300 bares are old-chatter noise
let droppedPreEra = 0, droppedLowBare = 0;
const kept = out.filter((r) => {
  if (r.source === 'share') return true;
  if (r.playDate < eraStart) { droppedPreEra++; return false; }
  if (r.score < MIN_BARE) { droppedLowBare++; return false; }
  return true;
});

// Dedupe / conflict per (profile, play_date)
const groups = new Map();
for (const row of kept) {
  const k = row.profileId + '|' + row.playDate;
  (groups.get(k) ?? groups.set(k, []).get(k)).push(row);
}
const final = [];
let conflicts = 0;
for (const g of groups.values()) {
  const distinct = new Set(g.map((x) => x.score));
  if (distinct.size === 1) {
    final.push(g.find((x) => x.source === 'share') ?? g[0]);
  } else {
    conflicts++;
    for (const x of g) final.push({ ...x, needsReview: true, reason: `same-day conflict (${[...distinct].sort((a, b) => a - b).join('/')})` });
  }
}
final.sort((a, b) => a.playDate.localeCompare(b.playDate) || a.name.localeCompare(b.name));

const esc = (v) => `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' ⏎ ')}"`;
const header = ['play_date', 'display_name', 'profile_id', 'final_score', 'source', 'needs_review', 'reason', 'msg_date_et', 'raw_text'];
writeFileSync(join(DATA, 'backfill_scores.csv'),
  [header.join(',')].concat(final.map((r) => [r.playDate, r.name, r.profileId, r.score, r.source, r.needsReview, r.reason, r.msgEt, r.raw].map(esc).join(','))).join('\n'));
writeFileSync(join(DATA, 'backfill_scores.json'), JSON.stringify(final));

const dates = final.map((r) => r.playDate).sort();
const perPlayer = {};
for (const r of final) perPlayer[r.name] = (perPlayer[r.name] ?? 0) + 1;
console.log('=== BACKFILL EXTRACTION SUMMARY ===');
console.log('messages scanned:', rows.length, '| shares:', shares, '| bares:', bares, '| reactions skipped:', reactions);
console.log('era start:', eraStart, '| dropped pre-era bares:', droppedPreEra, '| dropped <' + MIN_BARE + ':', droppedLowBare);
console.log('unknown senders:', skippedUnknownSender, '| no card date:', noCardDate);
console.log('final rows:', final.length, '| needs_review:', final.filter((r) => r.needsReview).length, '| conflicts:', conflicts);
console.log('date range:', dates[0], '→', dates[dates.length - 1]);
console.log('per player:', perPlayer);
