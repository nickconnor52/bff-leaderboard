# Leaderboard UX Polish v2 Design

## Overview

A visual polish pass on top of the v1 UX overhaul (dark neutral-blue theme, metallic
podium, manual entry, etc.), focused on:

1. **Font fallback fix** — `app/globals.css` had a circular `--font-sans: var(--font-sans)`
   reference, so the whole site was rendering in the browser's default serif font instead
   of Geist Sans. (Already fixed as a one-line drive-by during brainstorming.)
2. **"Hero podium" layout for `/`** — give today's #1 a larger, featured treatment, with
   a responsive layout that works on both mobile (stacked) and desktop (wide, side-by-side)
   without feeling cramped on either.
3. **Table-like "rest of field" list** — ranks 4+ gain column alignment on wider screens.
4. **`/setup` and `/login` polish** — wrap these currently-bare forms in the same
   dark "card" visual language as the rest of the app, with a small wordmark for
   continuity.

A visual mockup (3 layout directions, then a mobile/desktop comparison of the chosen
"Hero Podium" direction) was reviewed and approved in this session.

`/admin/import` is explicitly out of scope for this pass — it's an internal tool and will
be revisited as part of a separate admin-panel project.

---

## 1. Font fallback fix

`app/globals.css`'s `@theme inline` block had:

```css
--font-sans: var(--font-sans);
```

This is a self-referential custom property (invalid), so `font-sans` resolved to nothing
and every page fell back to the browser default (serif) font, even though
`app/layout.tsx` correctly sets up `--font-geist-sans` via `next/font/google`.

Fixed to:

```css
--font-sans: var(--font-geist-sans);
```

**Status: already applied and committed separately** — implementer should verify it's
present in `app/globals.css` and not re-apply.

---

## 2. Main leaderboard page (`/`)

### 2.1 Header

Currently the header is a centered block (title + Setup pill on one line, subtitle below)
with the "+ Add my score" button in its own centered row beneath. This stays as the
**mobile** layout.

On `sm:` and up, the header becomes a two-column row:

- **Left:** title ("🏆 BFF Leaderboard") stacked above the subtitle, left-aligned.
- **Right:** "Setup" and "+ Add my score" buttons side-by-side, vertically centered
  with the title block.

Mobile keeps everything centered and stacked, with "+ Add my score" as a full-width pill
button below the header (as today).

### 2.2 Hero podium

`PodiumCard` (`components/leaderboard/podium-card.tsx`) gains a **hero variant for
rank 1**: larger padding, larger name/score text, and the comment (if present) shown more
prominently. Ranks 2-3 keep their current sizing — just visually smaller/secondary next to
the hero. All three still use the existing `podium-{gold,silver,bronze}` /
`podium-{gold,silver,bronze}-border` tokens and the medal emoji + Cheating badge from v1 —
no new color tokens needed.

`LeaderboardTable`'s podium grid changes from a uniform `grid-cols-{1,2,3}` to a layout
where rank 1 is visually larger:

- **Mobile:** rank 1 is full-width on its own row (hero). If present, ranks 2 and 3 sit
  side-by-side in a 2-column row below the hero.
- **Desktop (`sm:` and up):** all podium entries share a single row. Rank 1's column is
  wider than ranks 2/3 (e.g. roughly 1.3x), so the hero is visually bigger without the
  others feeling squeezed.

**Edge cases (podium can have 1, 2, or 3 entries depending on how many people played):**

- **1 entry:** the hero card spans the full width on both mobile and desktop (no
  second row / no empty grid cells).
- **2 entries:** rank 1 (hero) and rank 2 share the layout that would otherwise hold
  ranks 1-3 — on mobile, rank 2 takes the full second row (not half of a 2-column row with
  an empty cell); on desktop, the two share the row at hero/non-hero widths.
- **3 entries:** as described above (mobile: hero + 2-up row; desktop: 3-up row with
  wider hero).

The exact Tailwind grid classes (e.g. a lookup table similar to v1's
`PODIUM_GRID_COLS`, but keyed by podium length and covering both the container's
`grid-cols`/`grid-template-columns` and each card's column span) are an implementation
detail for the plan — the requirement is: no empty/orphaned grid cells for any podium
length, and rank 1 is always visually larger than ranks 2-3.

### 2.3 Rest of field (rank 4+)

The existing `<ol>`/`<li>` list stays the same component and markup. On mobile it keeps
its current compact row (rank + name + badges wrapping, comment wrapping below if needed,
score on the right). On `sm:` and up, the `<li>` rows gain column alignment so rank,
player name (+ badges), comment, and score line up like table columns across rows — using
responsive grid utilities on the existing elements, not a separate `<table>` or duplicated
markup.

---

## 3. `/setup` and `/login`

Both pages currently render as a bare `<h1>` + form directly in `<main>`, with no visual
framing — they look disconnected from the themed `/` page.

Both get:

- A small wordmark/header above the heading: "🏆 BFF Leaderboard" (smaller scale than the
  `/` page's `<h1>`, e.g. similar to a logo lockup), for visual continuity.
- The form content wrapped in a card (`rounded-xl border bg-card p-6` or equivalent),
  centered on the page with reasonable max-width (matching existing `max-w-sm`/`max-w-xl`
  conventions per page).
- No changes to form behavior, validation, copy, or the underlying `Button`/`Input`
  components — purely a wrapper/layout change. They already inherit the theme via the
  font fix and existing `bg-card`/`border` tokens.

`/login`'s "Check your email" success state gets the same card treatment for consistency.

---

## Out of scope

- `/admin/import` — internal tool, revisited separately as part of a future admin-panel
  project (which will also add nickname management UI).
- Any new color/theme tokens — v1's podium and badge tokens are sufficient.
- Any data/schema/API changes — this is a pure presentation-layer pass.
