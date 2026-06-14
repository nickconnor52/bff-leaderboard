# Ranking Engine Implementation Plan (Sub-project 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless ELO ladder + weekly-championship engine: a deterministic replay over the score history that produces every player's rating, tier/division/LP, promo/shield state, and weekly Champions, persisted to four new tables.

**Architecture:** Pure functions in `lib/ranking/` compute everything from `(scores, finalized days, config)`. A free-floating continuous rating `R` drives both the ladder bands and the Elo expectation; a separately-gated `displayedRung` realizes the spec's "hold at boundary" promo/shield semantics. Persistence recomputes the whole ladder by replay (idempotent) and is triggered best-effort from `finalizeDay`. Calibration is a one-off script.

**Tech Stack:** TypeScript, Vitest (pure unit tests), Supabase (`@supabase/ssr` service-role client), Next.js (only the `finalizeDay` hook touches app code).

> **Environment:** default `node` is v18; the repo needs 20.20.2. **Prefix every npm/node command with** `source ~/.nvm/nvm.sh && nvm use 20.20.2 &&`.
>
> **Controller gate (human, not the implementer):** apply migration `0008_ranking.sql` in the Supabase SQL editor before Task 8's persistence is exercised against the live DB. Pure-logic tasks (1–7) need no DB. The full design/rules doc is `docs/superpowers/specs/2026-06-13-ranking-system-design.md`.
>
> **Reuse:** ranking of a day's scores follows the same competition-ranking + tie idea as `lib/medals.ts`'s `computePodium`, but the engine needs *every* player's place, so we write a general `rankScores`. Do not change `medals.ts`.

---

## File Structure

- **Create** `lib/ranking/types.ts` — shared interfaces (`RankingConfig`, `DayScore`, `LadderState`, `RatingEvent`, `Standing`, `WeeklyChampion`).
- **Create** `lib/ranking/config.ts` — `DEFAULT_CONFIG` (pre-calibration defaults).
- **Create** `lib/ranking/scoring.ts` + `scoring.test.ts` — `rankScores`, `actualFraction`, `expectedFraction`, `dayDeltas` (pure rating math).
- **Create** `lib/ranking/ladder.ts` + `ladder.test.ts` — `rungForRating`, `deriveStanding`, `applyEvent` (the promo/shield state machine).
- **Create** `lib/ranking/weekly.ts` + `weekly.test.ts` — `weekStartOf`, `weekEndOf`, `weeklyTotals`.
- **Create** `lib/ranking/replay.ts` + `replay.test.ts` — `replay` (the chronological fold producing standings, events, champions).
- **Create** `lib/ranking/persistence.ts` — `recomputeRanking`, `fetchStandings`, `loadConfig` (DB I/O via service-role).
- **Create** `supabase/migrations/0008_ranking.sql` — the four tables (+ config seed row).
- **Modify** `lib/finalize.ts` — best-effort `recomputeRanking` call after a day finalizes.
- **Create** `scripts/ranking/calibrate.mjs` — one-off replay + endpoint check to tune config.

---

### Task 1: Types + default config + migration

**Files:**
- Create: `lib/ranking/types.ts`
- Create: `lib/ranking/config.ts`
- Create: `supabase/migrations/0008_ranking.sql`

- [ ] **Step 1: Create `lib/ranking/types.ts`**

```ts
export interface RankingConfig {
  curveScale: number;   // base points for 1st (and -this for last)
  kFactor: number;      // Elo surprise weight
  dScale: number;       // logistic rating scale for expected placement
  dailyWeight: number;
  weeklyWeight: number;
  eventMultiplier: number; // global / special-event multiplier
  bandWidth: number;    // rating span of one division
  ladderFloor: number;  // rating at the bottom of Iron I
  startRating: number;  // everyone's rating at the era start
  promoPlace: number;   // best place that counts as a promo win (3)
  shieldDays: number;   // days of demotion protection (1)
}

export interface DayScore {
  userId: string;
  finalScore: number;
}

export interface LadderState {
  rating: number;
  displayedRung: number; // 0..17 (the division actually achieved)
  promoPending: boolean;
  shieldActive: boolean;
}

export interface RatingEvent {
  userId: string;
  kind: 'daily' | 'weekly';
  eventDate: string; // play_date (daily) or week_start (weekly), ISO YYYY-MM-DD
  delta: number;
  rating: number;
  rung: number;
  lp: number;
  promoPending: boolean;
  shieldActive: boolean;
}

export interface Standing {
  userId: string;
  rating: number;
  tier: number;     // 0 Iron .. 5 Diamond
  division: number; // 1 (I, low) .. 3 (III, high)
  lp: number;       // 0..100
  promoPending: boolean;
  shieldActive: boolean;
  championCount: number;
}

export interface WeeklyChampion {
  weekStart: string; // Monday ISO date
  championUserId: string;
  totalScore: number;
}

export const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'] as const;
export const RUNG_COUNT = 18; // 6 tiers x 3 divisions
```

- [ ] **Step 2: Create `lib/ranking/config.ts`**

```ts
import type { RankingConfig } from './types';

/**
 * Pre-calibration defaults. The live values are stored in the `ranking_config` table
 * and tuned by `scripts/ranking/calibrate.mjs` (Task 10). bandWidth=100 over 18 rungs
 * spans 1800 rating points above ladderFloor.
 */
export const DEFAULT_CONFIG: RankingConfig = {
  curveScale: 25,
  kFactor: 10,
  dScale: 200,
  dailyWeight: 1,
  weeklyWeight: 3,
  eventMultiplier: 1,
  bandWidth: 100,
  ladderFloor: 0,
  startRating: 800, // ~Silver I to start; calibration will adjust
  promoPlace: 3,
  shieldDays: 1,
};
```

- [ ] **Step 3: Create `supabase/migrations/0008_ranking.sql`**

```sql
-- Ranking engine (ELO ladder + weekly championship). All rows are derived by replay
-- and written only by the service role. See
-- docs/superpowers/specs/2026-06-13-ranking-system-design.md

-- Single-row config; tunable without a deploy. id is always 1.
create table ranking_config (
  id integer primary key default 1 check (id = 1),
  curve_scale numeric not null default 25,
  k_factor numeric not null default 10,
  d_scale numeric not null default 200,
  daily_weight numeric not null default 1,
  weekly_weight numeric not null default 3,
  event_multiplier numeric not null default 1,
  band_width numeric not null default 100,
  ladder_floor numeric not null default 0,
  start_rating numeric not null default 800,
  promo_place integer not null default 3,
  shield_days integer not null default 1
);
insert into ranking_config (id) values (1);

-- Materialized "now" per player (a cache of the latest replay).
create table ranking_standings (
  user_id uuid primary key references profiles (id) on delete cascade,
  rating numeric not null,
  tier integer not null,
  division integer not null,
  lp integer not null,
  promo_pending boolean not null default false,
  shield_active boolean not null default false,
  champion_count integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Append-only audit log (rebuilt on every recompute).
create table rating_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly')),
  event_date date not null,
  delta numeric not null,
  rating numeric not null,
  rung integer not null,
  lp integer not null,
  promo_pending boolean not null default false,
  shield_active boolean not null default false,
  unique (user_id, kind, event_date)
);

-- Full history of weekly champions; UI shows only the most recent.
create table weekly_champions (
  week_start date primary key,
  champion_user_id uuid not null references profiles (id) on delete cascade,
  total_score integer not null
);

alter table ranking_config enable row level security;
alter table ranking_standings enable row level security;
alter table rating_events enable row level security;
alter table weekly_champions enable row level security;

create policy "Ranking config readable by authenticated" on ranking_config
  for select to authenticated using (true);
create policy "Standings readable by authenticated" on ranking_standings
  for select to authenticated using (true);
create policy "Rating events readable by authenticated" on rating_events
  for select to authenticated using (true);
create policy "Weekly champions readable by authenticated" on weekly_champions
  for select to authenticated using (true);
```

- [ ] **Step 4: Build + commit**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success (no app code references these yet).

```bash
git add lib/ranking/types.ts lib/ranking/config.ts supabase/migrations/0008_ranking.sql
git commit -m "Add ranking types, default config, and schema migration"
```

> **Controller gate:** apply `0008_ranking.sql` in the Supabase SQL editor before Task 8.

---

### Task 2: Day ranking + rating math (`scoring.ts`)

**Files:**
- Create: `lib/ranking/scoring.ts`
- Test: `lib/ranking/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { rankScores, actualFraction, expectedFraction, dayDeltas } from './scoring';
import { DEFAULT_CONFIG } from './config';

describe('rankScores', () => {
  it('assigns competition ranks with ties sharing the better place', () => {
    const places = rankScores([
      { userId: 'a', finalScore: 900 },
      { userId: 'b', finalScore: 900 },
      { userId: 'c', finalScore: 800 },
    ]);
    expect(places.get('a')).toBe(1);
    expect(places.get('b')).toBe(1);
    expect(places.get('c')).toBe(3); // 1,1,3
  });
});

describe('actualFraction', () => {
  it('is 1 for a clear winner and 0 for a clear loser', () => {
    const scores = [
      { userId: 'a', finalScore: 900 },
      { userId: 'b', finalScore: 700 },
    ];
    expect(actualFraction('a', scores)).toBe(1);
    expect(actualFraction('b', scores)).toBe(0);
  });
  it('counts ties as half', () => {
    const scores = [
      { userId: 'a', finalScore: 900 },
      { userId: 'b', finalScore: 900 },
      { userId: 'c', finalScore: 700 },
    ];
    // a: beaten=1 (c), tied=1 (b) -> (1 + 0.5)/2 = 0.75
    expect(actualFraction('a', scores)).toBeCloseTo(0.75, 5);
  });
});

describe('expectedFraction', () => {
  it('is 0.5 when self equals the only opponent', () => {
    expect(expectedFraction(1000, [1000], DEFAULT_CONFIG)).toBeCloseTo(0.5, 5);
  });
  it('is above 0.5 when higher rated than the field', () => {
    expect(expectedFraction(1200, [1000], DEFAULT_CONFIG)).toBeGreaterThan(0.5);
  });
});

describe('dayDeltas', () => {
  it('returns no changes for fewer than two players', () => {
    expect(dayDeltas([{ userId: 'a', finalScore: 900 }], new Map(), 1, DEFAULT_CONFIG)).toEqual([]);
  });
  it('rewards the winner positively and the loser negatively when ratings are equal', () => {
    const ratings = new Map([['a', 800], ['b', 800]]);
    const out = dayDeltas(
      [{ userId: 'a', finalScore: 900 }, { userId: 'b', finalScore: 700 }],
      ratings, 1, DEFAULT_CONFIG
    );
    const a = out.find((d) => d.userId === 'a')!;
    const b = out.find((d) => d.userId === 'b')!;
    expect(a.place).toBe(1);
    expect(a.delta).toBeGreaterThan(0);
    expect(b.delta).toBeLessThan(0);
  });
  it('gives an underdog a bigger gain than a favorite for the same win', () => {
    const favorite = dayDeltas(
      [{ userId: 'a', finalScore: 900 }, { userId: 'b', finalScore: 700 }],
      new Map([['a', 1200], ['b', 800]]), 1, DEFAULT_CONFIG
    ).find((d) => d.userId === 'a')!.delta;
    const underdog = dayDeltas(
      [{ userId: 'a', finalScore: 900 }, { userId: 'b', finalScore: 700 }],
      new Map([['a', 800], ['b', 1200]]), 1, DEFAULT_CONFIG
    ).find((d) => d.userId === 'a')!.delta;
    expect(underdog).toBeGreaterThan(favorite);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/scoring.test.ts`
Expected: FAIL ("Failed to resolve import './scoring'").

- [ ] **Step 3: Implement `lib/ranking/scoring.ts`**

```ts
import type { DayScore, RankingConfig } from './types';

/** Competition ranking (ties share the better place): scores [900,900,800] -> places 1,1,3. */
export function rankScores(scores: DayScore[]): Map<string, number> {
  const sorted = [...scores].sort((a, b) => b.finalScore - a.finalScore);
  const places = new Map<string, number>();
  sorted.forEach((s, i) => {
    const tiedWithPrev = i > 0 && sorted[i - 1].finalScore === s.finalScore;
    places.set(s.userId, tiedWithPrev ? places.get(sorted[i - 1].userId)! : i + 1);
  });
  return places;
}

/** Fraction of the field a player finished ahead of, counting ties as half. 1=best, 0=worst. */
export function actualFraction(userId: string, scores: DayScore[]): number {
  const self = scores.find((s) => s.userId === userId);
  if (!self || scores.length < 2) return 0;
  let beaten = 0;
  let tied = 0;
  for (const s of scores) {
    if (s.userId === userId) continue;
    if (s.finalScore < self.finalScore) beaten += 1;
    else if (s.finalScore === self.finalScore) tied += 1;
  }
  return (beaten + 0.5 * tied) / (scores.length - 1);
}

/** Expected fraction-of-field-beaten from ratings (mean pairwise logistic). */
export function expectedFraction(self: number, opponents: number[], config: RankingConfig): number {
  if (opponents.length === 0) return 0.5;
  const sum = opponents.reduce(
    (acc, o) => acc + 1 / (1 + Math.pow(10, (o - self) / config.dScale)),
    0
  );
  return sum / opponents.length;
}

export interface DayDelta {
  userId: string;
  delta: number;
  place: number;
  fieldSize: number;
}

/**
 * Per-player rating deltas for one event (daily or weekly — pass the relevant weight).
 * delta = (curveScale*(2*actual-1)*weight + kFactor*(actual-expected)) * eventMultiplier.
 * Fewer than 2 players -> no changes.
 */
export function dayDeltas(
  scores: DayScore[],
  ratingByUser: Map<string, number>,
  weight: number,
  config: RankingConfig
): DayDelta[] {
  if (scores.length < 2) return [];
  const places = rankScores(scores);
  const ratingOf = (id: string) => ratingByUser.get(id) ?? config.startRating;
  return scores.map((s) => {
    const actual = actualFraction(s.userId, scores);
    const base = config.curveScale * (2 * actual - 1);
    const opponents = scores.filter((o) => o.userId !== s.userId).map((o) => ratingOf(o.userId));
    const expected = expectedFraction(ratingOf(s.userId), opponents, config);
    const surprise = actual - expected;
    const delta = (base * weight + config.kFactor * surprise) * config.eventMultiplier;
    return { userId: s.userId, delta, place: places.get(s.userId)!, fieldSize: scores.length };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/scoring.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/ranking/scoring.ts lib/ranking/scoring.test.ts
git commit -m "Add ranking day-scoring math (rank, actual/expected, deltas)"
```

---

### Task 3: Ladder mapping + promo/shield state machine (`ladder.ts`)

**Files:**
- Create: `lib/ranking/ladder.ts`
- Test: `lib/ranking/ladder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { rungForRating, deriveStanding, applyEvent, initialState } from './ladder';
import { DEFAULT_CONFIG } from './config';
import type { LadderState } from './types';

const C = DEFAULT_CONFIG; // bandWidth 100, floor 0 -> rung = floor(rating/100), 0..17

describe('rungForRating', () => {
  it('maps rating to a clamped 0..17 rung', () => {
    expect(rungForRating(0, C)).toBe(0);
    expect(rungForRating(150, C)).toBe(1);
    expect(rungForRating(99999, C)).toBe(17);
    expect(rungForRating(-50, C)).toBe(0);
  });
});

describe('deriveStanding', () => {
  it('derives tier/division/lp from a settled state', () => {
    const s: LadderState = { rating: 1740, displayedRung: 17, promoPending: false, shieldActive: false };
    const out = deriveStanding('u', s, 0, C);
    expect(out.tier).toBe(5);     // Diamond
    expect(out.division).toBe(3); // III
    expect(out.lp).toBe(40);      // (1740-1700)/100
  });
  it('shows LP 100 while promo pending and 0 while shielded', () => {
    expect(deriveStanding('u', { rating: 500, displayedRung: 4, promoPending: true, shieldActive: false }, 0, C).lp).toBe(100);
    expect(deriveStanding('u', { rating: 500, displayedRung: 6, promoPending: false, shieldActive: true }, 0, C).lp).toBe(0);
  });
});

describe('applyEvent — promotion', () => {
  it('does not cross up on first reach; enters promo pending', () => {
    const start: LadderState = { rating: 195, displayedRung: 1, promoPending: false, shieldActive: false };
    const next = applyEvent(start, 20, 1, 7, C); // rating -> 215, natural rung 2 > displayed 1
    expect(next.displayedRung).toBe(1);
    expect(next.promoPending).toBe(true);
  });
  it('promotes on a top-3 day while pending', () => {
    const pending: LadderState = { rating: 215, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, 5, 2, 7, C); // place 2 <= 3
    expect(next.displayedRung).toBe(2);
    expect(next.promoPending).toBe(false);
  });
  it('stays pending on a non-top-3 day', () => {
    const pending: LadderState = { rating: 215, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, 3, 5, 7, C); // place 5 > 3
    expect(next.displayedRung).toBe(1);
    expect(next.promoPending).toBe(true);
  });
  it('cancels pending when a loss drops back into the division', () => {
    const pending: LadderState = { rating: 205, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, -20, 6, 7, C); // rating 185 -> natural rung 1 == displayed
    expect(next.promoPending).toBe(false);
    expect(next.displayedRung).toBe(1);
  });
  it('does not advance on a weekly event even with a qualifying place (canPromote=false)', () => {
    const pending: LadderState = { rating: 215, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, 5, 1, 7, C, false); // place 1 but weekly -> no advance
    expect(next.displayedRung).toBe(1);
    expect(next.promoPending).toBe(true);
  });
});

describe('applyEvent — demotion shield', () => {
  it('shields the first drop below the division floor', () => {
    const start: LadderState = { rating: 205, displayedRung: 2, promoPending: false, shieldActive: false };
    const next = applyEvent(start, -20, 6, 7, C); // rating 185 -> natural 1 < displayed 2
    expect(next.displayedRung).toBe(2);
    expect(next.shieldActive).toBe(true);
  });
  it('demotes on a second drop while shielded', () => {
    const shielded: LadderState = { rating: 185, displayedRung: 2, promoPending: false, shieldActive: true };
    const next = applyEvent(shielded, -20, 6, 7, C); // rating 165 still natural 1 < 2
    expect(next.displayedRung).toBe(1);
  });
  it('clears the shield on a recovering gain', () => {
    const shielded: LadderState = { rating: 185, displayedRung: 2, promoPending: false, shieldActive: true };
    const next = applyEvent(shielded, 30, 1, 7, C); // rating 215 -> natural 2 == displayed
    expect(next.shieldActive).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/ladder.test.ts`
Expected: FAIL ("Failed to resolve import './ladder'").

- [ ] **Step 3: Implement `lib/ranking/ladder.ts`**

```ts
import type { LadderState, RankingConfig, Standing } from './types';
import { RUNG_COUNT } from './types';

export function rungForRating(rating: number, config: RankingConfig): number {
  const raw = Math.floor((rating - config.ladderFloor) / config.bandWidth);
  return Math.min(RUNG_COUNT - 1, Math.max(0, raw));
}

export function initialState(config: RankingConfig): LadderState {
  return {
    rating: config.startRating,
    displayedRung: rungForRating(config.startRating, config),
    promoPending: false,
    shieldActive: false,
  };
}

function ladderTop(config: RankingConfig): number {
  // Just below the very top so rungForRating stays at 17.
  return config.ladderFloor + RUNG_COUNT * config.bandWidth - 1e-9;
}

function promoQualifies(place: number, fieldSize: number, config: RankingConfig): boolean {
  return place <= Math.max(1, Math.min(config.promoPlace, fieldSize - 1));
}

/**
 * Apply one event's delta to a player's ladder state. The rating floats freely (clamped to
 * the ladder); displayedRung is gated so it only rises via a promo win and only falls past
 * the shield — realizing the spec's "hold at boundary" promo/shield rules.
 */
export function applyEvent(
  state: LadderState,
  delta: number,
  place: number,
  fieldSize: number,
  config: RankingConfig,
  canPromote = true // false for weekly events: they can push you to a cap but never advance
): LadderState {
  const rating = Math.min(ladderTop(config), Math.max(config.ladderFloor, state.rating + delta));
  const natural = rungForRating(rating, config);
  let { displayedRung, promoPending, shieldActive } = state;

  if (natural > displayedRung) {
    shieldActive = false;
    if (promoPending) {
      if (canPromote && promoQualifies(place, fieldSize, config)) {
        displayedRung += 1;
        promoPending = rungForRating(rating, config) > displayedRung; // more to climb -> re-pend
      }
      // else: failed/ineligible promo, stay pending
    } else {
      promoPending = true;
    }
  } else if (natural < displayedRung) {
    promoPending = false;
    if (shieldActive) {
      displayedRung -= 1;
      shieldActive = rungForRating(rating, config) < displayedRung;
    } else {
      shieldActive = true;
    }
  } else {
    promoPending = false;
    shieldActive = false;
  }

  return { rating, displayedRung, promoPending, shieldActive };
}

export function deriveStanding(
  userId: string,
  state: LadderState,
  championCount: number,
  config: RankingConfig
): Standing {
  const rung = state.displayedRung;
  const tier = Math.floor(rung / 3);
  const division = (rung % 3) + 1;
  let lp: number;
  if (state.promoPending) lp = 100;
  else if (state.shieldActive) lp = 0;
  else {
    const within = ((state.rating - (config.ladderFloor + rung * config.bandWidth)) / config.bandWidth) * 100;
    lp = Math.round(Math.min(100, Math.max(0, within)));
  }
  return {
    userId,
    rating: state.rating,
    tier,
    division,
    lp,
    promoPending: state.promoPending,
    shieldActive: state.shieldActive,
    championCount,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/ladder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ranking/ladder.ts lib/ranking/ladder.test.ts
git commit -m "Add ladder mapping and promo/shield state machine"
```

---

### Task 4: Weekly helpers (`weekly.ts`)

**Files:**
- Create: `lib/ranking/weekly.ts`
- Test: `lib/ranking/weekly.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { weekStartOf, weekEndOf, weeklyTotals } from './weekly';

describe('weekStartOf / weekEndOf', () => {
  it('returns the Monday and Sunday bounding a date (Mon-Sun week)', () => {
    // 2026-06-13 is a Saturday
    expect(weekStartOf('2026-06-13')).toBe('2026-06-08'); // Monday
    expect(weekEndOf('2026-06-08')).toBe('2026-06-14');   // Sunday
  });
  it('treats Monday as its own week start and Sunday as the prior Monday', () => {
    expect(weekStartOf('2026-06-08')).toBe('2026-06-08');
    expect(weekStartOf('2026-06-14')).toBe('2026-06-08'); // Sunday -> Monday of same week
  });
});

describe('weeklyTotals', () => {
  it('sums each user\'s scores across the week', () => {
    const totals = weeklyTotals([
      { userId: 'a', finalScore: 900, playDate: '2026-06-08' },
      { userId: 'a', finalScore: 800, playDate: '2026-06-10' },
      { userId: 'b', finalScore: 700, playDate: '2026-06-09' },
    ]);
    expect(totals).toEqual([
      { userId: 'a', finalScore: 1700 },
      { userId: 'b', finalScore: 700 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/weekly.test.ts`
Expected: FAIL ("Failed to resolve import './weekly'").

- [ ] **Step 3: Implement `lib/ranking/weekly.ts`**

```ts
import type { DayScore } from './types';

// Treat ISO dates as UTC-noon to avoid any TZ/DST drift in pure date math.
function parse(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday (ISO YYYY-MM-DD) of the Mon-Sun week containing `dateISO`. */
export function weekStartOf(dateISO: string): string {
  const d = parse(dateISO);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const deltaToMonday = (dow + 6) % 7; // Mon->0, Sun->6
  d.setUTCDate(d.getUTCDate() - deltaToMonday);
  return toISO(d);
}

/** The Sunday (ISO) ending the week that starts on `weekStartISO` (a Monday). */
export function weekEndOf(weekStartISO: string): string {
  const d = parse(weekStartISO);
  d.setUTCDate(d.getUTCDate() + 6);
  return toISO(d);
}

interface DatedScore extends DayScore {
  playDate: string;
}

/** Sum each user's scores in the given (already week-filtered) rows. */
export function weeklyTotals(rows: DatedScore[]): DayScore[] {
  const byUser = new Map<string, number>();
  for (const r of rows) byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + r.finalScore);
  return [...byUser.entries()].map(([userId, finalScore]) => ({ userId, finalScore }));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/weekly.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ranking/weekly.ts lib/ranking/weekly.test.ts
git commit -m "Add weekly window + totals helpers"
```

---

### Task 5: The replay (`replay.ts`)

**Files:**
- Create: `lib/ranking/replay.ts`
- Test: `lib/ranking/replay.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { replay, type DatedScore } from './replay';
import { DEFAULT_CONFIG } from './config';

const userIds = ['a', 'b', 'c'];

function makeScores(): DatedScore[] {
  // Two days in the same Mon-Sun week (2026-06-08 Mon .. 2026-06-14 Sun).
  return [
    { userId: 'a', finalScore: 900, playDate: '2026-06-08' },
    { userId: 'b', finalScore: 800, playDate: '2026-06-08' },
    { userId: 'c', finalScore: 700, playDate: '2026-06-08' },
    { userId: 'a', finalScore: 950, playDate: '2026-06-09' },
    { userId: 'b', finalScore: 850, playDate: '2026-06-09' },
    { userId: 'c', finalScore: 600, playDate: '2026-06-09' },
  ];
}

describe('replay', () => {
  it('is deterministic and ranks the consistent winner highest', () => {
    const finalized = ['2026-06-08', '2026-06-09'];
    const r1 = replay(userIds, makeScores(), finalized, DEFAULT_CONFIG);
    const r2 = replay(userIds, makeScores(), finalized, DEFAULT_CONFIG);
    expect(r1.standings).toEqual(r2.standings); // deterministic
    const byUser = Object.fromEntries(r1.standings.map((s) => [s.userId, s.rating]));
    expect(byUser['a']).toBeGreaterThan(byUser['b']);
    expect(byUser['b']).toBeGreaterThan(byUser['c']);
  });

  it('emits a daily event per submitter per day', () => {
    const { events } = replay(userIds, makeScores(), ['2026-06-08', '2026-06-09'], DEFAULT_CONFIG);
    const daily = events.filter((e) => e.kind === 'daily');
    expect(daily).toHaveLength(6);
  });

  it('crowns the weekly champion once the week has fully closed', () => {
    // Include the Sunday (2026-06-14) so the Mon-Sun week is complete.
    const scores: DatedScore[] = [
      ...makeScores(),
      { userId: 'a', finalScore: 500, playDate: '2026-06-14' },
      { userId: 'b', finalScore: 999, playDate: '2026-06-14' },
    ];
    const finalized = ['2026-06-08', '2026-06-09', '2026-06-14'];
    const { champions, events } = replay(userIds, scores, finalized, DEFAULT_CONFIG);
    // Weekly totals: a=2350, b=2649, c=1300 -> champion is b.
    expect(champions).toHaveLength(1);
    expect(champions[0].weekStart).toBe('2026-06-08');
    expect(champions[0].championUserId).toBe('b');
    expect(champions[0].totalScore).toBe(2649);
    expect(events.some((e) => e.kind === 'weekly')).toBe(true);
  });

  it('does not crown a champion for a week still in progress', () => {
    // Only Mon/Tue finalized; the week's Sunday hasn't occurred.
    const { champions } = replay(userIds, makeScores(), ['2026-06-08', '2026-06-09'], DEFAULT_CONFIG);
    expect(champions).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/replay.test.ts`
Expected: FAIL ("Failed to resolve import './replay'").

- [ ] **Step 3: Implement `lib/ranking/replay.ts`**

```ts
import type { LadderState, RankingConfig, RatingEvent, Standing, WeeklyChampion } from './types';
import { dayDeltas } from './scoring';
import { applyEvent, deriveStanding, initialState, rungForRating } from './ladder';
import { weekStartOf, weekEndOf, weeklyTotals } from './weekly';
import { rankScores } from './scoring';

export interface DatedScore {
  userId: string;
  finalScore: number;
  playDate: string;
}

export interface ReplayResult {
  standings: Standing[];
  events: RatingEvent[];
  champions: WeeklyChampion[];
}

/**
 * Deterministic replay over finalized days (and the weeks they complete), in chronological
 * order. Daily events apply first; a week's weekly event applies right after its last day,
 * before the next week begins. A week is only scored once fully in the past.
 */
export function replay(
  userIds: string[],
  scores: DatedScore[],
  finalizedDates: string[],
  config: RankingConfig
): ReplayResult {
  const states = new Map<string, LadderState>(userIds.map((id) => [id, initialState(config)]));
  const championCount = new Map<string, number>(userIds.map((id) => [id, 0]));
  const events: RatingEvent[] = [];
  const champions: WeeklyChampion[] = [];

  const ratingMap = () => new Map([...states].map(([id, s]) => [id, s.rating]));

  const scoresInRange = (start: string, end: string) =>
    scores.filter((s) => s.playDate >= start && s.playDate <= end);

  const processDaily = (date: string) => {
    const day = scores.filter((s) => s.playDate === date).map((s) => ({ userId: s.userId, finalScore: s.finalScore }));
    const deltas = dayDeltas(day, ratingMap(), config.dailyWeight, config);
    for (const d of deltas) {
      const before = states.get(d.userId)!;
      const after = applyEvent(before, d.delta, d.place, d.fieldSize, config);
      states.set(d.userId, after);
      events.push({
        userId: d.userId, kind: 'daily', eventDate: date, delta: d.delta, rating: after.rating,
        rung: rungForRating(after.rating, config),
        lp: deriveStanding(d.userId, after, 0, config).lp,
        promoPending: after.promoPending, shieldActive: after.shieldActive,
      });
    }
  };

  const processWeekly = (weekStart: string, lastDate: string) => {
    if (weekEndOf(weekStart) > lastDate) return; // week not fully in the past
    const rows = scoresInRange(weekStart, weekEndOf(weekStart));
    const totals = weeklyTotals(rows);
    if (totals.length < 2) return;
    const deltas = dayDeltas(totals, ratingMap(), config.weeklyWeight, config);
    for (const d of deltas) {
      const before = states.get(d.userId)!;
      const after = applyEvent(before, d.delta, d.place, d.fieldSize, config, false); // weekly never promotes
      states.set(d.userId, after);
      events.push({
        userId: d.userId, kind: 'weekly', eventDate: weekStart, delta: d.delta, rating: after.rating,
        rung: rungForRating(after.rating, config),
        lp: deriveStanding(d.userId, after, 0, config).lp,
        promoPending: after.promoPending, shieldActive: after.shieldActive,
      });
    }
    const places = rankScores(totals);
    const champ = totals.find((t) => places.get(t.userId) === 1)!;
    champions.push({ weekStart, championUserId: champ.userId, totalScore: champ.finalScore });
    championCount.set(champ.userId, (championCount.get(champ.userId) ?? 0) + 1);
  };

  const dates = [...finalizedDates].sort();
  const lastDate = dates[dates.length - 1];
  let currentWeek: string | null = null;

  for (const date of dates) {
    const wk = weekStartOf(date);
    if (currentWeek !== null && wk !== currentWeek) {
      processWeekly(currentWeek, lastDate); // previous week completed
    }
    currentWeek = wk;
    processDaily(date);
  }
  if (currentWeek !== null) processWeekly(currentWeek, lastDate); // final week if fully past

  const standings = userIds.map((id) =>
    deriveStanding(id, states.get(id)!, championCount.get(id) ?? 0, config)
  );
  return { standings, events, champions };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/replay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ranking/replay.ts lib/ranking/replay.test.ts
git commit -m "Add deterministic ranking replay (daily + weekly + champions)"
```

---

### Task 6: Persistence (`persistence.ts`)

**Files:**
- Create: `lib/ranking/persistence.ts`

- [ ] **Step 1: Implement `lib/ranking/persistence.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RankingConfig, Standing } from './types';
import { DEFAULT_CONFIG } from './config';
import { replay, type DatedScore } from './replay';

/** Loads the single config row; falls back to DEFAULT_CONFIG on any miss. */
export async function loadConfig(supabase: SupabaseClient): Promise<RankingConfig> {
  const { data } = await supabase.from('ranking_config').select('*').eq('id', 1).maybeSingle();
  if (!data) return DEFAULT_CONFIG;
  return {
    curveScale: Number(data.curve_scale),
    kFactor: Number(data.k_factor),
    dScale: Number(data.d_scale),
    dailyWeight: Number(data.daily_weight),
    weeklyWeight: Number(data.weekly_weight),
    eventMultiplier: Number(data.event_multiplier),
    bandWidth: Number(data.band_width),
    ladderFloor: Number(data.ladder_floor),
    startRating: Number(data.start_rating),
    promoPlace: Number(data.promo_place),
    shieldDays: Number(data.shield_days),
  };
}

/** Reads current standings (highest rating first). */
export async function fetchStandings(supabase: SupabaseClient): Promise<Standing[]> {
  const { data } = await supabase
    .from('ranking_standings')
    .select('user_id, rating, tier, division, lp, promo_pending, shield_active, champion_count')
    .order('rating', { ascending: false });
  return (data ?? []).map((r) => ({
    userId: r.user_id as string,
    rating: Number(r.rating),
    tier: r.tier as number,
    division: r.division as number,
    lp: r.lp as number,
    promoPending: r.promo_pending as boolean,
    shieldActive: r.shield_active as boolean,
    championCount: r.champion_count as number,
  }));
}

/**
 * Full recompute: replay all history and overwrite standings, rating_events, and
 * weekly_champions. Idempotent. MUST use the service-role client.
 */
export async function recomputeRanking(service: SupabaseClient): Promise<void> {
  const config = await loadConfig(service);

  const [{ data: profiles }, { data: scoreRows }, { data: finalizedRows }] = await Promise.all([
    service.from('profiles').select('id'),
    service.from('scores').select('user_id, final_score, play_date'),
    service.from('daily_results').select('play_date'),
  ]);

  const userIds = (profiles ?? []).map((p) => p.id as string);
  const scores: DatedScore[] = (scoreRows ?? []).map((s) => ({
    userId: s.user_id as string,
    finalScore: s.final_score as number,
    playDate: s.play_date as string,
  }));
  const finalized = (finalizedRows ?? []).map((d) => d.play_date as string);

  const { standings, events, champions } = replay(userIds, scores, finalized, config);

  // Overwrite derived tables. Delete-all then insert (cheap at this scale).
  await service.from('rating_events').delete().neq('event_date', '1900-01-01');
  await service.from('weekly_champions').delete().neq('week_start', '1900-01-01');

  if (events.length) {
    await service.from('rating_events').insert(
      events.map((e) => ({
        user_id: e.userId, kind: e.kind, event_date: e.eventDate, delta: e.delta,
        rating: e.rating, rung: e.rung, lp: e.lp,
        promo_pending: e.promoPending, shield_active: e.shieldActive,
      }))
    );
  }
  if (champions.length) {
    await service.from('weekly_champions').insert(
      champions.map((c) => ({
        week_start: c.weekStart, champion_user_id: c.championUserId, total_score: c.totalScore,
      }))
    );
  }
  await service.from('ranking_standings').upsert(
    standings.map((s) => ({
      user_id: s.userId, rating: s.rating, tier: s.tier, division: s.division, lp: s.lp,
      promo_pending: s.promoPending, shield_active: s.shieldActive,
      champion_count: s.championCount, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'user_id' }
  );
}
```

- [ ] **Step 2: Build + commit**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success.

```bash
git add lib/ranking/persistence.ts
git commit -m "Add ranking persistence (recompute + read)"
```

---

### Task 7: Hook recompute into finalizeDay

**Files:**
- Modify: `lib/finalize.ts`

- [ ] **Step 1: Add the import**

At the top of `lib/finalize.ts`, with the other imports:
```ts
import { recomputeRanking } from './ranking/persistence';
```

- [ ] **Step 2: Trigger recompute after a successful finalize**

In `finalizeDay`, find the end where it sends the podium push:
```ts
  const podium = computePodium(dayScores);
  await notifyPodium(supabase, formatPodiumText(podium, nameByUserId));
  return true;
```
Replace with:
```ts
  const podium = computePodium(dayScores);
  await notifyPodium(supabase, formatPodiumText(podium, nameByUserId));

  // Recompute the ranking ladder from history (best-effort; never fail finalization).
  try {
    await recomputeRanking(supabase);
  } catch {
    // ignore — standings will catch up on the next finalize or manual recompute
  }
  return true;
```

- [ ] **Step 3: Build + test + commit**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run build`
Expected: all tests pass; build succeeds.

```bash
git add lib/finalize.ts
git commit -m "Recompute ranking ladder after each daily finalize"
```

---

### Task 8: Calibration script + run

**Files:**
- Create: `scripts/ranking/calibrate.mjs`

> **Controller gate:** migration `0008_ranking.sql` must be applied first.

- [ ] **Step 1: Compile the ranking modules for Node**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20.20.2 && \
mkdir -p scripts/ranking/_compiled && \
npx --no-install tsc lib/ranking/types.ts lib/ranking/config.ts lib/ranking/scoring.ts \
  lib/ranking/ladder.ts lib/ranking/weekly.ts lib/ranking/replay.ts \
  --outDir scripts/ranking/_compiled --module es2022 --target es2022 ; \
sed -i '' -E "s/from '(\.\/[a-zA-Z]+)'/from '\1.js'/g" scripts/ranking/_compiled/*.js
```
Expected: `scripts/ranking/_compiled/replay.js` exists (ambient `@types` errors are noise; emit succeeds). The `sed` pass appends `.js` to the emitted relative imports, which Node's ESM loader requires — without it the script fails with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Create `scripts/ranking/calibrate.mjs`**

```js
// One-off: replay the 47-day history with a candidate config and print the ladder, so we
// can tune curveScale / startRating / bandWidth until Conner = Diamond I and Jason = Iron I.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const { replay } = await import('./_compiled/replay.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}` };
const get = (q) => fetch(`${U}/rest/v1/${q}`, { headers: H }).then((r) => r.json());

const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];

// Candidate config — edit these and re-run until endpoints land.
const config = {
  curveScale: 25, kFactor: 10, dScale: 200, dailyWeight: 1, weeklyWeight: 3,
  eventMultiplier: 1, bandWidth: 100, ladderFloor: 0, startRating: 800,
  promoPlace: 3, shieldDays: 1,
};

const [profiles, scores, finalized] = await Promise.all([
  get('profiles?select=id,display_name'),
  get('scores?select=user_id,final_score,play_date&limit=2000'),
  get('daily_results?select=play_date&limit=2000'),
]);
const nameById = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
const { standings, events, champions } = replay(
  profiles.map((p) => p.id),
  scores.map((s) => ({ userId: s.user_id, finalScore: s.final_score, playDate: s.play_date })),
  finalized.map((d) => d.play_date),
  config
);

console.log('config:', JSON.stringify(config));
for (const s of standings) {
  console.log(
    `${(nameById[s.userId] ?? s.userId).padEnd(18)} ${TIERS[s.tier]} ${'I'.repeat(s.division)}  ` +
    `LP ${String(s.lp).padStart(3)}  (R ${Math.round(s.rating)})  champ ${s.championCount}`
  );
}

// Pass --write to persist this ladder to the DB (uses this file's `config`; keep it in sync
// with the ranking_config row). Mirrors lib/ranking/persistence.recomputeRanking.
if (process.argv.includes('--write')) {
  const json = { ...H, 'Content-Type': 'application/json' };
  const del = (path, filter) => fetch(`${U}/rest/v1/${path}?${filter}`, { method: 'DELETE', headers: H });
  const post = (path, body, prefer) =>
    fetch(`${U}/rest/v1/${path}`, { method: 'POST', headers: { ...json, Prefer: prefer }, body: JSON.stringify(body) });
  await del('rating_events', 'event_date=neq.1900-01-01');
  await del('weekly_champions', 'week_start=neq.1900-01-01');
  if (events.length) await post('rating_events',
    events.map((e) => ({ user_id: e.userId, kind: e.kind, event_date: e.eventDate, delta: e.delta,
      rating: e.rating, rung: e.rung, lp: e.lp, promo_pending: e.promoPending, shield_active: e.shieldActive })),
    'return=minimal');
  if (champions.length) await post('weekly_champions',
    champions.map((c) => ({ week_start: c.weekStart, champion_user_id: c.championUserId, total_score: c.totalScore })),
    'return=minimal');
  await post('ranking_standings?on_conflict=user_id',
    standings.map((s) => ({ user_id: s.userId, rating: s.rating, tier: s.tier, division: s.division, lp: s.lp,
      promo_pending: s.promoPending, shield_active: s.shieldActive, champion_count: s.championCount,
      updated_at: new Date().toISOString() })),
    'resolution=merge-duplicates,return=minimal');
  console.log('\nwrote standings/events/champions to DB');
}
```

- [ ] **Step 3: Run and tune**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && node scripts/ranking/calibrate.mjs`
Expected: a printed ladder. Edit the `config` object and re-run until **Conner Craig = Diamond I** and **Jason Ratterman = Iron I**, with the others spread between.

- [ ] **Step 4: Write the tuned config to the DB**

Once endpoints land, apply the chosen numbers to the live config row (Supabase SQL editor), e.g.:
```sql
update ranking_config set
  curve_scale = <v>, k_factor = <v>, d_scale = <v>, daily_weight = <v>, weekly_weight = <v>,
  band_width = <v>, ladder_floor = <v>, start_rating = <v>
where id = 1;
```

- [ ] **Step 5: Gitignore compiled output; commit the script**

Add to `.gitignore`:
```
scripts/ranking/_compiled/
```
Then:
```bash
git add scripts/ranking/calibrate.mjs .gitignore
git commit -m "Add ranking calibration script"
```

---

### Task 9: Seed standings + full verification

**Files:** none (operational)

- [ ] **Step 1: Populate the live ladder once**

Seed all four tables from the full history with the tuned config:
```bash
source ~/.nvm/nvm.sh && nvm use 20.20.2 && node scripts/ranking/calibrate.mjs --write
```
Expected: prints the ladder, then `wrote standings/events/champions to DB`. (Going forward, the next `finalizeDay` recomputes automatically — this seeds it now so standings exist immediately.)

- [ ] **Step 2: Verify the live ladder reads back**

Run:
```bash
source ~/.nvm/nvm.sh && nvm use 20.20.2 && node scripts/ranking/calibrate.mjs
```
Expected: ladder prints with Conner at Diamond I and Jason at Iron I (matching the tuned config).

- [ ] **Step 3: Full suite + lint + build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run lint && npm run build`
Expected: all tests pass; lint clean; build succeeds.

- [ ] **Step 4: Confirm a clean tree**

Run: `git status`
Expected: clean (compiled output gitignored).

---

## Notes for the implementer

- **Pure first (Tasks 1–5).** No DB needed; everything is unit-tested. Get these green before touching persistence.
- **Determinism is the contract.** `replay` must give identical output for identical input — the idempotent-recompute test guards this.
- **Best-effort recompute.** A recompute failure must never break `finalizeDay` (mirrors the existing `notifyPodium` best-effort step).
- **Reuse, don't fork.** `rankScores` is the engine's general ranking; leave `lib/medals.ts` untouched.
- **Calibration is data, not code.** Tune via `ranking_config`; changing it + recompute re-derives the whole ladder.
