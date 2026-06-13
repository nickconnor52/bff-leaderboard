# Admin Panel Design

## Overview

A gated `/admin` area for owner(s) to manage scores, finalize days, and manage profiles —
productizing operations done by hand all session via the service-role REST API. This is
**sub-project 3** (after the medal engine and web push). v1 = score management + manual
finalize + profile management; password resets and a historical-import UI are out of scope.

## Locked decisions (from brainstorming)

- **Admin authorization:** a `profiles.is_admin boolean not null default false` flag. The
  owner flips their own to `true` once via SQL.
- **v1 scope:** admin shell + gating, score management (add/edit/delete any user's score
  for any date), manual "finalize this day", and profile management (rename, nickname
  CRUD, link a `historical_wins` row to a profile). Retrofit the existing `/admin/import`
  behind the same gate.
- **Admin-entered scores** use a new `entry_method: 'admin'` → no "Cheating" badge.

## Authorization

Currently `/admin/import` and `/api/admin/import` are only login-gated (any signed-in user
can use them) — this spec closes that gap.

- `lib/admin.ts` (server-only): `getAdminUser(supabase): Promise<User | null>` — calls
  `supabase.auth.getUser()`, then selects `is_admin` from the user's `profiles` row;
  returns the user only if `is_admin` is true, else `null`.
- **Page gate:** `app/admin/layout.tsx` (server component) builds a server client, calls
  `getAdminUser`, and `notFound()`s if null. Because it wraps every `/admin/*` route, it
  also gates the existing `/admin/import` page automatically.
- **API gate:** every `/api/admin/*` route independently calls `getAdminUser` first and
  returns 403 if null, *then* performs writes with the service-role client. Defense in
  depth (the layout does not protect route handlers), per Next's guidance to authorize
  inside each route rather than relying on a proxy.
- RLS is unchanged: admin writes go through the service-role client (which bypasses RLS)
  only after `getAdminUser` passes — the same pattern `/api/ingest` already uses.

## Schema — migration `0006_admin.sql` (applied manually)

```sql
-- Admin flag. Owner sets their own to true once, by hand:
--   update profiles set is_admin = true where display_name = 'Nick';
alter table profiles add column is_admin boolean not null default false;

-- Allow admin-entered scores (no "Cheating" badge — only 'manual' triggers that).
alter table scores drop constraint scores_entry_method_check;
alter table scores
  add constraint scores_entry_method_check
  check (entry_method in ('shortcut', 'manual', 'import', 'admin'));
```

> If the existing constraint's name differs from `scores_entry_method_check`, find it with
> `select conname from pg_constraint where conrelid = 'scores'::regclass and contype = 'c';`
> and substitute. (Postgres' default inline-check name follows `scores_entry_method_check`.)

## Components

### `lib/admin.ts` (server-only)
`getAdminUser(supabase)` as described under Authorization. No other logic.

### Page: `app/admin/layout.tsx`
Server component. Creates a server client, `const user = await getAdminUser(supabase)`,
`if (!user) notFound()`. Renders a simple admin nav (links: **Scores** `/admin`, **Users**
`/admin/users`, **Import** `/admin/import`, **← Leaderboard** `/`) above `{children}`.

### Page: `app/admin/page.tsx` — score management
- A date control (defaults to today-ET via `etToday()`); changing it navigates with a
  `?date=YYYY-MM-DD` query param (server component reads `searchParams`).
- Server-fetches all `profiles` (id, display_name) and all `scores` for that date, joins
  them into one row per profile (score or blank).
- Renders a client table component (`components/admin/AdminScoreTable.tsx`) with, per row:
  the player, an editable score input, Save (add/edit), and Delete (when a score exists).
- A **"Finalize this day"** button posting to `/api/admin/finalize`.
- Save/Delete call `/api/admin/scores`; on success the component refreshes
  (`router.refresh()`).

### Page: `app/admin/users/page.tsx` — users list
Server-fetches all `profiles` (id, display_name, is_admin); lists them, each linking to
`/admin/users/[id]`.

### Page: `app/admin/users/[id]/page.tsx` — profile detail
Server-fetches the profile, its `nicknames`, and all `historical_wins` (to show
linked/unlinked rows). Renders a client component
(`components/admin/AdminProfileEditor.tsx`) with:
- **Rename:** display_name input → `PATCH /api/admin/profiles/[id]`.
- **Nicknames:** list with delete buttons + an add field → `POST`/`DELETE /api/admin/nicknames`.
- **Link wins:** a select of unlinked `historical_wins` rows (those with `user_id is null`)
  → `POST /api/admin/link-wins` sets that row's `user_id` to this profile.

### Main header: `app/page.tsx`
When the signed-in user is an admin, show an **"Admin"** pill (linking to `/admin`) in the
logged-in action group. Requires fetching the user's `is_admin` — reuse `getAdminUser`
(returns the user when admin, so a non-null result drives the pill).

## API routes (all: `getAdminUser` → 403 if not admin, then service-role writes)

- **`POST /api/admin/scores`** — body `{ userId, playDate, finalScore }`. Validates
  `finalScore` is an integer 0–999 (reuse `parseManualScore`). Upserts `scores` with
  `entry_method: 'admin'`, `category_scores: {}`, `comment_text: null`,
  `raw_share_text: 'Admin entry'`, `parse_status: 'ok'`, `onConflict: 'user_id,play_date'`.
- **`DELETE /api/admin/scores`** — body `{ userId, playDate }`. Deletes that score row.
- **`POST /api/admin/finalize`** — body `{ playDate }`. Calls
  `finalizeDay(service, playDate, { force: true })`; returns `{ finalized: boolean }`
  (false when already finalized).
- **`PATCH /api/admin/profiles/[id]`** — body `{ displayName }` (non-empty, trimmed).
  Updates `profiles.display_name`.
- **`POST /api/admin/nicknames`** — body `{ userId, nickname }` (non-empty). Inserts a
  `nicknames` row. **`DELETE /api/admin/nicknames`** — body `{ id }`. Deletes by id.
- **`POST /api/admin/link-wins`** — body `{ historicalWinId, userId }`. Sets that
  `historical_wins` row's `user_id`.

## Data flow

```
admin browser ──fetch──► /api/admin/* ──getAdminUser (server client, RLS)──► 403?
                                       └─ ok ─► service-role client writes
                                                  (scores / profiles / nicknames /
                                                   historical_wins / finalizeDay)
/admin/* pages ──getAdminUser in layout──► notFound() for non-admins
```

Medals are derived from `scores`, so any score add/edit/delete here flows into the Hall of
Fame on next render with no recompute — including for already-finalized past days.

## Error handling

- Unauthenticated / non-admin: pages `notFound()`; APIs return 403.
- Input validation failures return 400 with a message; the client surfaces it.
- Service-role write failures return 500; the client shows an error and does not refresh.
- `finalizeDay` is already idempotent and best-effort for notifications.

## Testing

- Unit-test any pure validation added (score range reuses the already-tested
  `parseManualScore`; no new pure engine here).
- Admin auth, routes, and pages are integration glue verified by `npm run build`,
  `npm run lint`, the full test suite, and a manual check (flip `is_admin`, confirm a
  non-admin gets 404 on `/admin` and 403 from the APIs; edit a score and watch the Hall of
  Fame update; finalize a day; rename, add a nickname, link a wins row).

## Out of scope (v2+)

- Admin-triggered password resets.
- A UI for the parsed-log historical import (stays manual; see
  `historical-data-import-plan`).
- Bulk operations / audit log.
