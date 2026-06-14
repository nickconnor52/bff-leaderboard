@AGENTS.md

# bff-leaderboard

A leaderboard app tracking a 7-person friend group's daily maptap.gg performance, replacing a
manual "share to group chat, Jordan tallies it" process with automatic capture and rich
leaderboards.

## Stack

- Next.js (App Router) + TypeScript
- Supabase (Postgres + Auth, via `@supabase/ssr`)
- Tailwind CSS + shadcn/ui
- Vitest for unit tests
- Deployed on Vercel

## Key concepts

- **One score per user per day.** The `scores` table has a unique constraint on
  `(user_id, play_date)`; the ingest endpoint upserts on conflict, so re-sharing the same day
  overwrites rather than duplicates.
- **Personal API tokens** let an iOS Shortcut POST share text to `/api/ingest` without a
  browser session. Tokens are generated at `/setup`, shown once, and stored only as a SHA-256
  hash (`profiles.api_token_hash`).
- **The ingest route uses the Supabase service-role client**, which bypasses Row Level
  Security, after validating the token itself — this is the one place in the app that's allowed
  to write a score on behalf of a user without their session.
- **`category_scores` is flexible JSON** because we don't yet know the full meaning of
  maptap.gg's scoring categories (the emoji breakdown). Storing it richly now means achievements
  could be layered on later without a schema rewrite.
- **Why a Shortcut instead of a "share to app" button:** Apple does not support the Web Share
  Target API for home-screen web apps on iOS, so a true one-tap share-sheet integration isn't
  possible for a PWA. An iOS Shortcut is the closest native equivalent.

## Where things live

- `lib/parser.ts` — pure function parsing maptap.gg share text into `{ finalScore,
  categoryScores, commentText }`; fully unit tested in `lib/parser.test.ts`
- `lib/leaderboard.ts` — `aggregateLeaderboard` and `getDateRange` (pure, unit tested) plus
  `fetchLeaderboard` (thin Supabase-querying wrapper)
- `lib/tokens.ts` — API token generation (`generateApiToken`) and hashing (`hashApiToken`)
- `lib/supabase/` — three Supabase client factories: `browser.ts` (client components),
  `server.ts` (server components/route handlers, respects RLS via the user's session),
  `service.ts` (bypasses RLS — server-only, must perform its own authorization)
- `app/api/ingest/route.ts` — Shortcut ingest endpoint
- `app/api/admin/import/route.ts` + `app/admin/import/page.tsx` — manual history backfill
- `supabase/migrations/` — SQL schema (apply manually via the Supabase SQL Editor)

## Design docs

See `docs/superpowers/specs/` for the full v1 design rationale and `docs/superpowers/plans/`
for the implementation plan this was built from.

- **Ranking system rules** (ELO ladder + weekly championship) live in
  `docs/superpowers/specs/2026-06-13-ranking-system-design.md` — the canonical, living rules
  doc. The *rules* are there; the *current tuned numbers* live in the `ranking_config` table.

## Vision / future ideas (not yet built)

- **Achievements** (e.g. "first podium," win streaks). The `category_scores` JSON and daily
  granularity were chosen specifically to make this possible later without a schema rewrite.
- **Support for additional games** beyond maptap.gg. The current schema is intentionally
  maptap.gg-specific; generalize once a second game's actual format is known, rather than
  guessing now.
- **Automated history import.** Jordan's existing tracking is informal/scattered across chat
  messages, so v1 only ships a manual backfill page (`/admin/import`).
