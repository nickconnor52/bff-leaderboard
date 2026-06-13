# Daily Results Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a day finalizes (all account-holders submit, or the midnight-ET cutoff), record it, roll its medals into the Hall of Fame immediately, and send a full-podium web-push notification to everyone subscribed.

**Architecture:** A pure ranking core (extended) computes podiums; a server-only finalization module records finalized days in `daily_results` and triggers a `web-push` send to rows in `push_subscriptions`. Score-write endpoints call it instantly; a Vercel cron closes no-show days. The Hall of Fame counts finalized days. A PWA shell (manifest + service worker + icons) plus a `/setup` opt-in button complete delivery.

**Tech Stack:** Next.js 16 (App Router, RSC, route handlers, `next/og`), TypeScript, Supabase (`@supabase/ssr` + service-role), `web-push`, Vitest, Vercel Cron.

> **Environment:** Node >= 20.9; default `node` is v18. Prefix every npm/npx/vitest command with `source ~/.nvm/nvm.sh && nvm use 20.20.2 &&`.
>
> **Migrations & secrets are applied by the human controller** (Supabase SQL editor + Vercel/`.env.local`), not by implementer subagents. Tasks note where these gates sit.

---

## File Structure

- **Create** `supabase/migrations/0004_daily_results.sql`, `0005_push_subscriptions.sql` — schema (applied manually).
- **Create** `lib/dates.ts` — `etToday` (moved out of `hall-of-fame.ts` for neutral reuse).
- **Modify** `lib/medals.ts` — re-base `tallyMedals` to a finalized-date set; add pure `formatPodiumText`.
- **Modify** `lib/medals.test.ts` — update/extend tests.
- **Modify** `lib/hall-of-fame.ts` — import `etToday` from `./dates`; tally by finalized days.
- **Modify** `app/api/ingest/route.ts`, `app/api/scores/manual/route.ts` — ET `play_date`; instant finalize hook.
- **Create** `lib/push.ts` — `web-push` send (`notifyPodium`).
- **Create** `lib/finalize.ts` — `finalizeDay` / `maybeFinalizeToday`.
- **Create** `app/api/push/subscribe/route.ts` — store a subscription.
- **Create** `app/api/cron/finalize/route.ts` + `vercel.json` — cutoff cron.
- **Create** `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `public/sw.js` — PWA shell.
- **Create** `components/EnableNotificationsButton.tsx`; **Modify** `app/setup/page.tsx` — opt-in UI.

---

### Task 1: Database migrations (applied by controller)

**Files:**
- Create: `supabase/migrations/0004_daily_results.sql`
- Create: `supabase/migrations/0005_push_subscriptions.sql`

- [ ] **Step 1: Create `supabase/migrations/0004_daily_results.sql`**

```sql
-- Records which days have been finalized (all players in, or the cutoff fired).
-- Drives exactly-once notification and the Hall of Fame medal tally.
create table daily_results (
  play_date date primary key,
  finalized_at timestamptz not null default now()
);

alter table daily_results enable row level security;

create policy "Daily results are viewable by authenticated users"
  on daily_results for select to authenticated using (true);
-- No insert/update policy: only the service-role client (finalization) writes here.
```

- [ ] **Step 2: Create `supabase/migrations/0005_push_subscriptions.sql`**

```sql
-- One row per device a user has enabled push on.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;

create policy "Users manage their own push subscriptions"
  on push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_daily_results.sql supabase/migrations/0005_push_subscriptions.sql
git commit -m "Add daily_results and push_subscriptions migrations"
```

> **Controller gate:** apply both in the Supabase SQL editor before deploy. Implementers proceed without them (code is resilient to the tables being absent during local build/test).

---

### Task 2: Move `etToday` into `lib/dates.ts`

**Files:**
- Create: `lib/dates.ts`
- Modify: `lib/hall-of-fame.ts`
- Modify: `lib/medals.test.ts`

- [ ] **Step 1: Create `lib/dates.ts`**

```ts
/** Current date in America/New_York as an ISO `YYYY-MM-DD` string. */
export function etToday(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}
```

- [ ] **Step 2: Update `lib/hall-of-fame.ts`** — remove its local `etToday` definition and import it instead.

Delete this block from `lib/hall-of-fame.ts`:
```ts
/** Current date in America/New_York as an ISO `YYYY-MM-DD` string. */
export function etToday(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}
```

Add to the import block at the top of `lib/hall-of-fame.ts`:
```ts
import { etToday } from './dates';
```

- [ ] **Step 3: Update the `etToday` test import in `lib/medals.test.ts`**

Change:
```ts
import { etToday } from './hall-of-fame';
```
to:
```ts
import { etToday } from './dates';
```

- [ ] **Step 4: Run tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: PASS (10 tests; `etToday` cases still pass, now sourced from `./dates`).

- [ ] **Step 5: Commit**

```bash
git add lib/dates.ts lib/hall-of-fame.ts lib/medals.test.ts
git commit -m "Move etToday into lib/dates for shared reuse"
```

---

### Task 3: Re-base `tallyMedals` onto finalized days

**Files:**
- Modify: `lib/medals.ts`
- Modify: `lib/medals.test.ts`
- Modify: `lib/hall-of-fame.ts`

- [ ] **Step 1: Replace the `tallyMedals` describe block in `lib/medals.test.ts`**

Find the existing `describe('tallyMedals', ...)` block and replace it entirely with:

```ts
describe('tallyMedals', () => {
  const scores = [
    { userId: 'a', finalScore: 100, playDate: '2026-06-10' },
    { userId: 'b', finalScore: 80, playDate: '2026-06-10' },
    { userId: 'c', finalScore: 50, playDate: '2026-06-10' },
    { userId: 'b', finalScore: 90, playDate: '2026-06-11' },
    { userId: 'a', finalScore: 70, playDate: '2026-06-11' },
  ];

  it('counts only finalized days', () => {
    const tally = tallyMedals(scores, new Set(['2026-06-10', '2026-06-11']));
    expect(tally.get('a')).toEqual({ gold: 1, silver: 1, bronze: 0 });
    expect(tally.get('b')).toEqual({ gold: 1, silver: 1, bronze: 0 });
    expect(tally.get('c')).toEqual({ gold: 0, silver: 0, bronze: 1 });
  });

  it('ignores unfinalized days', () => {
    const tally = tallyMedals(scores, new Set(['2026-06-10']));
    expect(tally.get('a')).toEqual({ gold: 1, silver: 0, bronze: 0 });
    expect(tally.get('b')).toEqual({ gold: 0, silver: 1, bronze: 0 });
    expect(tally.get('c')).toEqual({ gold: 0, silver: 0, bronze: 1 });
  });

  it('returns an empty map when no days are finalized', () => {
    expect(tallyMedals(scores, new Set()).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: FAIL — `tallyMedals` still has the old `(scores, todayEt)` signature.

- [ ] **Step 3: Replace `tallyMedals` in `lib/medals.ts`**

Replace the entire existing `tallyMedals` function with:

```ts
/**
 * Tallies medals per user across every FINALIZED day. A day counts when its
 * `playDate` (ISO `YYYY-MM-DD`) is present in `finalizedDates`. Pure.
 */
export function tallyMedals(
  scores: { userId: string; finalScore: number; playDate: string }[],
  finalizedDates: Set<string>
): Map<string, MedalCounts> {
  const byDay = new Map<string, DayScore[]>();
  for (const s of scores) {
    if (!finalizedDates.has(s.playDate)) continue;
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

- [ ] **Step 4: Run tests to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `lib/hall-of-fame.ts` to tally by finalized days**

In `fetchHallOfFame`, inside the existing `try` block, add a `daily_results` fetch to the `Promise.all` and pass the resulting set to `tallyMedals`. Replace the existing `try` block body so it reads:

```ts
  try {
    const [scoresRes, profilesRes, finalizedRes] = await Promise.all([
      supabase.from('scores').select('user_id, final_score, play_date'),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('daily_results').select('play_date'),
    ]);
    const scores = (scoresRes.data ?? []).map((r) => ({
      userId: r.user_id as string,
      finalScore: r.final_score as number,
      playDate: r.play_date as string,
    }));
    for (const p of profilesRes.data ?? []) {
      profileNames.set(p.id as string, p.display_name as string);
    }
    const finalizedDates = new Set((finalizedRes.data ?? []).map((d) => d.play_date as string));
    derived = tallyMedals(scores, finalizedDates);
  } catch {
    // Leave derived empty -> Hall of Fame falls back to seed-only.
  }
```

(The `etToday` import added in Task 2 is now unused in this file — remove the `import { etToday } from './dates';` line from `lib/hall-of-fame.ts`.)

- [ ] **Step 6: Run the full suite + build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib/medals.ts lib/medals.test.ts lib/hall-of-fame.ts
git commit -m "Tally Hall of Fame medals by finalized days"
```

---

### Task 4: Add `formatPodiumText`

**Files:**
- Modify: `lib/medals.ts`
- Modify: `lib/medals.test.ts`

- [ ] **Step 1: Append tests to `lib/medals.test.ts`**

```ts
describe('formatPodiumText', () => {
  const names = new Map([
    ['a', 'Conner'],
    ['b', 'Jordan'],
    ['c', 'Zach'],
  ]);

  it('formats a full podium', () => {
    expect(formatPodiumText({ gold: ['a'], silver: ['b'], bronze: ['c'] }, names)).toBe(
      '🥇 Conner  🥈 Jordan  🥉 Zach'
    );
  });

  it('joins tied names with &', () => {
    expect(formatPodiumText({ gold: ['a', 'b'], silver: [], bronze: ['c'] }, names)).toBe(
      '🥇 Conner & Jordan  🥉 Zach'
    );
  });

  it('returns an empty string for an empty podium', () => {
    expect(formatPodiumText({ gold: [], silver: [], bronze: [] }, names)).toBe('');
  });
});
```

Also add `formatPodiumText` to the existing `./medals` import at the top of the file:
```ts
import { computePodium, tallyMedals, formatPodiumText } from './medals';
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: FAIL — `formatPodiumText` not exported.

- [ ] **Step 3: Append the implementation to `lib/medals.ts`**

```ts
/**
 * Renders a podium as notification text, e.g. "🥇 Conner  🥈 Jordan  🥉 Zach".
 * Empty tiers are omitted; tied names within a tier are joined with " & ".
 */
export function formatPodiumText(podium: Podium, nameByUserId: Map<string, string>): string {
  const name = (id: string) => nameByUserId.get(id) ?? 'Unknown';
  const tiers: string[] = [];
  if (podium.gold.length) tiers.push(`🥇 ${podium.gold.map(name).join(' & ')}`);
  if (podium.silver.length) tiers.push(`🥈 ${podium.silver.map(name).join(' & ')}`);
  if (podium.bronze.length) tiers.push(`🥉 ${podium.bronze.map(name).join(' & ')}`);
  return tiers.join('  ');
}
```

- [ ] **Step 4: Run to verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/medals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/medals.ts lib/medals.test.ts
git commit -m "Add formatPodiumText for notification rendering"
```

---

### Task 5: ET `play_date` in the write endpoints

**Files:**
- Modify: `app/api/ingest/route.ts`
- Modify: `app/api/scores/manual/route.ts`

- [ ] **Step 1: `app/api/ingest/route.ts`** — add the import and switch the date.

Add to the imports:
```ts
import { etToday } from '@/lib/dates';
```
Replace:
```ts
  const playDate = new Date().toISOString().slice(0, 10);
```
with:
```ts
  const playDate = etToday();
```

- [ ] **Step 2: `app/api/scores/manual/route.ts`** — same change.

Add to the imports:
```ts
import { etToday } from '@/lib/dates';
```
Replace:
```ts
  const playDate = new Date().toISOString().slice(0, 10);
```
with:
```ts
  const playDate = etToday();
```

- [ ] **Step 3: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/ingest/route.ts app/api/scores/manual/route.ts
git commit -m "Date scores by Eastern Time for consistent day boundaries"
```

---

### Task 6: `web-push` sender (`lib/push.ts`)

**Files:**
- Modify: `package.json` (add `web-push`)
- Create: `lib/push.ts`

- [ ] **Step 1: Install the dependency**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm install web-push && npm install -D @types/web-push`

- [ ] **Step 2: Create `lib/push.ts`**

```ts
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

let configured = false;

/** Lazily set VAPID details so importing this module never throws when env is absent. */
function ensureConfigured(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a podium notification to every stored subscription. Expired subscriptions
 * (HTTP 404/410) are deleted; other per-send failures are logged and skipped. A blank
 * `podiumText` (no medals) sends nothing.
 */
export async function notifyPodium(
  supabase: SupabaseClient,
  podiumText: string
): Promise<void> {
  if (!podiumText) return;
  ensureConfigured();

  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');
  const subs = (data ?? []) as SubscriptionRow[];

  const payload = JSON.stringify({ title: '🏆 BFF Leaderboard', body: podiumText, url: '/' });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error('push send failed', s.endpoint, statusCode);
        }
      }
    })
  );
}
```

- [ ] **Step 3: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: build succeeds (no import-time crash even without VAPID env set).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/push.ts
git commit -m "Add web-push sender for podium notifications"
```

---

### Task 7: Finalization engine (`lib/finalize.ts`)

**Files:**
- Create: `lib/finalize.ts`

- [ ] **Step 1: Create `lib/finalize.ts`**

```ts
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
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/finalize.ts
git commit -m "Add finalizeDay engine (record + notify, idempotent, forceable)"
```

---

### Task 8: Wire the instant trigger into the write endpoints

**Files:**
- Modify: `app/api/ingest/route.ts`
- Modify: `app/api/scores/manual/route.ts`

- [ ] **Step 1: `app/api/ingest/route.ts`** — finalize after a successful upsert.

Add to the imports:
```ts
import { maybeFinalizeToday } from '@/lib/finalize';
```
Replace the success return:
```ts
  return NextResponse.json({ status: parsed ? 'ok' : 'needs_review' });
```
with:
```ts
  try {
    await maybeFinalizeToday(supabase);
  } catch (err) {
    console.error('finalize after ingest failed', err);
  }

  return NextResponse.json({ status: parsed ? 'ok' : 'needs_review' });
```
(`supabase` here is already the service-role client.)

- [ ] **Step 2: `app/api/scores/manual/route.ts`** — finalize with a service client after a successful upsert.

Add to the imports:
```ts
import { createServiceClient } from '@/lib/supabase/service';
import { maybeFinalizeToday } from '@/lib/finalize';
```
Replace the success return:
```ts
  return NextResponse.json({ status: 'ok' });
```
with:
```ts
  try {
    await maybeFinalizeToday(createServiceClient());
  } catch (err) {
    console.error('finalize after manual entry failed', err);
  }

  return NextResponse.json({ status: 'ok' });
```

- [ ] **Step 3: Mock `@/lib/finalize` in both route test files**

The route tests must NOT invoke real finalization — the manual route's `createServiceClient()` is otherwise un-mocked and would hit production Supabase (even finalizing a real day). Add this mock near the top of BOTH `app/api/ingest/route.test.ts` and `app/api/scores/manual/route.test.ts`, alongside their existing `vi.mock(...)` calls (these files already import `vi` from `vitest`):

```ts
vi.mock('@/lib/finalize', () => ({
  maybeFinalizeToday: vi.fn().mockResolvedValue(false),
}));
```

- [ ] **Step 4: Build + tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run build`
Expected: all existing route tests pass (now with finalization mocked to a no-op); build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/api/ingest/route.ts app/api/scores/manual/route.ts app/api/ingest/route.test.ts app/api/scores/manual/route.test.ts
git commit -m "Finalize the day instantly after each score write"
```

---

### Task 9: Subscription storage endpoint

**Files:**
- Create: `app/api/push/subscribe/route.ts`

- [ ] **Step 1: Create `app/api/push/subscribe/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const keys = typeof record.keys === 'object' && record.keys !== null
    ? (record.keys as Record<string, unknown>)
    : {};
  const endpoint = typeof record.endpoint === 'string' ? record.endpoint : null;
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : null;
  const auth = typeof keys.auth === 'string' ? keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' });

  if (error) {
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: build succeeds with `/api/push/subscribe` listed.

- [ ] **Step 3: Commit**

```bash
git add app/api/push/subscribe/route.ts
git commit -m "Add endpoint to store a user's push subscription"
```

---

### Task 10: Cutoff cron

**Files:**
- Create: `app/api/cron/finalize/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create `app/api/cron/finalize/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { finalizeDay } from '@/lib/finalize';
import { etToday } from '@/lib/dates';

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = etToday();

  const { data: scoreDays } = await supabase
    .from('scores')
    .select('play_date')
    .lt('play_date', today);
  const { data: doneDays } = await supabase.from('daily_results').select('play_date');

  const done = new Set((doneDays ?? []).map((d) => d.play_date as string));
  const pending = [...new Set((scoreDays ?? []).map((d) => d.play_date as string))].filter(
    (d) => !done.has(d)
  );

  const finalized: string[] = [];
  for (const day of pending) {
    if (await finalizeDay(supabase, day, { force: true })) finalized.push(day);
  }

  return NextResponse.json({ finalized });
}
```

- [ ] **Step 2: Create `vercel.json`**

```json
{
  "crons": [{ "path": "/api/cron/finalize", "schedule": "0 5 * * *" }]
}
```

- [ ] **Step 3: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: build succeeds with `/api/cron/finalize` listed.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/finalize/route.ts vercel.json
git commit -m "Add midnight-ET cutoff cron to finalize no-show days"
```

> **Controller gate:** set `CRON_SECRET` in Vercel; Vercel injects it as the cron's bearer.

---

### Task 11: PWA shell (manifest, icons, service worker)

**Files:**
- Create: `app/manifest.ts`
- Create: `app/icon.tsx`
- Create: `app/apple-icon.tsx`
- Create: `public/sw.js`

- [ ] **Step 1: Create `app/icon.tsx`** (favicon + manifest icon, generated via `next/og`)

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 360,
          background: '#0a0f1a',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🏆
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 2: Create `app/apple-icon.tsx`** (iOS Home Screen icon)

```tsx
import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 128,
          background: '#0a0f1a',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        🏆
      </div>
    ),
    { ...size }
  );
}
```

- [ ] **Step 3: Create `app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BFF Leaderboard',
    short_name: 'BFF',
    description: 'Daily maptap.gg leaderboard for the squad.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0f1a',
    theme_color: '#0a0f1a',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
```

- [ ] **Step 4: Create `public/sw.js`**

```js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'BFF Leaderboard';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 5: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: build succeeds; `/manifest.webmanifest`, `/icon`, `/apple-icon` generated.

- [ ] **Step 6: Commit**

```bash
git add app/manifest.ts app/icon.tsx app/apple-icon.tsx public/sw.js
git commit -m "Add PWA manifest, generated icons, and push service worker"
```

---

### Task 12: Enable-notifications UI on `/setup`

**Files:**
- Create: `components/EnableNotificationsButton.tsx`
- Modify: `app/setup/page.tsx`

- [ ] **Step 1: Create `components/EnableNotificationsButton.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function EnableNotificationsButton() {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (!supported || (isIos && !standalone)) {
    return (
      <div className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
        To get result notifications on iPhone, add this site to your Home Screen first: tap the
        Share icon, choose <span className="font-medium">Add to Home Screen</span>, then open it
        from there and enable notifications.
      </div>
    );
  }

  async function enable() {
    setStatus('working');
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('error');
        setMessage('Notifications were not allowed.');
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
        ),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) {
        setStatus('error');
        setMessage('Could not save your subscription — try again.');
        return;
      }
      setStatus('done');
      setMessage('Notifications enabled! 🔔');
    } catch {
      setStatus('error');
      setMessage('Something went wrong enabling notifications.');
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={enable} disabled={status === 'working' || status === 'done'}>
        {status === 'done'
          ? 'Notifications on 🔔'
          : status === 'working'
            ? 'Enabling…'
            : 'Enable notifications'}
      </Button>
      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add a notifications section to `app/setup/page.tsx`**

Add to the imports:
```tsx
import { EnableNotificationsButton } from '@/components/EnableNotificationsButton';
```
Inside the card `<div className="w-full space-y-4 rounded-xl border bg-card p-6">`, immediately after the closing `</ol>` of the Shortcut steps, add:
```tsx
        <div className="border-t pt-4">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Get a push when each day&apos;s results are final.
          </p>
          <EnableNotificationsButton />
        </div>
```

- [ ] **Step 3: Build + lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run lint && npm run build`
Expected: lint clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/EnableNotificationsButton.tsx app/setup/page.tsx
git commit -m "Add enable-notifications opt-in to /setup"
```

---

### Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite, lint, and build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run lint && npm run build`
Expected: all tests pass; lint clean; build succeeds with these routes present: `/api/push/subscribe`, `/api/cron/finalize`, `/manifest.webmanifest`, `/icon`, `/apple-icon`.

- [ ] **Step 2: Confirm no stray files / clean tree**

Run: `git status`
Expected: clean working tree; all changes committed.

---

## Notes for the implementer

- **Do not** attempt to apply Supabase migrations or set env vars — those are controller gates. The code is written so build/test pass without them (lazy VAPID init; resilient fetches).
- Score-write endpoints already have Vitest tests that mock Supabase; the new `maybeFinalizeToday` call is wrapped in try/catch so a mock without `daily_results` cannot fail them.
- `web-push` is a Node library; the routes/`lib/push.ts`/`lib/finalize.ts` run on the server (Node runtime) — do not import them into client components.
