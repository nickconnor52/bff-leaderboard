# Daily Medal Engine + Hall of Fame Design

## Overview

Make the Hall of Fame show live 🥇🥈🥉 medal counts per player, derived from real
games combined with the pre-app seed (`historical_wins`). Medals are **computed from
the `scores` table on read** — no stored counters, no cron, no new tables. This keeps a
single source of truth and stays consistent with the project plan that parsed chat logs
will become the authoritative score history (see `historical-data-import-plan` memory):
once real history is imported into `scores`, those days automatically start counting and
the seed can be dropped.

This is **sub-project 1 of 2**. Sub-project 2 (web push notifications) is specced
separately and builds on top of this. The instant "all players submitted" detection and
the daily cutoff cron exist only to time the *notification*, so they are explicitly **out
of scope here** — this sub-project counts closed (past-ET) days, which is correct and
keeps it dependency-free.

## Decisions (locked during brainstorming)

- **Medals are derived from `scores`, not stored.** Hall of Fame = pre-app seed golds +
  medals derived from real games.
- **Full medals** 🥇🥈🥉 (not just wins).
- **Day boundaries use Eastern Time** (`America/New_York`). `play_date` is a bare `date`.
- **Eligibility (scaled by participants on a day):** 1 player → no medals; 2 players →
  gold + silver; 3+ players → gold + silver + bronze.
- **Only closed days count:** a day counts toward medals when its `play_date` is strictly
  before the current ET date. Today's in-progress day appears the next ET day.
- **Ties:** standard competition ranking — players with an equal `final_score` share the
  better medal, and the next medal slot(s) are skipped by the number tied (e.g. two tie
  for 1st → both 🥇, no 🥈; the next distinct score gets 🥉 only if 3+ players competed).

## Components

### 1. `lib/medals.ts` (new, pure, unit-tested)

The whole ranking core, with no I/O so it is fully unit-testable.

```ts
export interface DayScore {
  userId: string;
  finalScore: number;
}

export interface MedalCounts {
  gold: number;
  silver: number;
  bronze: number;
}

// Award medals for ONE day's scores, honoring eligibility + tie rules.
// Returns the set of userIds that earned each medal that day.
export function computePodium(dayScores: DayScore[]): {
  gold: string[];
  silver: string[];
  bronze: string[];
};

// Tally medals across many days. `playDate` is the ISO date string of each score's day;
// `todayEt` is the current ET date (ISO). Only days with playDate < todayEt are counted.
export function tallyMedals(
  scores: { userId: string; finalScore: number; playDate: string }[],
  todayEt: string
): Map<string, MedalCounts>;
```

**`computePodium` algorithm:**
1. If fewer than 2 players competed that day (participant count, i.e. number of scores),
   return all-empty (no medals).
2. Sort by `finalScore` desc. Group players by score to detect ties.
3. Assign medals by competition rank:
   - The top score group gets **gold**.
   - The next distinct score group gets **silver** — only if 2+ players competed.
   - The following distinct score group gets **bronze** — only if 3+ players competed.
   - Skipped slots: if N players tie for gold, there is no silver (the next group is
     bronze); if 2+ tie at the silver slot, there is no bronze.

**`tallyMedals` algorithm:** filter to `playDate < todayEt`, group rows by `playDate`,
run `computePodium` per day, and accumulate per-userId `MedalCounts`.

### 2. `lib/hall-of-fame.ts` (new — absorbs `lib/historical-wins.ts`)

Orchestrates fetching + merging. `lib/historical-wins.ts` and its `fetchHistoricalWins`
are removed; the `historical_wins` table is still the seed source.

```ts
export interface HallOfFameRow {
  playerName: string;
  gold: number;
  silver: number;
  bronze: number;
  note: string | null;
}

export async function fetchHallOfFame(supabase: SupabaseClient): Promise<HallOfFameRow[]>;
```

Behavior:
- Fetch seed rows: `historical_wins(player_name, wins, note, user_id)`.
- Fetch all `scores(user_id, final_score, play_date)` and `profiles(id, display_name)`.
- `todayEt` from an ET date helper (`Intl.DateTimeFormat('en-CA', { timeZone:
  'America/New_York' })` → ISO `YYYY-MM-DD`).
- `derived = tallyMedals(scores, todayEt)` keyed by userId.
- **Merge:**
  - Each seed row becomes a `HallOfFameRow`: `gold = seed.wins + derived[user_id].gold`
    (when `user_id` is linked), `silver`/`bronze` from `derived` (when linked) else 0,
    `playerName = seed.player_name`, `note = seed.note`.
  - Any `derived` userId **not** referenced by a seed row's `user_id` becomes a new row
    using the profile's `display_name`, with no note.
  - Players with neither seed nor derived medals are omitted.
- **Sort:** `gold` desc, then `silver` desc, then `bronze` desc, then `playerName` asc.
- **Resilience:** wrap in try/catch; on any error return seed-only rows (golds only) so
  the page never crashes — mirrors the current `fetchHistoricalWins` behavior.

### 3. `components/leaderboard/hall-of-fame.tsx` (modify)

Takes `HallOfFameRow[]`. Renders rank on the left, player name, then three compact
medal-count columns (🥇 🥈 🥉) on the right. Footnotes (e.g. Jason's `note`) remain below
the list. Empty input → renders nothing (unchanged).

### 4. `app/page.tsx` (modify)

Replace the `fetchHistoricalWins` call with `fetchHallOfFame`, passing rows to
`<HallOfFame>`. No other page changes.

## Data flow

```
scores ─┐
        ├─► fetchHallOfFame ─► tallyMedals (pure) ─► merge w/ seed ─► HallOfFameRow[]
profiles┘                                              ▲
historical_wins ───────────────────────────────────────┘
                         │
                         ▼
                  <HallOfFame> (🥇🥈🥉 columns)
```

## Error handling

- Any Supabase fetch error in `fetchHallOfFame` → return seed-only rows (or `[]` if the
  seed itself fails). The page already tolerates an empty Hall of Fame.
- `computePodium`/`tallyMedals` are pure and total (no throws) for any input, including
  empty arrays and all-tie days.

## Testing

Unit tests in `lib/medals.test.ts` (Vitest), matching the `parser.ts`/`leaderboard.ts`
pure-function pattern. Cases:
- 0 / 1 player → no medals.
- 2 players → gold + silver, no bronze.
- 3+ players → full podium.
- Tie for 1st (2 and 3 tied) → shared gold, skipped silver, correct bronze handling.
- Tie for 2nd → shared silver, no bronze.
- `tallyMedals` multi-day accumulation across users.
- Timezone boundary: a score with `playDate === todayEt` is excluded; `< todayEt` counted.

No new tests needed for the thin Supabase wrapper beyond the existing patterns; the merge
logic's hard parts live in the pure functions.

## Out of scope (sub-project 2)

- Instant "all submitted" finalization detection and the cutoff cron.
- Counting *today's* finalized day before midnight ET.
- Web push: PWA manifest, service worker, VAPID keys, subscription storage, permission
  UX, and send-on-finalization.
