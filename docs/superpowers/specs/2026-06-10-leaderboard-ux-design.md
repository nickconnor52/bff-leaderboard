# Leaderboard UX Design

## Overview

Four UX improvements to the leaderboard app:

1. **Manual score entry** — a self-service "Add my score" dialog (paste share text or
   type the raw final score) for people who don't want to set up the iOS Shortcut, with a
   "😤 Cheating" badge marking days entered this way.
2. **`/setup` button** — a visible link to the token/Shortcut setup page from the
   leaderboard header.
3. **Title treatment + dynamic subtitle** — "🏆 BFF Leaderboard" with a subtitle reading
   "Are you smarter than a `<nickname>`?", where `<nickname>` is randomly drawn from the
   current last-place player's nickname bank.
4. **Theme + mobile polish** — a neutral-blue dark theme (default), built on the existing
   shadcn CSS-custom-property token system so it stays easy to retheme later, plus mobile-
   first responsive tweaks.

A visual mockup was reviewed and approved: dark background, blue primary accent, and
"metallic" podium colors (champagne gold / cool silver / copper bronze) replacing the
original mustard-toned gold/bronze.

---

## 1. Database changes

New migration `supabase/migrations/0002_manual_entry_and_nicknames.sql`:

```sql
-- Tracks how a score was submitted. 'manual' entries get the "Cheating" badge;
-- 'import' (historical backfill via /admin/import) does not, so Jordan's bulk
-- history import doesn't retroactively tag everyone's all-time record.
alter table scores
  add column entry_method text not null default 'shortcut'
  check (entry_method in ('shortcut', 'manual', 'import'));

-- Per-user nickname bank, used for the "Are you smarter than a <nickname>?"
-- subtitle. Seeded by hand via the Supabase SQL editor for v1.
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

`app/api/admin/import/route.ts` is updated to set `entry_method: 'import'` on inserted
rows.

---

## 2. Manual score entry

### API: `app/api/scores/manual/route.ts` (new)

- Session-authenticated via `lib/supabase/server.ts` `createClient()` (RLS-respecting,
  no service-role bypass — the existing "Users can insert/update their own scores"
  policies already permit this).
- Returns `401` if there's no authenticated user.
- Request body is one of:
  - `{ "shareText": string }` — run through the existing `parseShareText()` from
    `lib/parser.ts`. If it returns `null` (unparseable), respond `400` with
    `{ "error": "Couldn't read that — make sure you copied the full share text." }` so the
    dialog can show the message and let the person retry. Nothing is written in this case.
  - `{ "finalScore": number }` — the "raw number" path. Must be an integer in `[0, 999]`
    (3 digits); otherwise `400` with `{ "error": "Enter a score between 0 and 999." }`.
    Stored with `category_scores: {}`, `comment_text: null`,
    `raw_share_text: "Manual entry: <finalScore>"`.
- Both paths upsert into `scores` on `(user_id, play_date)` with:
  - `play_date` = today, UTC (`new Date().toISOString().slice(0, 10)`, matching
    `app/api/ingest/route.ts` for consistency)
  - `entry_method: 'manual'`
  - `parse_status: 'ok'` (the raw-number path isn't a parse failure — it's intentionally
    minimal data)
- Success response: `{ "status": "ok" }`.

### UI: "Add my score" dialog

New `components/leaderboard/add-score-dialog.tsx` (client component):

- Add the shadcn `Dialog` component (`npx shadcn add dialog`) — not yet present in
  `components/ui/`.
- A "+ Add my score" button rendered below the title/subtitle in `app/page.tsx`, opening
  the dialog.
- Inside the dialog, a two-option segmented control (two buttons, one highlighted as
  active, matching the mockup) that toggles which input is shown:
  - **"Paste share text"** — a `<textarea>` for the full maptap.gg share text.
  - **"Just the number"** — a numeric `<input>` (`type="number"`, `min={0}`, `max={999}`).
- On submit: `POST /api/scores/manual` with the appropriate body. On success, close the
  dialog and call `router.refresh()` so the server-rendered leaderboard updates
  immediately. On error, show the returned error message inline in the dialog (don't
  close it).

### Leaderboard: "Cheating" badge

`lib/leaderboard.ts` changes:

- `ScoreRow` gains `entry_method: string`.
- `LeaderboardEntry` gains `isManual: boolean` — `true` if **any** row contributing to
  that entry in the period had `entry_method === 'manual'`. For `daily` (always exactly
  one row per user) this is exact; for `weekly`/`monthly`/`all-time` it means "cheated at
  least once this period."
- `fetchLeaderboard`'s `select` adds `entry_method`.

`components/leaderboard/podium-card.tsx` and `components/leaderboard/leaderboard-table.tsx`:

- When `entry.isManual` is true, render a "😤 Cheating" badge using the new
  `--badge-cheating-*` theme tokens (see Theme section), styled as a small rounded pill
  next to the player's name/score (as shown in the mockup).

---

## 3. `/setup` button

A small pill-style link in the `app/page.tsx` header, next to the "🏆 BFF Leaderboard"
title, pointing to `/setup`. Pure markup addition — no new components.

---

## 4. Title treatment + dynamic subtitle

### Header

`app/page.tsx` renders:

```
🏆 BFF Leaderboard                    [Setup]
   Are you smarter than a <nickname>?
```

- Title: large, bold (`text-3xl sm:text-4xl font-extrabold tracking-tight`).
- Subtitle: smaller, muted, italic, with the nickname highlighted in the primary color —
  matching the mockup.

### Determining the subtitle target

New `lib/nicknames.ts`:

- `getSubtitleTarget(entriesByPeriod: LeaderboardEntry[][]): LeaderboardEntry | null`
  — **pure, unit-tested**. Input is the `[daily, weekly, monthly, allTime]` arrays
  already fetched in `app/page.tsx`. Logic:
  1. If `daily` is non-empty, return its last entry (today's last place).
  2. Else if `allTime` is non-empty, return its last entry (no extra query — already
     fetched).
  3. Else return `null` (zero scores have ever been recorded).
- `fetchRandomNickname(supabase, userId: string, fallbackName: string): Promise<string>`
  — queries `nicknames` for `userId`. If one or more rows exist, returns one at random.
  Otherwise returns `fallbackName` (the player's `displayName`), so "Are you smarter than
  a Craig?" works correctly before any nicknames are seeded.

### Rendering

In `app/page.tsx`, after fetching `entriesByPeriod`:

```ts
const subtitleTarget = getSubtitleTarget(entriesByPeriod);
const subtitle = subtitleTarget
  ? `Are you smarter than a ${await fetchRandomNickname(supabase, subtitleTarget.userId, subtitleTarget.displayName)}?`
  : 'Track your maptap.gg scores with the squad';
```

Because this runs on every server render, refreshing the page yields a new random
nickname (per the "random on every page load" requirement).

---

## 5. Theme + mobile polish

### Theme

The existing `app/globals.css` already implements shadcn's swappable token system:
CSS custom properties in `:root` (light) and `.dark` (dark), mapped to Tailwind utilities
via `@theme inline`. We build on this rather than replacing it:

- `app/layout.tsx`: add `className="dark"` to the `<html>` element, making dark the
  default (and only, for now) theme. `:root` (light values) is left untouched, so a
  future light/dark toggle has somewhere to fall back to.
- Replace the `.dark` block's existing grayscale values with the neutral-blue palette
  from the approved mockup (slate backgrounds, blue-500 primary, etc.).
- Add new tokens to `.dark` (and corresponding `@theme inline` mappings so Tailwind
  classes like `bg-podium-gold` are generated):
  - `--podium-gold` / `--podium-gold-border`
  - `--podium-silver` / `--podium-silver-border`
  - `--podium-bronze` / `--podium-bronze-border`
  - `--badge-cheating-bg` / `--badge-cheating-border` / `--badge-cheating-text`

  Approved hex values (from the mockup's "Metallic" podium variant):
  - Gold: bg `#2b2510`, border `#e6c875`
  - Silver: bg `#232a35`, border `#c7d2e0`
  - Bronze: bg `#2a1f18`, border `#d99868`
  - Cheating badge: bg `#450a0a`, border `#ef4444`, text `#fca5a5`

  Base palette (from the mockup's dark theme):
  - `--background: #0f172a`, `--foreground: #e2e8f0`
  - `--primary: #3b82f6`, `--primary-foreground: #f8fafc`
  - `--card: #1e293b`, `--border: #334155`
  - `--muted: #1e293b`, `--muted-foreground: #94a3b8`
  - `--accent: #1e3a5f`

- To retheme later: edit the `.dark` block's hex values — no component changes needed.

### Mobile polish

- `app/layout.tsx`: replace the placeholder `metadata` (`title: "Create Next App"`) with
  `title: "BFF Leaderboard"` and a real description.
- `components/leaderboard/leaderboard-table.tsx`: the current
  `` `grid-cols-${podium.length}` `` is a dynamically-constructed Tailwind class that the
  compiler can't reliably generate. Replace with an explicit lookup of literal classes
  (`grid-cols-1` / `grid-cols-2` / `grid-cols-3`) keyed on `podium.length`.
- Apply responsive text sizing from the mockup throughout (e.g.
  `text-3xl sm:text-4xl` for the title, smaller podium text on narrow screens via
  `text-xs sm:text-sm` / `text-xl sm:text-2xl`).
- shadcn `Dialog` is responsive by default (full-width with margin on small screens).

---

## 6. Testing plan

**Unit tests (Vitest)**, following the existing convention of testing pure `lib/`
functions:

- `lib/leaderboard.ts` — extend `aggregateLeaderboard` tests for `isManual`:
  - single manual day → `isManual: true`
  - mixed manual/non-manual days in a multi-day period → `isManual: true`
  - all non-manual → `isManual: false`
- `lib/nicknames.ts` — `getSubtitleTarget`:
  - daily has entries → returns daily's last entry
  - daily empty, all-time has entries → returns all-time's last entry
  - both empty → returns `null`
- New `parseManualScore(input: string): number | null` in `lib/parser.ts` — valid
  `0`–`999`, rejects negative numbers, non-integers, and values `> 999`.

**Manual/browser testing** (routes and UI aren't unit tested per existing convention):

- `/api/scores/manual` happy path for both modes, plus the unparseable-paste error path.
- "Add my score" dialog at mobile and desktop widths.
- "Cheating" badge appears correctly on the podium and in list rows.
- Subtitle changes on refresh (random nickname) and falls back correctly:
  - last-place user has no nicknames seeded → shows their display name
  - no scores today → falls back to all-time last place
  - zero scores ever → generic tagline
- Theme renders correctly across `/`, `/setup`, `/login`, `/admin/import`.

---

## Open items / things you might want to revisit

- `entry_method = 'import'` for historical backfill means those rows never show
  "Cheating" — flip to `'manual'` if you'd find it funnier to have it apply retroactively.
- Manual entry always targets *today* (no date picker for backfilling a missed day).
- The raw-number path accepts `0`–`999` with no lower bound beyond non-negative — adjust
  if maptap.gg scores have a realistic minimum worth enforcing.
