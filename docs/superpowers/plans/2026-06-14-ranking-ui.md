# Ranking UI (Badges + Match Labels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the ranking engine in the UI — a tier-colored, fill-by-division `RankBadge` wherever a player's name appears, plus Promotion/Demotion Match labels on the Today tab.

**Architecture:** A pure `lib/ranking/tiers.ts` holds tier names/accents/label helpers. Two presentational components (`RankBadge`, `MatchLabel`) render from it via inline styles (the approved `color-mix` recipe). `app/page.tsx` fetches standings once (`fetchStandings`, already built) into a `Map<userId, Standing>` and threads it to the leaderboard + Hall of Fame. `HallOfFameRow` gains a `userId` for badge lookup.

**Tech Stack:** Next.js (App Router, RSC — these components are server components, no `'use client'`), TypeScript, Tailwind (existing), Vitest. Spec: `docs/superpowers/specs/2026-06-14-ranking-ui-design.md`.

> **Environment:** default `node` is v18; repo needs 20.20.2. Prefix every npm command with `source ~/.nvm/nvm.sh && nvm use 20.20.2 &&`. No DB or migration work — the ranking tables already exist and are seeded.

---

## File Structure

- **Create** `lib/ranking/tiers.ts` (+ `tiers.test.ts`) — pure tier names, accents, `rankLabel`, `fillLevel`.
- **Create** `components/leaderboard/rank-badge.tsx` — presentational badge.
- **Create** `components/leaderboard/match-label.tsx` — presentational promo/demo label.
- **Modify** `lib/hall-of-fame.ts` — add `userId` to `HallOfFameRow`.
- **Modify** `app/page.tsx` — fetch standings, pass down.
- **Modify** `components/leaderboard/leaderboard-table.tsx` — badges + match labels.
- **Modify** `components/leaderboard/podium-card.tsx` — badge + match label.
- **Modify** `components/leaderboard/hall-of-fame.tsx` — badge.

---

### Task 1: Pure tier helpers (`tiers.ts`)

**Files:** Create `lib/ranking/tiers.ts`, `lib/ranking/tiers.test.ts`

- [ ] **Step 1: Write the failing test** — `lib/ranking/tiers.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { TIER_NAMES, TIER_ACCENT, rankLabel, fillLevel } from './tiers';

describe('tiers', () => {
  it('has six tier names with a hex accent for each', () => {
    expect(TIER_NAMES).toHaveLength(6);
    for (let t = 0; t < 6; t++) expect(TIER_ACCENT[t]).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('formats rank labels with roman division numerals', () => {
    expect(rankLabel(5, 1)).toBe('Diamond I');
    expect(rankLabel(0, 3)).toBe('Iron III');
    expect(rankLabel(2, 2)).toBe('Silver II');
  });
  it('clamps division to a 1..3 fill level', () => {
    expect(fillLevel(1)).toBe(1);
    expect(fillLevel(2)).toBe(2);
    expect(fillLevel(3)).toBe(3);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/tiers.test.ts`
Expected: FAIL ("Failed to resolve import './tiers'").

- [ ] **Step 3: Implement `lib/ranking/tiers.ts`**

```ts
export const TIER_NAMES = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'] as const;

/** Accent hex per tier index (0=Iron .. 5=Diamond). */
export const TIER_ACCENT: Record<number, string> = {
  0: '#6f7fa3', // Iron — dark cobalt-gray
  1: '#d9a36b', // Bronze
  2: '#cdd6df', // Silver
  3: '#ecc658', // Gold
  4: '#5fe0d4', // Platinum
  5: '#7cc2ff', // Diamond
};

const ROMAN = ['I', 'II', 'III'];

/** e.g. rankLabel(5, 1) => "Diamond I". `division` is 1..3. */
export function rankLabel(tier: number, division: number): string {
  const name = TIER_NAMES[tier] ?? 'Unranked';
  return `${name} ${ROMAN[division - 1] ?? ''}`.trim();
}

/** Division 1..3 -> fill level 1..3 (1=outline, 2=semi, 3=solid), clamped. */
export function fillLevel(division: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, division)) as 1 | 2 | 3;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npx vitest run lib/ranking/tiers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ranking/tiers.ts lib/ranking/tiers.test.ts
git commit -m "Add pure tier helpers for rank badges"
```

---

### Task 2: `RankBadge` component

**Files:** Create `components/leaderboard/rank-badge.tsx`

- [ ] **Step 1: Implement `components/leaderboard/rank-badge.tsx`**

```tsx
import type { CSSProperties } from 'react';
import { TIER_ACCENT, rankLabel, fillLevel } from '@/lib/ranking/tiers';

export interface RankBadgeProps {
  tier: number;
  division: number;
  lp?: number;
  showLp?: boolean;
  size?: 'sm' | 'md';
}

function badgeStyle(tier: number, division: number): CSSProperties {
  const c = TIER_ACCENT[tier] ?? TIER_ACCENT[0];
  const fill = fillLevel(division);
  const base: CSSProperties = { borderStyle: 'solid', borderWidth: 1 };

  // Diamond III: gradient + strong glow (the fanciest rung).
  if (tier === 5 && fill === 3) {
    return {
      ...base,
      background: 'linear-gradient(180deg,#2f78d6,#1c4f9c)',
      color: '#eaf6ff',
      borderColor: '#7cc2ff',
      boxShadow: '0 0 14px rgba(124,194,255,.7)',
    };
  }

  let style: CSSProperties;
  if (fill === 1) {
    style = { ...base, background: 'transparent', borderColor: `color-mix(in srgb, ${c} 50%, transparent)`, color: c };
  } else if (fill === 2) {
    style = { ...base, background: `color-mix(in srgb, ${c} 18%, #0d1117)`, borderColor: `color-mix(in srgb, ${c} 65%, transparent)`, color: c };
  } else {
    style = { ...base, background: `color-mix(in srgb, ${c} 34%, #0d1117)`, borderColor: c, color: `color-mix(in srgb, ${c} 88%, white)` };
  }
  if (tier === 4 && fill === 3) style.boxShadow = '0 0 8px rgba(95,224,212,.45)'; // Platinum III
  if (tier === 5 && fill === 2) style.boxShadow = '0 0 7px rgba(124,194,255,.35)'; // Diamond II
  return style;
}

export function RankBadge({ tier, division, lp, showLp = false, size = 'md' }: RankBadgeProps) {
  const fontSize = size === 'sm' ? 11 : 12;
  return (
    <span
      style={{
        ...badgeStyle(tier, division),
        padding: size === 'sm' ? '4px 9px' : '6px 11px',
        fontSize,
        fontWeight: 600,
        lineHeight: 1,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
      }}
    >
      {rankLabel(tier, division)}
      {showLp && lp !== undefined && (
        <span style={{ opacity: 0.65, fontWeight: 500, fontSize: fontSize - 1 }}>{lp}</span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/rank-badge.tsx
git commit -m "Add RankBadge presentational component"
```

---

### Task 3: `MatchLabel` component

**Files:** Create `components/leaderboard/match-label.tsx`

- [ ] **Step 1: Implement `components/leaderboard/match-label.tsx`**

```tsx
import type { CSSProperties } from 'react';

const BASE: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 999,
  borderStyle: 'solid',
  borderWidth: 1,
  whiteSpace: 'nowrap',
};

export function MatchLabel({ promoPending, shieldActive }: { promoPending: boolean; shieldActive: boolean }) {
  if (promoPending) {
    return (
      <span style={{ ...BASE, color: '#7ff0b0', background: 'rgba(35,180,110,.15)', borderColor: 'rgba(60,210,140,.5)' }}>
        ⬆ Promotion Match
      </span>
    );
  }
  if (shieldActive) {
    return (
      <span style={{ ...BASE, color: '#ff9b9b', background: 'rgba(220,70,70,.15)', borderColor: 'rgba(240,90,90,.5)' }}>
        ⬇ Demotion Match
      </span>
    );
  }
  return null;
}
```

- [ ] **Step 2: Build + commit**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success.

```bash
git add components/leaderboard/match-label.tsx
git commit -m "Add MatchLabel promotion/demotion component"
```

---

### Task 4: Add `userId` to `HallOfFameRow`

**Files:** Modify `lib/hall-of-fame.ts`

> Note: there is no `lib/hall-of-fame.test.ts` (fetchHallOfFame is Supabase-integration, not unit-tested). Adding a field is additive; verified by build.

- [ ] **Step 1: Add `userId` to the interface**

In `lib/hall-of-fame.ts`, change:
```ts
export interface HallOfFameRow {
  playerName: string;
  gold: number;
  silver: number;
  bronze: number;
}
```
to:
```ts
export interface HallOfFameRow {
  userId: string;
  playerName: string;
  gold: number;
  silver: number;
  bronze: number;
}
```

- [ ] **Step 2: Populate it**

In the `for (const [userId, counts] of derived)` loop, change the `rows.push({...})` to include `userId`:
```ts
      rows.push({
        userId,
        playerName: profileNames.get(userId) ?? 'Unknown',
        gold: counts.gold,
        silver: counts.silver,
        bronze: counts.bronze,
      });
```

- [ ] **Step 3: Build + commit**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success (additive field; consumers unaffected).

```bash
git add lib/hall-of-fame.ts
git commit -m "Add userId to HallOfFameRow for badge lookup"
```

---

### Task 5: Fetch standings in the page and thread them down

**Files:** Modify `app/page.tsx`

- [ ] **Step 1: Add imports**

Add near the other `lib` imports in `app/page.tsx`:
```tsx
import { fetchStandings } from '@/lib/ranking/persistence';
import type { Standing } from '@/lib/ranking/types';
```

- [ ] **Step 2: Fetch + build the map**

After `const hallOfFame = await fetchHallOfFame(supabase);`, add:
```tsx
  const standingsList = await fetchStandings(supabase);
  const standings: Map<string, Standing> = new Map(standingsList.map((s) => [s.userId, s]));
```

- [ ] **Step 3: Pass to HallOfFame**

Change `<HallOfFame entries={hallOfFame} />` to:
```tsx
        <HallOfFame entries={hallOfFame} standings={standings} />
```

- [ ] **Step 4: Pass to LeaderboardTable (with the daily flag)**

Change:
```tsx
            <TabsContent key={period.value} value={period.value}>
              <LeaderboardTable entries={entriesByPeriod[index]} />
            </TabsContent>
```
to:
```tsx
            <TabsContent key={period.value} value={period.value}>
              <LeaderboardTable
                entries={entriesByPeriod[index]}
                standings={standings}
                isDaily={period.value === 'daily'}
              />
            </TabsContent>
```

- [ ] **Step 5: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: FAIL — `LeaderboardTable`/`HallOfFame` don't accept the new props yet. That's expected; Tasks 6–7 add them. (If you prefer a green build between tasks, do Tasks 6 and 7 before re-running.) Do not commit until the build is green after Task 7.

---

### Task 6: Badges + match labels in the leaderboard table & podium

**Files:** Modify `components/leaderboard/leaderboard-table.tsx`, `components/leaderboard/podium-card.tsx`

- [ ] **Step 1: Replace `components/leaderboard/podium-card.tsx`**

```tsx
import { cn } from '@/lib/utils';
import type { Standing } from '@/lib/ranking/types';
import { RankBadge } from './rank-badge';
import { MatchLabel } from './match-label';

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
  standing,
  isDaily,
}: {
  rank: 1 | 2 | 3;
  displayName: string;
  totalScore: number;
  comment: string | null;
  isManual: boolean;
  standing?: Standing;
  isDaily: boolean;
}) {
  const isHero = rank === 1;

  return (
    <div
      className={cn(
        'h-full rounded-xl border-2 text-center shadow-sm',
        isHero ? 'p-4 sm:p-6' : 'p-3 sm:p-4',
        PODIUM_STYLES[rank - 1]
      )}
    >
      <div className="text-xs font-semibold tracking-wide uppercase sm:text-sm">
        {MEDALS[rank - 1]} #{rank}
      </div>
      <div className={cn('mt-1 font-bold', isHero ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg')}>
        {displayName}
      </div>
      {standing && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
          <RankBadge tier={standing.tier} division={standing.division} lp={standing.lp} showLp />
          {isDaily && (
            <MatchLabel promoPending={standing.promoPending} shieldActive={standing.shieldActive} />
          )}
        </div>
      )}
      <div className={cn('mt-1 font-extrabold', isHero ? 'text-4xl sm:text-5xl' : 'text-xl sm:text-2xl')}>
        {totalScore}
      </div>
      {isManual && (
        <div className="mt-2 inline-block rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
          😤 Cheating
        </div>
      )}
      {comment && (
        <div className={cn('mt-2 italic opacity-80', isHero ? 'text-sm sm:text-base' : 'text-xs')}>
          &ldquo;{comment}&rdquo;
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `components/leaderboard/leaderboard-table.tsx`**

```tsx
import type { LeaderboardEntry } from '@/lib/leaderboard';
import type { Standing } from '@/lib/ranking/types';
import { PodiumCard } from './podium-card';
import { RankBadge } from './rank-badge';
import { MatchLabel } from './match-label';

const PODIUM_LAYOUTS: Record<number, { container: string; cardClasses: string[] }> = {
  1: { container: 'grid-cols-1', cardClasses: ['col-span-1'] },
  2: {
    container: 'grid-cols-2 sm:grid-cols-[1.3fr_1fr]',
    cardClasses: ['col-span-2 sm:col-span-1', 'col-span-2 sm:col-span-1'],
  },
  3: {
    container: 'grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr]',
    cardClasses: ['col-span-2 sm:col-span-1', 'col-span-1', 'col-span-1'],
  },
};

export function LeaderboardTable({
  entries,
  standings,
  isDaily,
}: {
  entries: LeaderboardEntry[];
  standings: Map<string, Standing>;
  isDaily: boolean;
}) {
  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground">No scores yet for this period.</p>;
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const layout = PODIUM_LAYOUTS[podium.length];

  return (
    <div className="space-y-6">
      <div className={`grid gap-2 sm:gap-3 ${layout.container}`}>
        {podium.map((entry, index) => (
          <div key={entry.userId} className={layout.cardClasses[index]}>
            <PodiumCard
              rank={(index + 1) as 1 | 2 | 3}
              displayName={entry.displayName}
              totalScore={entry.totalScore}
              comment={entry.comment}
              isManual={entry.isManual}
              standing={standings.get(entry.userId)}
              isDaily={isDaily}
            />
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="divide-y rounded-lg border" start={4}>
          {rest.map((entry, index) => {
            const standing = standings.get(entry.userId);
            return (
              <li
                key={entry.userId}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:grid sm:grid-cols-[2.5rem_1fr_2fr_auto] sm:items-center sm:gap-4"
              >
                <span className="hidden text-sm text-muted-foreground sm:block">#{index + 4}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="sm:hidden">#{index + 4}</span>
                  <span>{entry.displayName}</span>
                  {standing && (
                    <RankBadge tier={standing.tier} division={standing.division} size="sm" />
                  )}
                  {entry.isManual && (
                    <span className="rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
                      😤 Cheating
                    </span>
                  )}
                  {entry.comment && (
                    <span className="text-xs italic text-muted-foreground sm:hidden">
                      &ldquo;{entry.comment}&rdquo;
                    </span>
                  )}
                </span>
                <span className="hidden text-xs italic text-muted-foreground sm:block">
                  {entry.comment ? <>&ldquo;{entry.comment}&rdquo;</> : '—'}
                </span>
                <span className="flex items-center justify-end gap-2">
                  {isDaily && standing && (
                    <MatchLabel promoPending={standing.promoPending} shieldActive={standing.shieldActive} />
                  )}
                  <span className="font-semibold">{entry.totalScore}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: still FAIL only on `HallOfFame` props (fixed in Task 7). No errors in `leaderboard-table.tsx`/`podium-card.tsx`/`page.tsx`.

---

### Task 7: Badge in the Hall of Fame

**Files:** Modify `components/leaderboard/hall-of-fame.tsx`

- [ ] **Step 1: Replace `components/leaderboard/hall-of-fame.tsx`**

```tsx
import type { HallOfFameRow } from '@/lib/hall-of-fame';
import type { Standing } from '@/lib/ranking/types';
import { RankBadge } from './rank-badge';

export function HallOfFame({
  entries,
  standings,
}: {
  entries: HallOfFameRow[];
  standings: Map<string, Standing>;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold sm:text-xl">🏅 All-Time Medals</h2>
        <span className="text-xs text-muted-foreground sm:text-sm">Hall of Fame</span>
      </div>
      <ol className="mt-3 divide-y rounded-lg border">
        {entries.map((entry, index) => {
          const standing = standings.get(entry.userId);
          return (
            <li
              key={entry.playerName}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-2"
            >
              <span className="text-sm text-muted-foreground tabular-nums">#{index + 1}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{entry.playerName}</span>
                {standing && (
                  <RankBadge tier={standing.tier} division={standing.division} size="sm" />
                )}
              </span>
              <span className="flex items-center gap-3 font-semibold tabular-nums">
                <span title="Gold">🥇 {entry.gold}</span>
                <span title="Silver">🥈 {entry.silver}</span>
                <span title="Bronze">🥉 {entry.bronze}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Full build + lint + tests (everything green now)**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run lint && npm run build`
Expected: all tests pass; lint clean; build succeeds (page + components all type-check together).

- [ ] **Step 3: Commit Tasks 5–7 together**

```bash
git add app/page.tsx components/leaderboard/leaderboard-table.tsx components/leaderboard/podium-card.tsx components/leaderboard/hall-of-fame.tsx
git commit -m "Wire rank badges + match labels into leaderboard and Hall of Fame"
```

---

### Task 8: Visual verification

**Files:** none

- [ ] **Step 1: Run the app and check the badges**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run dev` and open the local URL (sign in if needed).
Verify against the approved mockup:
- Rank badges appear next to names on the podium, leaderboard rows (all tabs), and Hall of Fame.
- Colors match: Iron cobalt-gray, Bronze, Silver, Gold, Platinum teal, Diamond blue; fill ramps Div I outline → II semi → III solid; Platinum/Diamond glow at higher divisions.
- On the **Today** tab only, players with `promo_pending`/`shield_active` show `⬆ Promotion Match` / `⬇ Demotion Match` next to their score (none on weekly/monthly/all-time).

- [ ] **Step 2: Capture a screenshot** of the Today tab + Hall of Fame for the record, and confirm it matches the mockup. If anything is off, fix in the relevant component and re-run.

---

## Notes for the implementer

- These are **server components** — no `'use client'`, no hooks. Keep them presentational.
- `color-mix` in inline styles is intentional and supported by modern browsers (it's how the approved mockup rendered). Don't convert to Tailwind.
- A missing standing (no map entry) must render **no badge / no label** — never crash. The provided code already guards with `standing && ...`.
- Don't touch the engine (`lib/ranking/scoring|ladder|weekly|replay|persistence`) or the existing "Cheating" badge.
