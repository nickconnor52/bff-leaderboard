# bff-leaderboard v1 — Design Spec

Date: 2026-06-07

## Vision

Nick's friend group of 7 plays [maptap.gg](https://www.maptap.gg) every morning and shares
results in their iMessage group chat, where Jordan manually tracks wins. This project replaces
that manual tracking with an app that:

- Automatically captures everyone's daily score with as little friction as possible
- Shows full leaderboards (daily / weekly / monthly / all-time) with special visual treatment
  for podium finishers
- Preserves the group's personality (trash talk, jokes appended to scores)
- Is built to support more games and achievements down the road, without committing to that
  complexity now

This is Nick's first fully "vibe-coded" app. Decisions and context are documented generously
(this spec, and `CLAUDE.md` at the repo root) so future agentic sessions can pick up with full
context rather than re-deriving it.

## Background: the current manual flow

Each morning, players finish a maptap.gg round (one play per day — Wordle-style) and tap
"Share," which produces structured text like:

```
www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744

Damn, tough one
```

Players send this to the group iMessage chat, sometimes with an appended joke/comment (e.g.
Conner "Craig" Craig's trash talk). Jordan then manually tracks who won.

## Stack

- **Next.js (App Router)** — full-stack React framework; pages, API routes, and server logic
  together. Chosen partly because it's the framework AI coding agents are most familiar with,
  supporting the "future agentic work" goal.
- **Supabase** — Postgres + Auth + dashboard in one service. Bundling these reduces the number
  of moving pieces (important for a first project), and the dashboard gives Nick a friendly way
  to inspect data directly.
- **Tailwind CSS + shadcn/ui** — styling foundation; makes custom components (like podium
  treatments) straightforward without fighting a heavyweight design system.
- **Vercel** — hosting, paired naturally with Next.js. Both Vercel and Supabase have free tiers
  that comfortably cover a 7-person app.

## Architecture & flow

```
[Friend plays maptap.gg]
        ↓ taps Share
[iOS Share Sheet → personal Shortcut]
        ↓ POSTs raw share text + personal token
[Next.js API route: /api/ingest]
        ↓ validates token → identifies user
        ↓ parses share text → structured score
[Supabase Postgres: scores table]
        ↓
[Next.js leaderboard pages: daily/weekly/monthly/all-time]
        ↓ rendered with podium treatment for top 3
```

### Why a Shortcut, not a Web Share Target

A PWA "share target" (where the app shows up directly in the OS share sheet) is the most
seamless option on Android, but **Apple does not support the Web Share Target API for
home-screen web apps on iOS** — and this group is on iPhones. The iOS-native equivalent is
**Shortcuts**: a Shortcut can appear in the share sheet, receive shared text, and POST it to a
URL. Nick authors one Shortcut, distributes it via a shareable link, and each friend installs it
once.

### Onboarding (one-time per friend)

1. Sign up / log in via Supabase Auth (magic-link email — no passwords to manage)
2. Visit a "Setup" page that generates their personal API token
3. Install Nick's Shortcut (via shareable iCloud link) and paste their token into it during setup

After setup, the daily flow is: tap Share in maptap.gg → tap the Shortcut from the share sheet
→ done. Auto-parsed and submitted with no further taps.

## Data model (v1 — maptap.gg-specific)

We are **not** generalizing the schema for multiple games yet. We'll build around what we know
today (maptap.gg's format) and refactor when game #2 actually arrives — avoiding guesses about
needs we can't see yet.

### `profiles`
Extends Supabase Auth users.
- `id` (matches auth user id)
- `display_name`
- `api_token_hash` (hashed personal token used by the Shortcut to authenticate)
- `created_at`

### `scores`
One row per user per day (maptap.gg allows exactly one play per day).
- `id`
- `user_id` (FK → profiles)
- `play_date` (date; **unique together with `user_id`** — enforces one play per day, and makes
  re-submission an upsert/overwrite rather than a duplicate)
- `final_score` (int)
- `category_scores` (jsonb — e.g. `{"🔥": 799, "🏅": 96, "🙃": 66, "🎉": 89, "🫣": 50}`; stored
  as flexible JSON because we don't yet know what each category means, and this keeps the door
  open for achievements later without a schema rewrite — without building achievements now)
- `comment_text` (optional trailing joke/commentary, e.g. "Damn, tough one")
- `raw_share_text` (the original shared text — safety net if parsing changes or fails)
- `parse_status` (`ok` | `needs_review` — malformed submissions are stored, not rejected, so a
  format change on maptap.gg's end doesn't cause silent data loss)
- `created_at`

## Capture flow details

- **`/api/ingest`**: `POST` with the personal token (bearer header) and raw share text. Looks up
  the user by token, parses the text, and **upserts** into `scores` keyed on `(user_id,
  play_date)` — so accidental re-shares overwrite rather than duplicate.
- **Parser**: a small, independently-tested function mapping maptap.gg's share text →
  `{final_score, category_scores, comment_text}`. Built and validated against real examples
  (including joke variants) *before* wiring up the Shortcut, so we aren't debugging the parser
  and the Shortcut simultaneously.
- **Failure handling**: text that doesn't match the expected format is still stored
  (`raw_share_text` + `parse_status = needs_review`) rather than rejected — visible for
  follow-up rather than silently lost.

## Leaderboard & UI

- **Views**: Daily / Weekly / Monthly / All-time, switchable via tabs on one leaderboard page.
  Weekly/monthly/all-time ranking math (total vs. average) to be finalized during
  implementation — both are easy to offer.
- **Podium treatment**: top 3 in any view get distinct visual styling (e.g. gold/silver/bronze
  accents, larger cards, subtle shine/animation) so "who's on top" feels celebratory.
- **Personality touches**: surface that day's `comment_text` next to a player's entry, so the
  leaderboard reflects the group's actual banter, not just numbers.

## Out of scope for v1 (deliberately deferred)

- **Achievements** — the data model (rich `category_scores`, daily granularity) is structured
  so achievements could be layered on later without a rebuild, but no achievement features ship
  in v1.
- **Multi-game support** — schema is maptap.gg-specific; will generalize once a second game's
  format is actually known.
- **Automated history import** — Jordan's existing tracking is informal/scattered across
  messages, not in a structured format. Rather than building import tooling now, v1 ships with
  a simple admin-only manual-entry page so historical results can be reconstructed by hand as a
  lower-priority follow-up.

## Documentation approach

- **`docs/superpowers/specs/`** — dated design docs (this one, plus future ones for new
  features) capturing the *why* behind decisions.
- **`CLAUDE.md`** (repo root) — living reference for future agentic sessions: stack overview,
  conventions, where things live, and a running list of vision/future ideas (achievements,
  multi-game support, etc.).
