# Daily Results Web Push Design

## Overview

When a day "finalizes," record it, roll its medals into the Hall of Fame immediately, and
send a full-podium web-push notification to everyone subscribed. A day finalizes when
**every account-holder has submitted a score for it** (instant) **or** at the **midnight-ET
daily cutoff** (safety net), whichever comes first.

This is **sub-project 2** (the daily medal engine was sub-project 1). A future **admin
panel (sub-project 3)** will reuse the finalization engine's forced-finalize path; this
spec includes that one forward-looking hook but no admin UI.

## Locked decisions (from brainstorming)

- **Channel:** Web push (PWA). iOS requires the site installed to the Home Screen + a
  granted notification permission.
- **Trigger:** instant when all account-holders submit, else the midnight-ET cutoff.
- **Roster:** everyone with a `profiles` row.
- **Cutoff:** midnight ET (cron robust to exact fire time — see Cron).
- **Notification content:** full podium, e.g. `🥇 Conner  🥈 Jordan  🥉 Zach`. Tapping
  opens the leaderboard. One broadcast to all subscribers (winner included).
- **Enable-notifications prompt:** lives on `/setup`.
- **Hall of Fame timing:** medals update the instant a day finalizes (Hall of Fame counts
  days present in `daily_results`, not "days before today-ET").

## Day basis (consistency fix)

Today the write paths date scores with UTC (`new Date().toISOString().slice(0, 10)`),
but the cutoff is ET — a near-midnight off-by-one risk. This spec standardizes the app's
notion of "today's play_date" to **Eastern Time**:

- Move `etToday(now?: Date): string` from `lib/hall-of-fame.ts` into a neutral
  `lib/dates.ts` (re-export/import from there).
- Use `etToday()` for `play_date` in `app/api/ingest/route.ts` and
  `app/api/scores/manual/route.ts`, replacing the UTC slice.
- Finalization and Hall of Fame use the same ET basis.

Out of scope: the weekly/monthly range math in `lib/leaderboard.ts` (cosmetic period
boundaries, not finalization-critical) stays as-is.

## Data model (two tables; manual migrations via Supabase SQL editor)

`0004_daily_results.sql`:

```sql
create table daily_results (
  play_date date primary key,
  finalized_at timestamptz not null default now()
);
alter table daily_results enable row level security;
create policy "Daily results are viewable by authenticated users"
  on daily_results for select to authenticated using (true);
-- No insert/update policy: only the service-role client (finalization) writes here.
```

`0005_push_subscriptions.sql`:

```sql
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

## Components

### `lib/dates.ts` (new)
`etToday(now: Date = new Date()): string` → ISO `YYYY-MM-DD` in `America/New_York`
(`Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })`). Moved from
`hall-of-fame.ts`, which now imports it.

### `lib/push.ts` (new, server-only)
- Initializes `web-push` with VAPID details from env.
- `notifyPodium(serviceClient, playDate, podiumText)`: loads all `push_subscriptions`,
  sends the payload `{ title: '🏆 BFF Leaderboard', body: podiumText, url: '/' }` to each,
  and deletes any subscription whose send returns HTTP 404/410 (expired).
- `formatPodiumText(podium, nameByUserId)`: pure → `🥇 A  🥈 B  🥉 C` (omits empty tiers;
  joins tied names with `&`). Unit-tested.

### `lib/finalize.ts` (new, server-only)
- `finalizeDay(serviceClient, playDate, opts?: { force?: boolean }): Promise<boolean>`:
  1. If `playDate` already in `daily_results`, return false (idempotent — never double-notify).
  2. Load all `profiles` ids and all `scores` for `playDate`.
  3. If `!force` and not every profile has a score for `playDate`, return false.
  4. Insert `daily_results(play_date)`. (PK conflict → someone beat us; return false.)
  5. Compute podium (`computePodium`), format text, `notifyPodium(...)`. Return true.
  - `force: true` finalizes with whoever has submitted (skips the all-in check) — the
    hook the admin panel's "trigger calculation" button will call. No UI here.
- `maybeFinalizeToday(serviceClient)`: `finalizeDay(serviceClient, etToday())` — the
  instant path called after a score write.

### Instant trigger wiring
- `app/api/ingest/route.ts`: already uses the service-role client. After a successful
  upsert, `await maybeFinalizeToday(serviceClient)` (best-effort; failure to finalize must
  not fail the ingest — wrap in try/catch and log).
- `app/api/scores/manual/route.ts`: currently uses the **session** client. After a
  successful upsert, create a **service-role** client and `await maybeFinalizeToday(...)`
  in a try/catch (same best-effort rule).

### Cutoff cron — `app/api/cron/finalize/route.ts` (new)
- `GET` handler. Requires `Authorization: Bearer ${CRON_SECRET}`; 401 otherwise. When
  `CRON_SECRET` is set, Vercel automatically attaches that exact bearer header to its cron
  invocations, so the same check covers both Vercel's scheduled calls and manual triggers.
- Finalizes **every** unfinalized day strictly before `etToday()` that has at least one
  score: select distinct `play_date` from `scores` where `play_date < etToday()` and not
  in `daily_results`, and `finalizeDay(serviceClient, d, { force: true })` for each.
- Returns `{ finalized: string[] }`.
- **Why "all unfinalized past days":** makes the cron robust to DST and Vercel Hobby's
  approximate, once-daily cron timing — it only needs to run *sometime* after ET midnight.

`vercel.json` (new):
```json
{ "crons": [{ "path": "/api/cron/finalize", "schedule": "0 5 * * *" }] }
```
05:00 UTC ≈ midnight/1am ET. (Vercel injects the `CRON_SECRET` bearer automatically, so
the route's single auth check covers it.)

### Subscribe API — `app/api/push/subscribe/route.ts` (new)
- `POST`, session-authenticated. Body: a `PushSubscription` JSON. Upserts a
  `push_subscriptions` row for `auth.uid()` keyed on `endpoint` (so re-subscribing is
  idempotent). Uses the session client (RLS enforces ownership).

### Subscribe UI — `components/EnableNotificationsButton.tsx` (new, client) on `/setup`
- If `Notification`/`serviceWorker`/`PushManager` unsupported, or on iOS Safari **not**
  in standalone mode (`window.matchMedia('(display-mode: standalone)')` false &&
  `navigator.standalone` falsy), render "Add BFF Leaderboard to your Home Screen first"
  with the iOS share-sheet steps instead of the button.
- Otherwise an "Enable notifications" button that: registers `/sw.js`, calls
  `Notification.requestPermission()`, `registration.pushManager.subscribe({ userVisibleOnly:
  true, applicationServerKey: <NEXT_PUBLIC_VAPID_PUBLIC_KEY> })`, and POSTs the result to
  `/api/push/subscribe`. Shows enabled/error states.
- Added as a section on `app/setup/page.tsx` (alongside the token UI).

### PWA shell
- `app/manifest.ts` (new): `name`, `short_name`, `display: 'standalone'`,
  `background_color`/`theme_color` matching the dark theme, `start_url: '/'`, and 192 +
  512 icons.
- Icons: generate simple 🏆 brand PNGs (192, 512) + an `apple-touch-icon` (180). Stored in
  `public/` and `app/`.
- `public/sw.js` (new): `push` listener → `self.registration.showNotification(title, {
  body, data: { url } })`; `notificationclick` → focus an existing client or
  `clients.openWindow(url)`.

### Hall of Fame re-basing
- `lib/medals.ts`: change `tallyMedals(scores, todayEt)` → `tallyMedals(scores,
  finalizedDates: Set<string>)`, counting only days whose `playDate ∈ finalizedDates`.
  Update unit tests accordingly.
- `lib/hall-of-fame.ts`: fetch `daily_results.play_date` into a `Set`, pass to
  `tallyMedals`. (Falls back to seed-only on error, unchanged.)

## Environment / secrets (set in Vercel + `.env.local`)
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:`),
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (= public key, for the client), `CRON_SECRET`. The VAPID
keypair is generated once (`npx web-push generate-vapid-keys`).

## Error handling
- Finalization is best-effort from write paths: a failure to finalize/notify must never
  fail the score write (try/catch + log).
- `notifyPodium` tolerates per-subscription failures; expired subs (404/410) are deleted,
  others logged and skipped.
- `daily_results` PK + the "already finalized?" check guarantee exactly-once notification.
- Hall of Fame still degrades to seed-only on any fetch error.

## Testing
Pure logic unit-tested (Vitest), matching existing patterns:
- `formatPodiumText`: full/partial podiums, ties joined with `&`, empty.
- `tallyMedals` (re-based): counts only finalized days; ignores unfinalized ones.
- `computePodium`: unchanged (already covered).
Supabase/web-push/service-worker glue verified by typecheck/build + a manual end-to-end
check (subscribe on an installed PWA, submit scores to finalize a day, confirm push).

## Out of scope
- Admin panel (sub-project 3) — only the `force` hook on `finalizeDay` is built here.
- Per-user notification preferences / quiet hours / unsubscribe UI beyond browser-level.
- Reworking weekly/monthly leaderboard range math to ET.
