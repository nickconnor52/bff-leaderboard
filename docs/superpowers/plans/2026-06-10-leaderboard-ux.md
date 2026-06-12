# Leaderboard UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service manual score entry (with a "Cheating" badge), a `/setup` nav
button, a dynamic "Are you smarter than a `<nickname>`?" subtitle, and a neutral-blue
dark theme with mobile-first polish.

**Architecture:** Extend the existing `scores` table with an `entry_method` column and
add a `nicknames` table (migration `0002`). Add a session-authenticated
`/api/scores/manual` route that reuses `lib/parser.ts`. Extend `lib/leaderboard.ts` with
an `isManual` flag and add `lib/nicknames.ts` for subtitle logic. Build a new shadcn
`Dialog` primitive and an `AddScoreDialog` component. Re-theme `app/globals.css`'s
existing `.dark` token block (shadcn CSS-custom-property system) and apply it via
`className="dark"` on `<html>`. Update `PodiumCard`, `LeaderboardTable`, and
`app/page.tsx` for the badge, podium colors, title/subtitle, and mobile-responsive
layout.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (`@supabase/ssr`),
Tailwind CSS v4 + shadcn/ui (`@base-ui/react` primitives), Vitest.

**Project root:** `/Users/NickConnor/Development/bff-leaderboard`. All paths below are
relative to this root. If `node -v` reports < 20.9, run
`source ~/.nvm/nvm.sh && nvm use 20.20.2` before any `npm` command.

**Spec:** `docs/superpowers/specs/2026-06-10-leaderboard-ux-design.md`

---

### Task 1: Database migration — `entry_method` + `nicknames` table

**Files:**
- Create: `supabase/migrations/0002_manual_entry_and_nicknames.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Tracks how a score was submitted. 'manual' entries get the "Cheating" badge in the
-- UI; 'import' (historical backfill via /admin/import) does not, so the bulk history
-- import doesn't retroactively tag everyone's all-time record.
alter table scores
  add column entry_method text not null default 'shortcut'
  check (entry_method in ('shortcut', 'manual', 'import'));

-- Per-user nickname bank, used for the "Are you smarter than a <nickname>?" subtitle.
-- Seeded by hand via the Supabase SQL editor for v1, e.g.:
--   insert into nicknames (user_id, nickname)
--   select id, unnest(array['Ratterman', 'Slowpoke'])
--   from profiles where display_name = 'Craig';
create table nicknames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  nickname text not null
);

alter table nicknames enable row level security;

create policy "Nicknames are viewable by authenticated users"
  on nicknames for select
  to authenticated
  using (true);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0002_manual_entry_and_nicknames.sql
git commit -m "Add entry_method column and nicknames table"
```

**Note:** This migration must be applied manually via the Supabase SQL Editor (same
convention as `0001_init.sql`) before the manual-entry feature can be tested end-to-end
in the browser. The unit tests added in later tasks all mock the Supabase client, so
they don't require the migration to be applied. Applying it is covered in Task 14.

---

### Task 2: `parseManualScore` for the raw-number entry path

**Files:**
- Modify: `lib/parser.ts`
- Test: `lib/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `lib/parser.test.ts`:

```typescript
describe('parseManualScore', () => {
  it('parses a valid 1-3 digit score', () => {
    expect(parseManualScore('294')).toBe(294);
    expect(parseManualScore('7')).toBe(7);
    expect(parseManualScore('0')).toBe(0);
  });

  it('trims surrounding whitespace', () => {
    expect(parseManualScore('  294  ')).toBe(294);
  });

  it('returns null for non-numeric input', () => {
    expect(parseManualScore('abc')).toBeNull();
    expect(parseManualScore('')).toBeNull();
  });

  it('returns null for values over 999', () => {
    expect(parseManualScore('1000')).toBeNull();
  });

  it('returns null for negative numbers', () => {
    expect(parseManualScore('-5')).toBeNull();
  });
});
```

Update the import at the top of `lib/parser.test.ts`:

```typescript
import { parseShareText, parseManualScore } from './parser';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/parser.test.ts`
Expected: FAIL — `parseManualScore` is not exported from `./parser`

- [ ] **Step 3: Implement `parseManualScore`**

Add to the bottom of `lib/parser.ts`:

```typescript
export function parseManualScore(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return parseInt(trimmed, 10);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/parser.test.ts`
Expected: PASS (all `parseShareText` and `parseManualScore` tests)

- [ ] **Step 5: Commit**

```bash
git add lib/parser.ts lib/parser.test.ts
git commit -m "Add parseManualScore for raw-number manual entry"
```

---

### Task 3: `isManual` flag on leaderboard entries

**Files:**
- Modify: `lib/leaderboard.ts`
- Test: `lib/leaderboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `lib/leaderboard.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateLeaderboard, getDateRange } from './leaderboard';

describe('aggregateLeaderboard', () => {
  it('sums scores per user, counts games played, sorts by total descending, and surfaces a comment only when exactly one game contributed', () => {
    const rows = [
      { user_id: 'a', final_score: 700, display_name: 'Alice', comment_text: 'Tough one', entry_method: 'shortcut' },
      { user_id: 'b', final_score: 900, display_name: 'Bob', comment_text: 'Easy mode', entry_method: 'shortcut' },
      { user_id: 'a', final_score: 800, display_name: 'Alice', comment_text: 'Redemption!', entry_method: 'shortcut' },
    ];

    expect(aggregateLeaderboard(rows)).toEqual([
      {
        userId: 'a',
        displayName: 'Alice',
        totalScore: 1500,
        gamesPlayed: 2,
        averageScore: 750,
        comment: null,
        isManual: false,
      },
      {
        userId: 'b',
        displayName: 'Bob',
        totalScore: 900,
        gamesPlayed: 1,
        averageScore: 900,
        comment: 'Easy mode',
        isManual: false,
      },
    ]);
  });

  it('returns an empty list for no rows', () => {
    expect(aggregateLeaderboard([])).toEqual([]);
  });

  it('marks an entry as manual when its only row was manually entered', () => {
    const rows = [
      { user_id: 'c', final_score: 261, display_name: 'Craig', comment_text: null, entry_method: 'manual' },
    ];

    expect(aggregateLeaderboard(rows)[0].isManual).toBe(true);
  });

  it('marks an entry as manual if any row in the period was manually entered', () => {
    const rows = [
      { user_id: 'c', final_score: 261, display_name: 'Craig', comment_text: null, entry_method: 'shortcut' },
      { user_id: 'c', final_score: 100, display_name: 'Craig', comment_text: null, entry_method: 'manual' },
    ];

    expect(aggregateLeaderboard(rows)[0].isManual).toBe(true);
  });

  it('does not mark an entry as manual when no rows were manually entered', () => {
    const rows = [
      { user_id: 'c', final_score: 261, display_name: 'Craig', comment_text: null, entry_method: 'shortcut' },
      { user_id: 'c', final_score: 100, display_name: 'Craig', comment_text: null, entry_method: 'import' },
    ];

    expect(aggregateLeaderboard(rows)[0].isManual).toBe(false);
  });
});

describe('getDateRange', () => {
  it('returns null for all-time (meaning: no date filtering)', () => {
    expect(getDateRange('all-time', new Date('2026-06-07T12:00:00Z'))).toBeNull();
  });

  it('returns the same start and end day for daily', () => {
    expect(getDateRange('daily', new Date('2026-06-07T12:00:00Z'))).toEqual({
      start: '2026-06-07',
      end: '2026-06-07',
    });
  });

  it('returns a Sunday-to-Saturday range for weekly', () => {
    // 2026-06-10 is a Wednesday; its week runs Sun 2026-06-07 to Sat 2026-06-13
    expect(getDateRange('weekly', new Date('2026-06-10T12:00:00Z'))).toEqual({
      start: '2026-06-07',
      end: '2026-06-13',
    });
  });

  it('returns the full calendar month for monthly', () => {
    expect(getDateRange('monthly', new Date('2026-06-15T12:00:00Z'))).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/leaderboard.test.ts`
Expected: FAIL — type errors / missing `isManual` property and `entry_method` field

- [ ] **Step 3: Implement `isManual` in `lib/leaderboard.ts`**

Update the `ScoreRow` and `LeaderboardEntry` interfaces (lines 5-24):

```typescript
export interface ScoreRow {
  user_id: string;
  final_score: number;
  display_name: string;
  comment_text: string | null;
  entry_method: string;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalScore: number;
  gamesPlayed: number;
  averageScore: number;
  /**
   * Only populated when exactly one game contributed to this entry — for the
   * `daily` period that's always true; for longer periods it avoids picking an
   * arbitrary comment out of several days' worth of banter.
   */
  comment: string | null;
  /**
   * True if any score contributing to this entry in the period was submitted via
   * the manual-entry dialog (entry_method === 'manual') — drives the "Cheating" badge.
   */
  isManual: boolean;
}
```

Replace `aggregateLeaderboard` (lines 26-55):

```typescript
export function aggregateLeaderboard(rows: ScoreRow[]): LeaderboardEntry[] {
  const byUser = new Map<
    string,
    { displayName: string; total: number; count: number; lastComment: string | null; isManual: boolean }
  >();

  for (const row of rows) {
    const existing = byUser.get(row.user_id) ?? {
      displayName: row.display_name,
      total: 0,
      count: 0,
      lastComment: null,
      isManual: false,
    };
    existing.total += row.final_score;
    existing.count += 1;
    existing.lastComment = row.comment_text;
    existing.isManual = existing.isManual || row.entry_method === 'manual';
    byUser.set(row.user_id, existing);
  }

  return Array.from(byUser.entries())
    .map(([userId, { displayName, total, count, lastComment, isManual }]) => ({
      userId,
      displayName,
      totalScore: total,
      gamesPlayed: count,
      averageScore: Math.round(total / count),
      comment: count === 1 ? lastComment : null,
      isManual,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
}
```

Update `ScoreWithProfile` and `fetchLeaderboard` (lines 85-122):

```typescript
interface ScoreWithProfile {
  user_id: string;
  final_score: number;
  comment_text: string | null;
  entry_method: string;
  profiles: { display_name: string } | { display_name: string }[] | null;
}

function displayNameFrom(profiles: ScoreWithProfile['profiles']): string {
  if (!profiles) return 'Unknown';
  return Array.isArray(profiles) ? (profiles[0]?.display_name ?? 'Unknown') : profiles.display_name;
}

export async function fetchLeaderboard(
  supabase: SupabaseClient,
  period: LeaderboardPeriod,
  referenceDate: Date = new Date()
): Promise<LeaderboardEntry[]> {
  const range = getDateRange(period, referenceDate);

  let query = supabase
    .from('scores')
    .select('user_id, final_score, comment_text, entry_method, profiles(display_name)');
  if (range) {
    query = query.gte('play_date', range.start).lte('play_date', range.end);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: ScoreRow[] = (data ?? []).map((row: ScoreWithProfile) => ({
    user_id: row.user_id,
    final_score: row.final_score,
    display_name: displayNameFrom(row.profiles),
    comment_text: row.comment_text,
    entry_method: row.entry_method,
  }));

  return aggregateLeaderboard(rows);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/leaderboard.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/leaderboard.ts lib/leaderboard.test.ts
git commit -m "Track entry_method and add isManual flag to leaderboard entries"
```

---

### Task 4: `lib/nicknames.ts` — subtitle target + random nickname

**Files:**
- Create: `lib/nicknames.ts`
- Test: `lib/nicknames.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/nicknames.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSubtitleTarget, fetchRandomNickname } from './nicknames';
import type { LeaderboardEntry } from './leaderboard';

function entry(userId: string, totalScore: number): LeaderboardEntry {
  return {
    userId,
    displayName: userId,
    totalScore,
    gamesPlayed: 1,
    averageScore: totalScore,
    comment: null,
    isManual: false,
  };
}

describe('getSubtitleTarget', () => {
  it('returns the last entry of the daily leaderboard when it has entries', () => {
    const daily = [entry('a', 400), entry('b', 200)];
    const allTime = [entry('a', 4000), entry('c', 100)];

    expect(getSubtitleTarget([daily, [], [], allTime])).toEqual(entry('b', 200));
  });

  it('falls back to the last entry of the all-time leaderboard when daily is empty', () => {
    const allTime = [entry('a', 4000), entry('c', 100)];

    expect(getSubtitleTarget([[], [], [], allTime])).toEqual(entry('c', 100));
  });

  it('returns null when both daily and all-time are empty', () => {
    expect(getSubtitleTarget([[], [], [], []])).toBeNull();
  });
});

describe('fetchRandomNickname', () => {
  function supabaseReturning(data: { nickname: string }[] | null): SupabaseClient {
    return {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it('returns a nickname from the table when one exists', async () => {
    const supabase = supabaseReturning([{ nickname: 'Ratterman' }]);

    expect(await fetchRandomNickname(supabase, 'user-1', 'Craig')).toBe('Ratterman');
  });

  it('falls back to the display name when no nicknames are seeded', async () => {
    const supabase = supabaseReturning([]);

    expect(await fetchRandomNickname(supabase, 'user-1', 'Craig')).toBe('Craig');
  });

  it('falls back to the display name when the query returns null', async () => {
    const supabase = supabaseReturning(null);

    expect(await fetchRandomNickname(supabase, 'user-1', 'Craig')).toBe('Craig');
  });

  it('picks one of multiple nicknames', async () => {
    const supabase = supabaseReturning([{ nickname: 'Ratterman' }, { nickname: 'Slowpoke' }]);

    const result = await fetchRandomNickname(supabase, 'user-1', 'Craig');

    expect(['Ratterman', 'Slowpoke']).toContain(result);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/nicknames.test.ts`
Expected: FAIL — cannot find module `./nicknames`

- [ ] **Step 3: Implement `lib/nicknames.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/nicknames.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/nicknames.ts lib/nicknames.test.ts
git commit -m "Add getSubtitleTarget and fetchRandomNickname for the leaderboard subtitle"
```

---

### Task 5: `/api/scores/manual` route

**Files:**
- Create: `app/api/scores/manual/route.ts`
- Test: `app/api/scores/manual/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `app/api/scores/manual/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ upsert: mockUpsert }),
  }),
}));

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/scores/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/scores/manual', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest({ finalScore: 294 }));

    expect(response.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('parses pasted share text and stores it as a manual entry', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    const text = 'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744\n\nDamn, tough one';

    const response = await POST(makeRequest({ shareText: text }));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 744,
        category_scores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
        comment_text: 'Damn, tough one',
        raw_share_text: text,
        parse_status: 'ok',
        entry_method: 'manual',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });

  it('rejects unparseable share text without writing anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({ shareText: 'garbled nonsense' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/share text/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('stores a raw final score with empty category scores', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({ finalScore: 294 }));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 294,
        category_scores: {},
        comment_text: null,
        raw_share_text: 'Manual entry: 294',
        parse_status: 'ok',
        entry_method: 'manual',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });

  it('rejects an out-of-range raw score without writing anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({ finalScore: 1000 }));

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(
      new Request('http://localhost/api/scores/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      })
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when neither shareText nor finalScore is provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/api/scores/manual/route.test.ts`
Expected: FAIL — cannot find module `./route`

- [ ] **Step 3: Implement `app/api/scores/manual/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseShareText, parseManualScore } from '@/lib/parser';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const bodyRecord = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  let finalScore: number;
  let categoryScores: Record<string, number>;
  let commentText: string | null;
  let rawShareText: string;

  if (typeof bodyRecord.shareText === 'string') {
    const parsed = parseShareText(bodyRecord.shareText);
    if (!parsed) {
      return NextResponse.json(
        { error: "Couldn't read that — make sure you copied the full share text." },
        { status: 400 }
      );
    }
    finalScore = parsed.finalScore;
    categoryScores = parsed.categoryScores;
    commentText = parsed.commentText;
    rawShareText = bodyRecord.shareText;
  } else if (typeof bodyRecord.finalScore === 'number') {
    const score = parseManualScore(String(bodyRecord.finalScore));
    if (score === null) {
      return NextResponse.json({ error: 'Enter a score between 0 and 999.' }, { status: 400 });
    }
    finalScore = score;
    categoryScores = {};
    commentText = null;
    rawShareText = `Manual entry: ${score}`;
  } else {
    return NextResponse.json({ error: 'Missing shareText or finalScore' }, { status: 400 });
  }

  const playDate = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from('scores').upsert(
    {
      user_id: user.id,
      play_date: playDate,
      final_score: finalScore,
      category_scores: categoryScores,
      comment_text: commentText,
      raw_share_text: rawShareText,
      parse_status: 'ok',
      entry_method: 'manual',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) {
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- app/api/scores/manual/route.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/scores/manual/route.ts app/api/scores/manual/route.test.ts
git commit -m "Add session-authenticated manual score entry endpoint"
```

---

### Task 6: Tag historical imports with `entry_method: 'import'`

**Files:**
- Modify: `app/api/admin/import/route.ts:40-51`

- [ ] **Step 1: Add `entry_method: 'import'` to the upsert**

In `app/api/admin/import/route.ts`, change:

```typescript
  const { error } = await service.from('scores').upsert(
    {
      user_id: profile.id,
      play_date: playDate,
      final_score: score,
      category_scores: {},
      comment_text: null,
      raw_share_text: '[manually backfilled — original share text not available]',
      parse_status: 'ok',
    },
    { onConflict: 'user_id,play_date' }
  );
```

to:

```typescript
  const { error } = await service.from('scores').upsert(
    {
      user_id: profile.id,
      play_date: playDate,
      final_score: score,
      category_scores: {},
      comment_text: null,
      raw_share_text: '[manually backfilled — original share text not available]',
      parse_status: 'ok',
      entry_method: 'import',
    },
    { onConflict: 'user_id,play_date' }
  );
```

- [ ] **Step 2: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS (no test covers this route, so this just confirms no regressions elsewhere)

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/import/route.ts
git commit -m "Tag admin-imported scores with entry_method 'import'"
```

---

### Task 7: `Dialog` UI primitive

**Files:**
- Create: `components/ui/dialog.tsx`

This follows the same pattern as the existing `components/ui/tabs.tsx` and
`components/ui/button.tsx`, wrapping `@base-ui/react/dialog`.

- [ ] **Step 1: Create `components/ui/dialog.tsx`**

```tsx
'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ className, ...props }: DialogPrimitive.Trigger.Props) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      className={cn(className)}
      {...props}
    />
  );
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ className, ...props }: DialogPrimitive.Close.Props) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      className={cn(className)}
      {...props}
    />
  );
}

function DialogBackdrop({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-backdrop"
      className={cn('fixed inset-0 z-50 bg-black/50', className)}
      {...props}
    />
  );
}

function DialogContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPortal>
      <DialogBackdrop />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-lg',
          className
        )}
        {...props}
      >
        {children}
        <DialogClose className="absolute top-4 right-4 rounded-md text-muted-foreground transition-colors hover:text-foreground">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-1.5', className)} {...props} />;
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg font-bold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogBackdrop,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
};
```

- [ ] **Step 2: Run the full test suite and lint to confirm the new file compiles**

Run: `npm test && npm run lint`
Expected: PASS — no new test files reference this yet, but typecheck/lint must be clean

- [ ] **Step 3: Commit**

```bash
git add components/ui/dialog.tsx
git commit -m "Add shadcn Dialog primitive"
```

---

### Task 8: "Add my score" dialog

**Files:**
- Create: `components/leaderboard/add-score-dialog.tsx`

- [ ] **Step 1: Create `components/leaderboard/add-score-dialog.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Mode = 'paste' | 'number';

export function AddScoreDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('paste');
  const [shareText, setShareText] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const body = mode === 'paste' ? { shareText } : { finalScore: Number(finalScore) };

    try {
      const response = await fetch('/api/scores/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();

      if (!response.ok) {
        setError(json.error ?? 'Something went wrong');
        return;
      }

      setOpen(false);
      setShareText('');
      setFinalScore('');
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled =
    submitting || (mode === 'paste' ? shareText.trim().length === 0 : finalScore.trim().length === 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setError(null);
      }}
    >
      <DialogTrigger className={buttonVariants({ className: 'font-semibold' })}>
        + Add my score
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add my score</DialogTitle>
          <DialogDescription>Manual entries get a friendly &ldquo;😤 Cheating&rdquo; badge.</DialogDescription>
        </DialogHeader>

        <div className="flex w-fit gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              mode === 'paste' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Paste share text
          </button>
          <button
            type="button"
            onClick={() => setMode('number')}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              mode === 'number' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Just the number
          </button>
        </div>

        {mode === 'paste' ? (
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Paste your maptap.gg share text here..."
            value={shareText}
            onChange={(event) => setShareText(event.target.value)}
          />
        ) : (
          <Input
            type="number"
            min={0}
            max={999}
            placeholder="294"
            value={finalScore}
            onChange={(event) => setFinalScore(event.target.value)}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={submitDisabled}>
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/add-score-dialog.tsx
git commit -m "Add self-service 'Add my score' dialog"
```

---

### Task 9: Re-theme `app/globals.css` (neutral-blue dark + podium/badge tokens)

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add new theme token mappings to `@theme inline`**

In `app/globals.css`, inside the existing `@theme inline { ... }` block (after the
`--color-card: var(--card);` line, before the `--radius-sm:` line), add:

```css
  --color-podium-gold: var(--podium-gold);
  --color-podium-gold-border: var(--podium-gold-border);
  --color-podium-silver: var(--podium-silver);
  --color-podium-silver-border: var(--podium-silver-border);
  --color-podium-bronze: var(--podium-bronze);
  --color-podium-bronze-border: var(--podium-bronze-border);
  --color-badge-cheating-bg: var(--badge-cheating-bg);
  --color-badge-cheating-border: var(--badge-cheating-border);
  --color-badge-cheating-text: var(--badge-cheating-text);
```

- [ ] **Step 2: Replace the `.dark` block with the neutral-blue palette**

Replace the entire `.dark { ... }` block with:

```css
.dark {
  --background: #0f172a;
  --foreground: #e2e8f0;
  --card: #1e293b;
  --card-foreground: #e2e8f0;
  --popover: #1e293b;
  --popover-foreground: #e2e8f0;
  --primary: #3b82f6;
  --primary-foreground: #f8fafc;
  --secondary: #1e293b;
  --secondary-foreground: #e2e8f0;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --accent: #1e3a5f;
  --accent-foreground: #e2e8f0;
  --destructive: oklch(0.704 0.191 22.216);
  --border: #334155;
  --input: #334155;
  --ring: #3b82f6;
  --chart-1: oklch(0.87 0 0);
  --chart-2: oklch(0.556 0 0);
  --chart-3: oklch(0.439 0 0);
  --chart-4: oklch(0.371 0 0);
  --chart-5: oklch(0.269 0 0);
  --sidebar: #1e293b;
  --sidebar-foreground: #e2e8f0;
  --sidebar-primary: #3b82f6;
  --sidebar-primary-foreground: #f8fafc;
  --sidebar-accent: #1e3a5f;
  --sidebar-accent-foreground: #e2e8f0;
  --sidebar-border: #334155;
  --sidebar-ring: #3b82f6;

  /* Podium accent colors ("metallic" variant) */
  --podium-gold: #2b2510;
  --podium-gold-border: #e6c875;
  --podium-silver: #232a35;
  --podium-silver-border: #c7d2e0;
  --podium-bronze: #2a1f18;
  --podium-bronze-border: #d99868;

  /* "Cheating" badge for manually-entered scores */
  --badge-cheating-bg: #450a0a;
  --badge-cheating-border: #ef4444;
  --badge-cheating-text: #fca5a5;
}
```

This is the "swap point" for retheming later — every value above is a hex color that
can be edited independently. `:root` (the light theme) is left untouched.

- [ ] **Step 2: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: PASS — CSS changes don't affect Vitest, this just confirms no regressions

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "Re-theme dark mode with neutral-blue palette and podium/badge tokens"
```

---

### Task 10: Make dark mode the default + real page metadata

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update `app/layout.tsx`**

Replace the contents of `app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BFF Leaderboard",
  description: "Daily maptap.gg leaderboard for the group.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "Make dark theme the default and set real page metadata"
```

---

### Task 11: `PodiumCard` — metallic colors, medals, Cheating badge, responsive sizing

**Files:**
- Modify: `components/leaderboard/podium-card.tsx`

- [ ] **Step 1: Replace `components/leaderboard/podium-card.tsx`**

```tsx
import { cn } from '@/lib/utils';

const PODIUM_STYLES = [
  'border-podium-gold-border bg-podium-gold',
  'border-podium-silver-border bg-podium-silver',
  'border-podium-bronze-border bg-podium-bronze',
];

const MEDALS = ['🥇', '🥈', '🥉'];

export function PodiumCard({
  rank,
  displayName,
  totalScore,
  comment,
  isManual,
}: {
  rank: 1 | 2 | 3;
  displayName: string;
  totalScore: number;
  comment: string | null;
  isManual: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 p-3 text-center shadow-sm sm:p-4',
        PODIUM_STYLES[rank - 1]
      )}
    >
      <div className="text-xs font-semibold tracking-wide uppercase sm:text-sm">
        {MEDALS[rank - 1]} #{rank}
      </div>
      <div className="mt-1 text-base font-bold sm:text-lg">{displayName}</div>
      <div className="mt-1 text-xl font-extrabold sm:text-2xl">{totalScore}</div>
      {isManual && (
        <div className="mt-2 inline-block rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
          😤 Cheating
        </div>
      )}
      {comment && <div className="mt-2 text-xs italic opacity-80">&ldquo;{comment}&rdquo;</div>}
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: PASS — `LeaderboardTable` (Task 12) will pass `isManual`, but TypeScript only
checks types at build time, so this compiles once Task 12 also lands. Run
`npm run build` after Task 12 to confirm the full pipeline.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/podium-card.tsx
git commit -m "Restyle PodiumCard with metallic colors, medals, and Cheating badge"
```

---

### Task 12: `LeaderboardTable` — fix dynamic grid classes, add Cheating badge to list rows

**Files:**
- Modify: `components/leaderboard/leaderboard-table.tsx`

- [ ] **Step 1: Replace `components/leaderboard/leaderboard-table.tsx`**

```tsx
import type { LeaderboardEntry } from '@/lib/leaderboard';
import { PodiumCard } from './podium-card';

const PODIUM_GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground">No scores yet for this period.</p>;
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      <div className={`grid gap-2 sm:gap-3 ${PODIUM_GRID_COLS[podium.length]}`}>
        {podium.map((entry, index) => (
          <PodiumCard
            key={entry.userId}
            rank={(index + 1) as 1 | 2 | 3}
            displayName={entry.displayName}
            totalScore={entry.totalScore}
            comment={entry.comment}
            isManual={entry.isManual}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="divide-y rounded-lg border" start={4}>
          {rest.map((entry, index) => (
            <li key={entry.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  #{index + 4} {entry.displayName}
                </span>
                {entry.isManual && (
                  <span className="rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
                    😤 Cheating
                  </span>
                )}
                {entry.comment && (
                  <span className="text-xs italic text-muted-foreground">
                    &ldquo;{entry.comment}&rdquo;
                  </span>
                )}
              </span>
              <span className="font-semibold">{entry.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS — this is the first point where `PodiumCard`'s new `isManual` prop is
both required and supplied, so the build should now succeed cleanly.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/leaderboard-table.tsx
git commit -m "Fix dynamic podium grid classes and show Cheating badge in list rows"
```

---

### Task 13: `app/page.tsx` — title, subtitle, Setup button, Add my score

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { AddScoreDialog } from '@/components/leaderboard/add-score-dialog';
import { fetchLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import { getSubtitleTarget, fetchRandomNickname } from '@/lib/nicknames';
import { createClient } from '@/lib/supabase/server';

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'all-time', label: 'All-Time' },
];

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const results = await Promise.allSettled(
    PERIODS.map((period) => fetchLeaderboard(supabase, period.value))
  );
  const entriesByPeriod = results.map((result) =>
    result.status === 'fulfilled' ? result.value : []
  );

  const subtitleTarget = getSubtitleTarget(entriesByPeriod);
  const subtitleName = subtitleTarget
    ? await fetchRandomNickname(supabase, subtitleTarget.userId, subtitleTarget.displayName)
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1 pt-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">🏆 BFF Leaderboard</h1>
          <Link
            href="/setup"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}
          >
            Setup
          </Link>
        </div>
        <p className="text-sm text-muted-foreground italic sm:text-base">
          {subtitleName ? (
            <>
              Are you smarter than a{' '}
              <span className="font-semibold text-primary not-italic">{subtitleName}</span>?
            </>
          ) : (
            'Track your maptap.gg scores with the squad'
          )}
        </p>
      </header>

      <div className="flex justify-center">
        <AddScoreDialog />
      </div>

      <Tabs defaultValue="daily">
        <div className="flex justify-center">
          <TabsList>
            {PERIODS.map((period) => (
              <TabsTrigger key={period.value} value={period.value}>
                {period.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {PERIODS.map((period, index) => (
          <TabsContent key={period.value} value={period.value}>
            <LeaderboardTable entries={entriesByPeriod[index]} />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "Add title treatment, dynamic subtitle, Setup link, and Add my score button"
```

---

### Task 14: Apply migration, seed nicknames, and manual verification

**Files:** none (operational steps + manual browser testing)

- [ ] **Step 1: Apply the migration**

In the Supabase SQL Editor, run the contents of
`supabase/migrations/0002_manual_entry_and_nicknames.sql`.

- [ ] **Step 2: Seed nicknames for at least one player**

In the Supabase SQL Editor, run (adjusting the display name and nicknames):

```sql
insert into nicknames (user_id, nickname)
select id, unnest(array['Ratterman', 'Slowpoke', 'The Caboose'])
from profiles where display_name = 'Craig';
```

- [ ] **Step 3: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 4: Manual verification checklist**

Open `http://localhost:3000` in a browser (and via responsive/mobile device emulation)
and confirm:

- [ ] The page renders in the new neutral-blue dark theme across `/`, `/setup`,
      `/login`, and `/admin/import`.
- [ ] Header shows "🏆 BFF Leaderboard", a "Setup" button linking to `/setup`, and a
      subtitle reading "Are you smarter than a `<nickname>`?" — refresh a few times and
      confirm the nickname changes randomly (for the seeded user) or falls back to
      their display name (for users with no nicknames seeded).
- [ ] Podium shows medal emoji + the new metallic gold/silver/bronze colors.
- [ ] Click "+ Add my score":
  - [ ] "Paste share text" mode: paste a real maptap.gg share, submit, and confirm the
        leaderboard updates with the parsed score and a "😤 Cheating" badge.
  - [ ] "Just the number" mode: enter a 3-digit number, submit, and confirm it appears
        with `category_scores: {}` and the "Cheating" badge.
  - [ ] Submitting unparseable text shows the inline error and does not close the
        dialog.
- [ ] Resize to a mobile viewport width (~375px) and confirm the header, podium,
      dialog, and tabs all remain usable without horizontal scrolling.

- [ ] **Step 5: No commit for this task** — it's verification only. If any check fails,
      fix the relevant task's code, re-run its tests, and commit the fix separately.
