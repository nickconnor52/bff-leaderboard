# Daily Medal Engine + Hall of Fame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live 🥇🥈🥉 medal counts per player in the Hall of Fame, derived from the `scores` table on read and merged with the pre-app seed (`historical_wins`).

**Architecture:** A pure ranking core (`lib/medals.ts`) computes each day's podium and tallies medals across closed days. A thin Supabase wrapper (`lib/hall-of-fame.ts`) fetches scores/profiles/seed, merges derived medals with the seed by `user_id`, and returns ranked rows. The existing `lib/historical-wins.ts` is absorbed and deleted. No new tables, no cron.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase (`@supabase/ssr`), Vitest.

> **Environment note:** Node >= 20.9 is required but the default `node` is v18. Prefix every npm/vitest command with `source ~/.nvm/nvm.sh && nvm use 20.20.2 &&`.

---

## File Structure

- **Create** `lib/medals.ts` — pure ranking: `computePodium` (one day) + `tallyMedals` (across days). No I/O.
- **Create** `lib/medals.test.ts` — Vitest unit tests for the pure ranking core.
- **Create** `lib/hall-of-fame.ts` — `etToday` helper + `fetchHallOfFame` (fetch + merge). Replaces `historical-wins.ts`.
- **Delete** `lib/historical-wins.ts` — absorbed into `hall-of-fame.ts`.
- **Modify** `components/leaderboard/hall-of-fame.tsx` — render 🥇🥈🥉 columns from `HallOfFameRow[]`.
- **Modify** `app/page.tsx` — call `fetchHallOfFame` instead of `fetchHistoricalWins`.

---

### Task 1: Pure podium for a single day (`computePodium`)

**Files:**
- Create: `lib/medals.ts`
- Test: `lib/medals.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/medals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computePodium } from './medals';

describe('computePodium', () => {
  it('awards nothing when fewer than 2 players competed', () => {
    expect(computePodium([])).toEqual({ gold: [], silver: [], bronze: [] });
    expect(computePodium([{ userId: 'a', finalScore: 100 }])).toEqual({
      gold: [],
      silver: [],
      bronze: [],
    });
  });

  it('awards gold + silver for 2 players, no bronze', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 80 },
      ])
    ).toEqual({ gold: ['a'], silver: ['b'], bronze: [] });
  });

  it('awards full podium for 3+ players', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 80 },
        { userId: 'c', finalScore: 50 },
      ])
    ).toEqual({ gold: ['a'], silver: ['b'], bronze: ['c'] });
  });

  it('shares gold on a tie for 1st and skips silver (3 players)', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 100 },
        { userId: 'c', finalScore: 50 },
      ])
    ).toEqual({ gold: ['a', 'b'], silver: [], bronze: ['c'] });
  });

  it('shares silver on a tie for 2nd and awards no bronze', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 80 },
        { userId: 'c', finalScore: 80 },
      ])
    ).toEqual({ gold: ['a'], silver: ['b', 'c'], bronze: [] });
  });

  it('shares gold among two and awards no silver/bronze for a 2-player tie', () => {
    expect(
      computePodium([
        { userId: 'a', finalScore: 100 },
        { userId: 'b', finalScore: 100 },
      ])
    ).toEqual({ gold: ['a', 'b'], silver: [], bronze: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: FAIL — `computePodium` is not exported / module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/medals.ts`:

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

export interface Podium {
  gold: string[];
  silver: string[];
  bronze: string[];
}

/**
 * Awards medals for ONE day's scores using competition ranking + scaled eligibility:
 *   - fewer than 2 players  -> no medals
 *   - tied players share the better medal; the next medal slot is skipped by the
 *     number tied (positions 1,1,3 -> two golds, no silver, next group is bronze)
 *   - bronze only exists when a group lands on rank 3 (requires 3+ players)
 */
export function computePodium(dayScores: DayScore[]): Podium {
  const podium: Podium = { gold: [], silver: [], bronze: [] };
  if (dayScores.length < 2) return podium;

  // Group userIds by score, then order groups by score descending.
  const byScore = new Map<number, string[]>();
  for (const { userId, finalScore } of dayScores) {
    const group = byScore.get(finalScore) ?? [];
    group.push(userId);
    byScore.set(finalScore, group);
  }
  const groups = [...byScore.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, ids]) => ids);

  let startRank = 1;
  for (const ids of groups) {
    if (startRank === 1) podium.gold = ids;
    else if (startRank === 2) podium.silver = ids;
    else if (startRank === 3) podium.bronze = ids;
    else break;
    startRank += ids.length;
  }
  return podium;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/medals.ts lib/medals.test.ts
git commit -m "Add computePodium for daily medal awarding"
```

---

### Task 2: Tally medals across closed days (`tallyMedals`)

**Files:**
- Modify: `lib/medals.ts`
- Test: `lib/medals.test.ts`

- [ ] **Step 1: Write the failing tests**

First, update the existing import at the top of `lib/medals.test.ts` to include `tallyMedals`:

```ts
import { computePodium, tallyMedals } from './medals';
```

Then append this block to the bottom of the file:

```ts
describe('tallyMedals', () => {
  const scores = [
    // day 1: a gold, b silver, c bronze
    { userId: 'a', finalScore: 100, playDate: '2026-06-10' },
    { userId: 'b', finalScore: 80, playDate: '2026-06-10' },
    { userId: 'c', finalScore: 50, playDate: '2026-06-10' },
    // day 2: b gold, a silver (2 players)
    { userId: 'b', finalScore: 90, playDate: '2026-06-11' },
    { userId: 'a', finalScore: 70, playDate: '2026-06-11' },
  ];

  it('accumulates medals per user across days', () => {
    const tally = tallyMedals(scores, '2026-06-13');
    expect(tally.get('a')).toEqual({ gold: 1, silver: 1, bronze: 0 });
    expect(tally.get('b')).toEqual({ gold: 1, silver: 1, bronze: 0 });
    expect(tally.get('c')).toEqual({ gold: 0, silver: 0, bronze: 1 });
  });

  it('excludes today and future days (only closed days count)', () => {
    // todayEt = day 2, so only day 1 counts
    const tally = tallyMedals(scores, '2026-06-11');
    expect(tally.get('a')).toEqual({ gold: 1, silver: 0, bronze: 0 });
    expect(tally.get('b')).toEqual({ gold: 0, silver: 1, bronze: 0 });
    expect(tally.get('c')).toEqual({ gold: 0, silver: 0, bronze: 1 });
  });

  it('returns an empty map when no days are closed', () => {
    expect(tallyMedals(scores, '2026-06-10').size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: FAIL — `tallyMedals` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/medals.ts`:

```ts
/**
 * Tallies medals per user across every CLOSED day. A day is closed when its
 * `playDate` (ISO `YYYY-MM-DD`) is strictly before `todayEt`. Pure: no clock access.
 */
export function tallyMedals(
  scores: { userId: string; finalScore: number; playDate: string }[],
  todayEt: string
): Map<string, MedalCounts> {
  const byDay = new Map<string, DayScore[]>();
  for (const s of scores) {
    if (s.playDate >= todayEt) continue; // skip today + future
    const day = byDay.get(s.playDate) ?? [];
    day.push({ userId: s.userId, finalScore: s.finalScore });
    byDay.set(s.playDate, day);
  }

  const tally = new Map<string, MedalCounts>();
  const bump = (userId: string, medal: keyof MedalCounts) => {
    const counts = tally.get(userId) ?? { gold: 0, silver: 0, bronze: 0 };
    counts[medal] += 1;
    tally.set(userId, counts);
  };

  for (const day of byDay.values()) {
    const podium = computePodium(day);
    podium.gold.forEach((u) => bump(u, 'gold'));
    podium.silver.forEach((u) => bump(u, 'silver'));
    podium.bronze.forEach((u) => bump(u, 'bronze'));
  }
  return tally;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/medals.ts lib/medals.test.ts
git commit -m "Add tallyMedals to accumulate medals across closed days"
```

---

### Task 3: Hall-of-Fame assembler (`fetchHallOfFame`) + remove `historical-wins.ts`

**Files:**
- Create: `lib/hall-of-fame.ts`
- Delete: `lib/historical-wins.ts`
- Test: `lib/medals.test.ts` (add an `etToday` format check)

- [ ] **Step 1: Write the failing test for the ET date helper**

First, add this import to the top of `lib/medals.test.ts` (alongside the existing imports):

```ts
import { etToday } from './hall-of-fame';
```

Then append this block to the bottom of the file:

```ts
describe('etToday', () => {
  it('formats a date as an ISO YYYY-MM-DD string in Eastern Time', () => {
    // 2026-06-13T02:00:00Z is still 2026-06-12 (22:00) in America/New_York
    expect(etToday(new Date('2026-06-13T02:00:00Z'))).toBe('2026-06-12');
    // 2026-06-13T12:00:00Z is 2026-06-13 (08:00) in America/New_York
    expect(etToday(new Date('2026-06-13T12:00:00Z'))).toBe('2026-06-13');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: FAIL — `etToday` not found / `lib/hall-of-fame.ts` does not exist.

- [ ] **Step 3: Create `lib/hall-of-fame.ts`**

```ts
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
```

- [ ] **Step 4: Delete the absorbed file**

```bash
git rm lib/historical-wins.ts
```

- [ ] **Step 5: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 6: Commit**

```bash
git add lib/hall-of-fame.ts lib/medals.test.ts
git commit -m "Add fetchHallOfFame merging derived medals with the seed; drop historical-wins"
```

---

### Task 4: Medal-column Hall of Fame component

**Files:**
- Modify: `components/leaderboard/hall-of-fame.tsx`

- [ ] **Step 1: Replace the component**

Overwrite `components/leaderboard/hall-of-fame.tsx` with:

```tsx
import type { HallOfFameRow } from '@/lib/hall-of-fame';

export function HallOfFame({ entries }: { entries: HallOfFameRow[] }) {
  if (entries.length === 0) return null;

  const notes = entries.filter((entry) => entry.note);

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold sm:text-xl">🏅 All-Time Medals</h2>
        <span className="text-xs text-muted-foreground sm:text-sm">Hall of Fame</span>
      </div>
      <ol className="mt-3 divide-y rounded-lg border">
        {entries.map((entry, index) => (
          <li
            key={entry.playerName}
            className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-2"
          >
            <span className="text-sm text-muted-foreground tabular-nums">#{index + 1}</span>
            <span className="font-medium">
              {entry.playerName}
              {entry.note && <span className="text-muted-foreground">*</span>}
            </span>
            <span className="flex items-center gap-3 font-semibold tabular-nums">
              <span title="Gold">🥇 {entry.gold}</span>
              <span title="Silver">🥈 {entry.silver}</span>
              <span title="Bronze">🥉 {entry.bronze}</span>
            </span>
          </li>
        ))}
      </ol>
      {notes.length > 0 && (
        <div className="mt-3 space-y-1">
          {notes.map((entry) => (
            <p key={entry.playerName} className="text-xs italic text-muted-foreground">
              * {entry.note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify it type-checks via build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: Build fails ONLY in `app/page.tsx` (still importing the removed `fetchHistoricalWins`). The component file itself must not error. (Task 5 fixes the page.)

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/hall-of-fame.tsx
git commit -m "Render gold/silver/bronze columns in the Hall of Fame"
```

---

### Task 5: Wire the page to `fetchHallOfFame`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Update the import**

In `app/page.tsx`, replace this line:

```tsx
import { fetchHistoricalWins } from '@/lib/historical-wins';
```

with:

```tsx
import { fetchHallOfFame } from '@/lib/hall-of-fame';
```

- [ ] **Step 2: Update the data fetch**

Replace this line:

```tsx
  const historicalWins = await fetchHistoricalWins(supabase);
```

with:

```tsx
  const hallOfFame = await fetchHallOfFame(supabase);
```

- [ ] **Step 3: Update the render**

Replace this line:

```tsx
        <HallOfFame entries={historicalWins} />
```

with:

```tsx
        <HallOfFame entries={hallOfFame} />
```

- [ ] **Step 4: Run the full suite, lint, and build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run lint && npm run build`
Expected: all tests pass; lint clean; build succeeds with `ƒ /` listed and no type errors.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "Wire leaderboard page to fetchHallOfFame"
```

---

## Notes for the implementer

- The `historical_wins` table already exists in production and is seeded (7 rows; Nick linked via `user_id`). No migration in this plan.
- `scores` is empty in production at time of writing, so the Hall of Fame will show seed golds only until real games close — that is expected and correct.
- Do not add the cutoff cron or "all submitted" detection here; that is sub-project 2 (web push).
