# Leaderboard UX Polish v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give today's #1 a larger "hero" podium card with a responsive layout (mobile
stacked, desktop wide row), turn the rank-4+ list into a table-like layout on wider
screens, make the page header responsive (stacked on mobile, split row on desktop), and
wrap `/setup` and `/login` in the app's dark card visual language.

**Architecture:** Pure presentation-layer changes to three existing components/pages.
`PodiumCard` gains internal "hero" styling for `rank === 1` (no prop changes).itemize
`LeaderboardTable` gets a `PODIUM_LAYOUTS` lookup (keyed by podium length: 1, 2, or 3)
that drives both the grid container's columns and each card's column span, so rank 1 is
always wider and there are no orphaned grid cells regardless of how many people played.
The rank-4+ `<ol>` switches from `flex` (mobile) to `grid` (`sm:` and up) for column
alignment. `app/page.tsx`'s header becomes a column on mobile and a row on `sm:` and up,
duplicating only the cheap `Setup` `<Link>` (not the stateful `AddScoreDialog`) between
breakpoints. `/setup` and `/login` get a small wordmark + `rounded-xl border bg-card`
card wrapper, vertically centered via the existing `body.flex.flex-col` + `main.flex-1`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind CSS v4 + shadcn/ui, Vitest.

**Project root:** `/Users/NickConnor/Development/bff-leaderboard`. All paths below are
relative to this root. If `node -v` reports < 20.9, run
`source ~/.nvm/nvm.sh && nvm use 20.20.2` before any `npm` command.

**Spec:** `docs/superpowers/specs/2026-06-11-leaderboard-ux-polish-design.md`

**Already done (no task needed):** The font-fallback fix (`--font-sans:
var(--font-geist-sans)` in `app/globals.css`) was applied and committed in `5a084de`
during brainstorming — verify it's present, but nothing to do for it here.

---

### Task 1: `PodiumCard` — hero styling for rank 1

**Files:**
- Modify: `components/leaderboard/podium-card.tsx`

- [ ] **Step 1: Replace `components/leaderboard/podium-card.tsx`**

```tsx
import { cn } from '@/lib/utils';

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
}: {
  rank: 1 | 2 | 3;
  displayName: string;
  totalScore: number;
  comment: string | null;
  isManual: boolean;
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

Changes from the current file: added `isHero = rank === 1`, added `h-full` to the root
(so cards fill their grid cell height when sitting next to a taller hero card), and made
padding/name/score/comment sizes conditionally larger for the hero. The component's
props and the medal/Cheating-badge logic are unchanged.

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS — `PodiumCard`'s props are unchanged, so `LeaderboardTable` (which calls
it) still type-checks.

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/podium-card.tsx
git commit -m "Add hero styling for rank-1 PodiumCard"
```

---

### Task 2: `LeaderboardTable` — hero podium grid + table-like rest of field

**Files:**
- Modify: `components/leaderboard/leaderboard-table.tsx`

- [ ] **Step 1: Replace `components/leaderboard/leaderboard-table.tsx`**

```tsx
import type { LeaderboardEntry } from '@/lib/leaderboard';
import { PodiumCard } from './podium-card';

const PODIUM_LAYOUTS: Record<number, { container: string; cardClasses: string[] }> = {
  1: {
    container: 'grid-cols-1',
    cardClasses: ['col-span-1'],
  },
  2: {
    container: 'grid-cols-2 sm:grid-cols-[1.3fr_1fr]',
    cardClasses: ['col-span-2 sm:col-span-1', 'col-span-2 sm:col-span-1'],
  },
  3: {
    container: 'grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr]',
    cardClasses: ['col-span-2 sm:col-span-1', 'col-span-1', 'col-span-1'],
  },
};

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
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
            />
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="divide-y rounded-lg border" start={4}>
          {rest.map((entry, index) => (
            <li
              key={entry.userId}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:grid sm:grid-cols-[2.5rem_1fr_2fr_auto] sm:items-center sm:gap-4"
            >
              <span className="hidden text-sm text-muted-foreground sm:block">#{index + 4}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="sm:hidden">#{index + 4}</span>
                <span>{entry.displayName}</span>
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
              <span className="text-right font-semibold">{entry.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

What changed and why:
- `PODIUM_LAYOUTS` replaces `PODIUM_GRID_COLS`. For each possible podium length (1, 2,
  or 3 — there are only ever as many podium entries as people who played), it defines
  both the grid container's column tracks and a per-card `col-span` so rank 1 is always
  wider (or, for a single entry, the only card spans the full width) and there's never
  an empty/orphaned cell:
  - **1 entry:** single column, full width.
  - **2 entries:** mobile stacks them full-width (`grid-cols-2` + both `col-span-2`);
    `sm:` puts them side by side with the hero wider (`sm:grid-cols-[1.3fr_1fr]` +
    `sm:col-span-1` each).
  - **3 entries:** mobile shows the hero full-width on its own row
    (`grid-cols-2` + `col-span-2`) with #2/#3 sharing the row below
    (`col-span-1` each); `sm:` puts all three in one row with the hero wider
    (`sm:grid-cols-[1.3fr_1fr_1fr]`).
- Each podium card is now wrapped in a `<div className={layout.cardClasses[index]}>` so
  the span classes apply to the grid item (not `PodiumCard`'s own root), keeping
  `PodiumCard`'s props/markup independent of its grid placement.
- The rank 4+ `<li>` is `flex flex-wrap` (today's mobile layout: rank+name+badge inline,
  comment wraps below, score on the right) and becomes `sm:grid
  sm:grid-cols-[2.5rem_1fr_2fr_auto]` on wider screens — a dedicated rank column, a
  name/badge column, a comment column (showing `—` when there's no comment), and a score
  column, all aligned like a table. The rank number and comment are each rendered twice
  (once for the mobile inline position via `sm:hidden`, once for the desktop column via
  `hidden sm:block`/`sm:hidden`) so no JS is needed to swap layouts.

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add components/leaderboard/leaderboard-table.tsx
git commit -m "Add hero podium grid layout and table-like rest-of-field list"
```

---

### Task 3: `app/page.tsx` — responsive header + wider desktop container

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { AddScoreDialog } from '@/components/leaderboard/add-score-dialog';
import { fetchLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import { getSubtitleTarget, fetchRandomNickname } from '@/lib/nicknames';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'all-time', label: 'All-Time' },
];

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const results = await Promise.allSettled(
    PERIODS.map((period) => fetchLeaderboard(supabase, period.value))
  );
  const entriesByPeriod = results.map((result) =>
    result.status === 'fulfilled' ? result.value : []
  );

  const subtitleTarget = getSubtitleTarget(entriesByPeriod);
  const subtitleName = subtitleTarget
    ? await fetchRandomNickname(supabase, subtitleTarget.userId, subtitleTarget.displayName)
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:max-w-4xl sm:p-6">
      <header className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">🏆 BFF Leaderboard</h1>
            <Link
              href="/setup"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' }),
                'sm:hidden'
              )}
            >
              Setup
            </Link>
          </div>
          <p className="text-sm text-muted-foreground italic sm:text-base">
            {subtitleName ? (
              <>
                Are you smarter than a{' '}
                <span className="font-semibold text-primary not-italic">{subtitleName}</span>?
              </>
            ) : (
              'Track your maptap.gg scores with the squad'
            )}
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 sm:justify-end">
          <Link
            href="/setup"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' }),
              'hidden sm:inline-flex'
            )}
          >
            Setup
          </Link>
          <AddScoreDialog />
        </div>
      </header>

      <Tabs defaultValue="daily">
        <div className="flex justify-center">
          <TabsList>
            {PERIODS.map((period) => (
              <TabsTrigger key={period.value} value={period.value}>
                {period.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {PERIODS.map((period, index) => (
          <TabsContent key={period.value} value={period.value}>
            <LeaderboardTable entries={entriesByPeriod[index]} />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
```

What changed and why:
- `<main>` gains `sm:max-w-4xl` (up from a fixed `max-w-2xl`) so the wider desktop hero
  podium row + rank-4+ table have breathing room instead of feeling squeezed into a
  mobile-width column.
- `<header>` is now `flex flex-col` (mobile: title+Setup row, subtitle below, then the
  action row) and becomes `sm:flex-row sm:items-center sm:justify-between` — title block
  on the left, action buttons on the right.
- The `Setup` link is rendered twice with opposite visibility (`sm:hidden` next to the
  title for mobile, `hidden sm:inline-flex` in the right-hand action group for desktop)
  — cheap to duplicate since it's a plain styled `<Link>`, and avoids any layout/JS
  trickery to move a single element between two different flex containers at different
  breakpoints.
- `AddScoreDialog` is rendered exactly once, inside the second header `<div>`. On mobile
  that `<div>` is the second row of the column layout (so it appears centered below the
  title/subtitle, same visual position as before); on `sm:` it's the right-aligned
  action group next to Setup.
- Added `import { cn } from '@/lib/utils'` for the conditional Setup-link classes.
- Tabs/LeaderboardTable section is unchanged.

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "Make leaderboard header responsive and widen desktop container"
```

---

### Task 4: `/setup` — wordmark + card wrapper

**Files:**
- Modify: `app/setup/page.tsx`

- [ ] **Step 1: Replace `app/setup/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function SetupPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/profile/token', { method: 'POST' });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? 'Something went wrong');
      } else {
        setToken(json.token ?? null);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm font-semibold text-muted-foreground">🏆 BFF Leaderboard</p>
      <div className="w-full space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-bold">Setup</h1>
        <p>
          Generate your personal token, then paste it into the BFF Leaderboard Shortcut so your
          scores get captured automatically every morning.
        </p>
        <Button onClick={handleGenerate} disabled={loading}>
          {token ? 'Regenerate token' : 'Generate my token'}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {token && (
          <div className="rounded-lg border bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              Copy this now — you won&apos;t be able to see it again. Regenerating replaces it,
              so the old one will stop working.
            </p>
            <code className="block break-all font-mono text-sm">{token}</code>
          </div>
        )}
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Install the{' '}
            <a
              className="underline"
              href="https://www.icloud.com/shortcuts/ccf508f834ac456989ecf7b38f33b35d"
              target="_blank"
              rel="noreferrer"
            >
              BFF Leaderboard Shortcut
            </a>
            .
          </li>
          <li>When prompted, paste your token above into the Shortcut&apos;s settings.</li>
          <li>Tomorrow morning, after you finish maptap.gg, tap Share → BFF Leaderboard.</li>
        </ol>
      </div>
    </main>
  );
}
```

What changed and why:
- `<main>` is now `flex w-full max-w-md flex-1 flex-col items-center justify-center
  gap-4 p-6` — `flex-1` lets it fill the height provided by `app/layout.tsx`'s
  `body.min-h-full.flex.flex-col`, and `items-center justify-center` centers the card
  vertically and horizontally.
- A small `🏆 BFF Leaderboard` wordmark (`text-sm font-semibold text-muted-foreground`)
  sits above the card for continuity with `/`.
- All existing content (heading, copy, button, token display, instructions) moves
  unchanged into a `w-full space-y-4 rounded-xl border bg-card p-6` card. No behavior,
  copy, or component changes.

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/setup/page.tsx
git commit -m "Wrap /setup in a centered card with wordmark"
```

---

### Task 5: `/login` — wordmark + card wrapper

**Files:**
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Replace `app/login/page.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm font-semibold text-muted-foreground">🏆 BFF Leaderboard</p>
        <div className="w-full rounded-xl border bg-card p-6">
          <p>Check your email for a sign-in link.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm font-semibold text-muted-foreground">🏆 BFF Leaderboard</p>
      <div className="w-full space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Button type="submit" className="w-full">
            Send magic link
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  );
}
```

What changed and why:
- Same `flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6`
  centering pattern as `/setup`, with the same wordmark.
- Both the "sign in" form and the "check your email" success state move into a
  `rounded-xl border bg-card` card. No behavior, validation, or copy changes.

- [ ] **Step 2: Run the full test suite, lint, and build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/login/page.tsx
git commit -m "Wrap /login in a centered card with wordmark"
```
