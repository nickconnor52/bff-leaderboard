# Ranking System Design (ELO ladder + weekly championship)

**This is the canonical, living rules doc for the ranking system — update it as we iterate.**
The *rules* live here; the *current tuned numbers* live in the `ranking_config` DB row
(so they can be toggled without a deploy). Linked from `CLAUDE.md`.

## Overview

A Leetify/CS-style competitive ranking layered on the existing daily maptap.gg scores. Every
finalized day and every completed week moves each player's rating up or down; that rating maps
to a visible ladder of tiers and divisions. A weekly championship (Mon–Sun) is the headline
event, crowning a Champion and moving rating at a heavier weight.

Built **engine-first** as two sub-projects:

- **Sub-project 1 (THIS spec): the headless ranking engine + ladder + replay/calibration +
  persistence + config.** Fully unit-tested pure logic; minimal surface (a `fetchStandings`
  reader + a verification script). No polished UI.
- **Sub-project 2 (future): the experience** — rank badges on the leaderboard, a ladder/
  standings page, the championship card (last week's Champion only), a rating-history graph,
  and an `/admin` form for tuning the config + flagging special events. *Out of scope here.*

## Locked decisions (from brainstorming 2026-06-13)

1. **Engine = hybrid**: a positional base curve, plus an Elo "surprise" term so beating a
   stronger-than-expected field gains more and losing to a weaker one costs more.
2. **Calibration = replay**: everyone starts equal at the maptap era start (2026-04-28); the
   engine replays all 47 finalized days (and completed weeks) to "now," then we tune knobs so
   today **Conner = Diamond I (base of Diamond)** and **Jason = Iron I**.
3. **Ladder = 6 tiers × 3 divisions = 18 rungs**, divisions ordered **I → II → III within a
   tier (I lowest)**. Full ladder: Iron I (bottom) → … → Diamond III (top).
4. **Promotion gate**: reaching the top of a division puts you in a rank-up state; your next
   submitted day must finish **top-3** to advance.
5. **Demotion shield**: the first loss that would drop you a division is absorbed; you get
   **one day** of protection.
6. **Daily curve**: ranked among players who *submitted*; top-3 gain, bottom-3 lose, middle
   ~0; scales to short fields by finishing **percentile**. Absence = no change.
7. **Weekly championship (Mon–Sun)**: rank by **total** weekly score, apply the same curve at a
   higher (toggleable) **weekly weight**, AND crown that week's **Champion** (tracked title).
8. **Weights are data, not code**: a `ranking_config` row; tuning a value triggers a full
   ladder recompute. Special-event multipliers supported in config (scheduling UI is future).
9. **Champions**: full history retained (`weekly_champions`); the web UI shows **only last
   week's** Champion.

## Core principle: deterministic replay

The entire ladder is a **pure function of `(scores, finalized days, ranking_config)`**. The
engine folds over finalized days in chronological order, threading ladder state through, and
emits an audit log. Same inputs + same config ⇒ same ladder, always. Recompute = replay from
scratch; it is idempotent and cheap (47 days × 7 players). This is why toggling a weight and
recomputing yields a fully consistent ladder with zero drift.

## The rating math

One continuous rating **R** per player serves as both the ladder position and the input to the
Elo expectation (no separate hidden MMR — unnecessary for a fixed 7-person group).

### Daily event (one finalized day)

Let the players who submitted be the field of size `n`; rank them (ties share a place, reusing
`computePodium`'s competition-ranking + tie logic). For a player finishing at place `r`:

- **actual** = fraction of the field finished ahead of: `actual = (n − r) / (n − 1)`
  (best = 1, worst = 0; for ties, average the tied places' actual).
- **base** (positional) = `curve_scale × (2·actual − 1)` → best `+curve_scale`, worst
  `−curve_scale`, middle ~0. (Top-3 gain / bottom-3 lose / middle tiny for a full 7-field;
  scales naturally to short fields.)
- **expected** = average over opponents `o` of `1 / (1 + 10^((R_o − R_self)/D))` (logistic;
  `D` a config scale constant) → your expected fraction-of-field-beaten given ratings.
- **surprise** = `actual − expected ∈ [−1, 1]`.
- **Δ** = `(base × daily_weight + k_factor × surprise) × event_multiplier`.

This additive form is sign-correct: an underdog win adds extra gain; a favorite tanking takes
an extra loss. *(Refines the multiplicative sketch from brainstorming — the additive term is
the precise rule because `base` changes sign across the field.)*

Days with `< 2` submissions produce no change (reusing the `computePodium` `< 2` guard).

### Weekly championship event (one completed Mon–Sun week)

Rank players by **total** Mon–Sun `final_score` (over whatever days they submitted). Apply the
identical formula with `weekly_weight` in place of `daily_weight`. The week's #1 is recorded as
**Champion** in `weekly_champions`. A week is processed once it is fully in the past (its
Sunday ≤ the latest finalized day), so "last week's Champion" appears automatically when the
week closes — no separate cron.

A weekly Δ moves R through the same band rules and **can** set `promo_pending` (push you to a
cap) or trigger the shield, but a weekly result never *satisfies* a promotion — promos are
resolved only by a daily top-3 finish. (This keeps "rank-up match" a daily concept.)

## Ladder state machine

R is divided into fixed `band_width`-sized **bands**: 18 rungs = 6 tiers × 3 divisions.
`rung = floor((R − ladder_floor) / band_width)`, clamped to `[0, 17]`; `tier = floor(rung/3)`;
`division = (rung mod 3) + 1` (1=I lowest, 3=III highest). `LP = ((R − rung_floor) /
band_width) × 100`, displayed 0–100.

- **Promotion (up).** When a gain would push R past the top of the current division, R is
  **held at the cap (LP 100)** and `promo_pending = true` — no crossing yet. On the next
  submitted day, a **top-3** finish (`promo_place = 3`) releases the cap: advance one division,
  Δ flows normally again. Miss it → stay capped, retry next day. A *losing* day while pending
  drops R back down within the division (pending clears). Ceiling: Diamond III LP 100.
  On a tiny field (fewer than `promo_place` submitted), the promo is satisfied by finishing
  no worse than last (i.e. `place ≤ max(promo_place, n−1)`), so a thin day can't block forever.
- **Demotion shield (down).** When a loss would drop R below the current division floor for the
  first time, R is **held at the floor (LP 0)** and `shield_active = true` for `shield_days`
  (=1). Any subsequent gain clears the shield and lifts R off the floor; another qualifying
  loss while shielded drops one division. Floor: Iron I LP 0 (shield moot there).

Holding R at the boundary until the promo/shield resolves is what keeps the state machine
deterministic on replay.

## Calibration (the 47-day replay)

Everyone starts at `start_rating` (a mid rung) on 2026-04-28. The engine replays all finalized
daily events plus each completed Mon–Sun week in order. We then tune three knobs empirically —
`curve_scale` (spread speed), `start_rating` (midpoint), `band_width` (rungs the spread spans)
— until the endpoints land: **Conner → Diamond I, Jason → Iron I**, others distributed between.
Pure replay means re-running after any config change instantly recalibrates.

## Data model (4 tables; service-role written; all recomputable)

- **`ranking_config`** — single row of knobs: `curve_scale`, `k_factor`, `d_scale`,
  `daily_weight`, `weekly_weight`, `event_multiplier`, `band_width`, `ladder_floor`,
  `start_rating`, `promo_place` (3), `shield_days` (1). Tunable in SQL now; admin form later.
- **`rating_events`** — append-only audit log, one row per player per scoring event:
  `kind` (`daily`|`weekly`), `event_date` (play_date or week_start), `delta`, resulting
  `rating`, `rung`, `lp`, `promo_pending`, `shield_active`. Source for the future history graph.
- **`ranking_standings`** — materialized "now" per player: `rating`, `tier`, `division`, `lp`,
  `promo_pending`, `shield_active`, `champion_count`. A cache of the latest replay.
- **`weekly_champions`** — one row per completed week: `week_start`, `champion_user_id`,
  `total_score`. Full history retained; UI shows only the most recent.

## Integration & recompute

- Pure engine in `lib/ranking/`; persistence via the service-role client (same trust model as
  `finalizeDay`).
- **Recompute = replay → overwrite `ranking_standings`, rebuild `rating_events` +
  `weekly_champions`.** Idempotent.
- **Triggers**: (1) after each `finalizeDay` (best-effort — a recompute failure must never break
  finalization, exactly like the push step); (2) a standalone `recomputeRanking()` for config
  changes (wired to the admin button in Sub-project 2).
- **Initial calibration**: a one-off script (same pattern as `scripts/backfill/`) runs the
  replay, tunes the three knobs to the endpoints, and writes `ranking_config` + standings.

## Surface (this sub-project)

Intentionally minimal: a `fetchStandings()` reader and a verification script that prints the
final ladder (player → tier/division/LP, R, champion counts). All visuals are Sub-project 2.

## Testing (pure, mirroring `lib/medals.test.ts`)

- Base curve: full field, short fields, ties; `< 2` players → no change.
- Hybrid surprise term: underdog win amplifies gain; favorite tanking amplifies loss.
- Weekly aggregation + Champion selection.
- Band/division/LP mapping across all 18 rungs and boundaries.
- Promo state machine: pending → promote on top-3, fail/retry, cancel on a loss, Diamond III
  ceiling.
- Demotion shield: engage at floor, clear on a gain, demote on a second loss, Iron I floor.
- Full-replay determinism + idempotent recompute (running twice = identical standings).
- Calibration fixture: replaying the 47 days with the chosen config yields Conner = Diamond I,
  Jason = Iron I.

## Out of scope (Sub-project 2+ / later)

- All UI: rank badges, ladder/standings page, last-week Champion card, rating-history graph.
- The `/admin` config-tuning form and special-event scheduling UI (config supports the
  multiplier now; the scheduling surface is later).
- Season resets / soft-reset mechanics (revisit once a "season" concept is wanted).
