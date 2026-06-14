# Ranking UI — Badges & Match Labels Design (Sub-project 2a)

Surfaces the ranking engine (sub-project 1) in the UI: a **rank badge** wherever a player's
name appears, and **Promotion / Demotion Match** labels on the Today leaderboard. The engine,
data, and `fetchStandings` already exist; this is presentation + light data-wiring.

**Deferred to a later build (SP2b):** the dedicated ladder/standings page, the last-week
Champion card, the rating-history graph, and the `/admin` config-tuning form. (The history
graph's data — `rating_events` — is already stored; see "Future" below.)

## Locked decisions (from brainstorming 2026-06-14)

1. **Badge style = "Direction A" with division fill.** A pill colored by tier whose fill
   ramps with division: **Div I = outline (empty) → Div II = semi-filled → Div III = solid**.
   Platinum and Diamond glow at higher divisions; Diamond III is a gradient + glow. Shows the
   rank label (`"Diamond I"`) and optionally LP.
2. **Tier palette (accent hex):** Iron `#6f7fa3` (dark cobalt-gray), Bronze `#d9a36b`,
   Silver `#cdd6df`, Gold `#ecc658`, Platinum `#5fe0d4`, Diamond `#7cc2ff`, **Emerald `#1fc983`**
   (medium jewel-green, kept distinct from Platinum's cyan — added 2026-06-14 as the top tier).
   Emerald III is the fanciest badge: gradient `linear-gradient(180deg,#22d98c,#0e9a63)`, dark
   text `#04140e`, border `#5fefb6`, glow `0 0 16px rgba(40,220,150,.78)`.
3. **Badge everywhere; match-label only on Today.** `RankBadge` renders on the podium cards,
   all leaderboard rows (every tab), and Hall of Fame. `MatchLabel` (Promotion/Demotion)
   renders only on the **daily ("Today")** tab next to the score, because a promo/demo match
   is about the next daily game.
4. **One fetch, passed down.** `app/page.tsx` fetches standings once into a
   `Map<userId, Standing>` and passes it to the leaderboard + Hall of Fame components.

## Visual recipe (reproduce the approved mockup exactly)

Per badge, an accent color `--c` = `TIER_ACCENT[tier]`. Fill by division (via CSS `color-mix`):

- **Div I (`f1`, empty):** `background: transparent; border: 1px solid color-mix(in srgb, var(--c) 50%, transparent); color: var(--c);`
- **Div II (`f2`, semi):** `background: color-mix(in srgb, var(--c) 18%, #0d1117); border: 1px solid color-mix(in srgb, var(--c) 65%, transparent); color: var(--c);`
- **Div III (`f3`, solid):** `background: color-mix(in srgb, var(--c) 34%, #0d1117); border: 1px solid var(--c); color: color-mix(in srgb, var(--c) 88%, white);`

Glow: Platinum III `box-shadow: 0 0 8px rgba(95,224,212,.45)`; Diamond II
`box-shadow: 0 0 7px rgba(124,194,255,.35)`; Diamond III overrides to
`background: linear-gradient(180deg,#2f78d6,#1c4f9c); color:#eaf6ff; border-color:#7cc2ff; box-shadow: 0 0 14px rgba(124,194,255,.7)`.

Pill shape: `border-radius: 999px`, `font: 600 12px`, padding ~`6px 11px`, inline-flex with an
optional dimmed LP suffix. LP is shown where space allows (podium, Hall of Fame); a compact
`size="sm"` variant (no LP) is used in dense leaderboard rows.

**Match labels:** `⬆ Promotion Match` (green: text `#7ff0b0`, bg `rgba(35,180,110,.15)`, border
`rgba(60,210,140,.5)`) when `promo_pending`; `⬇ Demotion Match` (red: text `#ff9b9b`, bg
`rgba(220,70,70,.15)`, border `rgba(240,90,90,.5)`) when `shield_active`; nothing otherwise.

## Components & data flow

- **`lib/ranking/tiers.ts` (pure, new):** `TIER_NAMES` (`['Iron','Bronze','Silver','Gold',
  'Platinum','Diamond']`), `TIER_ACCENT` (tier index → hex), `rankLabel(tier, division)` →
  e.g. `"Diamond I"` (division as Roman I/II/III), `fillLevel(division)` → `1|2|3`. Unit-tested.
- **`components/leaderboard/rank-badge.tsx` (new, presentational):** `RankBadge({ tier,
  division, lp?, showLp?, size? })` — renders the pill using `tiers.ts` + the visual recipe
  via inline styles. No data logic.
- **`components/leaderboard/match-label.tsx` (new, presentational):** `MatchLabel({
  promoPending, shieldActive })` — renders the green/red pill or `null`.
- **`app/page.tsx` (modify):** also call `fetchStandings(supabase)` (from
  `lib/ranking/persistence.ts`), build `Map<userId, Standing>`, pass to `LeaderboardTable`
  (with a `period`/`isDaily` flag so it knows whether to show match labels) and `HallOfFame`.
- **`components/leaderboard/leaderboard-table.tsx` (modify):** render `RankBadge` next to each
  name (podium + rows); render `MatchLabel` next to the score **only when the period is daily**.
- **`components/leaderboard/podium-card.tsx` (modify):** accept + render the player's
  `RankBadge` (and `MatchLabel` when daily).
- **`components/leaderboard/hall-of-fame.tsx` (modify):** render `RankBadge` next to each entry.
- **`lib/hall-of-fame.ts` (modify):** add `userId` to `HallOfFameRow` (already known
  internally) so the Hall of Fame can look up the badge; update `lib/hall-of-fame.test.ts`.

```
app/page.tsx
  ├─ fetchLeaderboard (existing, per period) ──► entries (have userId)
  ├─ fetchHallOfFame  (existing, +userId now) ──► hof rows
  └─ fetchStandings   (existing) ──► Map<userId, Standing{tier,division,lp,promo_pending,shield_active}>
        │
        ├─► LeaderboardTable(entries, standings, isDaily) ─► PodiumCard / rows ─► RankBadge (+ MatchLabel if daily)
        └─► HallOfFame(rows, standings) ─► RankBadge
```

A player with no standing (shouldn't happen for the 7 profiles, but defensively) simply renders
no badge — components treat a missing map entry as "no badge."

**Styling approach:** tier visuals live in `tiers.ts` + inline styles using `color-mix`, not
Tailwind theme tokens — Tailwind can't express per-tier dynamic classes cleanly, and this keeps
the whole palette in one place. The existing "Cheating" badge is unchanged.

## Testing

- Unit-test `lib/ranking/tiers.ts`: `rankLabel` for sample tier/division pairs (incl. Roman
  numerals), `fillLevel(1|2|3)`, and that `TIER_NAMES`/`TIER_ACCENT` have all 6 entries.
- Update `lib/hall-of-fame.test.ts` for the new `userId` field.
- `RankBadge` / `MatchLabel` are presentational → verified by `npm run lint` + `npm run build`,
  then a **manual visual check**: run the app, confirm badges render like the approved mockup
  (Iron cobalt-gray, fill ramp, Platinum/Diamond glow) and that Promotion/Demotion labels
  appear on the Today tab only. Capture a screenshot to compare against the mockup.

## Future (SP2b — not in this build)

The rating-history graph is already supported by stored data: **`rating_events`** holds one row
per player per scoring event (`event_date`, `kind`, `delta`, resulting `rating`, `rung`, `lp`,
flags) — a full per-player MMR/LP time-series. Note it is rebuilt by the deterministic replay on
each recompute, so it reflects the **current config across all history** (consistent, no drift),
not frozen snapshots under older configs. Immutable snapshots would be a small future addition
if ever wanted. Also deferred: dedicated ladder/standings page, last-week Champion card (reads
`weekly_champions`, most-recent only), and the `/admin` config-tuning form.
