# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gated `/admin` area for admins to manage any user's scores, manually finalize a day, and manage profiles (rename, nicknames, link historical wins).

**Architecture:** A `profiles.is_admin` flag gates an `app/admin` layout (pages) and every `/api/admin/*` route handler (via a `getAdminUser` server helper); admin writes go through the service-role client after the gate passes. Score edits flow into the derived Hall of Fame automatically; the finalize button reuses the existing `finalizeDay({ force: true })`.

**Tech Stack:** Next.js 16 (App Router, RSC, async `params`/`searchParams`, route handlers), TypeScript, Supabase (`@supabase/ssr` + service-role), Vitest.

> **Environment:** Node >= 20.9; default `node` is v18. Prefix every npm command with `source ~/.nvm/nvm.sh && nvm use 20.20.2 &&`.
>
> **Controller gates** (the human, not implementers): apply migration `0006`, then `update profiles set is_admin = true where display_name = 'Nick';`. The code degrades safely without them (non-admins simply get 404/403).
>
> **No new pure logic** is introduced (score validation reuses the already-tested `parseManualScore`), so tasks are verified by `npm run lint && npm run build` and the existing suite rather than new unit tests.

---

## File Structure

- **Create** `supabase/migrations/0006_admin.sql` — `is_admin` column + `entry_method` constraint swap (applied manually).
- **Create** `lib/admin.ts` — `getAdminUser` server helper.
- **Create** `app/admin/layout.tsx` — admin gate + nav (also gates the existing `/admin/import` page).
- **Modify** `app/api/admin/import/route.ts` — require admin (close the existing login-only gap).
- **Create** `app/api/admin/scores/route.ts` — upsert + delete any score.
- **Create** `app/api/admin/finalize/route.ts` — force-finalize a day.
- **Create** `app/api/admin/profiles/[id]/route.ts` — rename a profile.
- **Create** `app/api/admin/nicknames/route.ts` — add/remove a nickname.
- **Create** `app/api/admin/link-wins/route.ts` — link a `historical_wins` row to a profile.
- **Create** `app/admin/page.tsx` + `components/admin/AdminScoreTable.tsx` — score management.
- **Create** `app/admin/users/page.tsx` — users list.
- **Create** `app/admin/users/[id]/page.tsx` + `components/admin/AdminProfileEditor.tsx` — profile detail.
- **Modify** `app/page.tsx` — show an "Admin" pill for admins.

---

### Task 1: Migration (applied by controller)

**Files:** Create `supabase/migrations/0006_admin.sql`

- [ ] **Step 1: Create `supabase/migrations/0006_admin.sql`**

```sql
-- Admin flag. The owner sets their own to true once, by hand:
--   update profiles set is_admin = true where display_name = 'Nick';
alter table profiles add column is_admin boolean not null default false;

-- Allow admin-entered scores. Only 'manual' drives the "Cheating" badge, so
-- 'admin' entries appear clean. If the existing constraint name differs, find it with:
--   select conname from pg_constraint
--   where conrelid = 'scores'::regclass and contype = 'c';
alter table scores drop constraint scores_entry_method_check;
alter table scores
  add constraint scores_entry_method_check
  check (entry_method in ('shortcut', 'manual', 'import', 'admin'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0006_admin.sql
git commit -m "Add is_admin column and 'admin' entry_method migration"
```

> **Controller gate:** apply in the Supabase SQL editor and set your own `is_admin = true` before this feature works.

---

### Task 2: `getAdminUser` helper

**Files:** Create `lib/admin.ts`

- [ ] **Step 1: Create `lib/admin.ts`**

```ts
import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Returns the signed-in user ONLY if their profile has `is_admin = true`, else null.
 * Pass a session-scoped server client (RLS lets a user read their own profile row).
 */
export async function getAdminUser(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return profile?.is_admin ? user : null;
}
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add lib/admin.ts
git commit -m "Add getAdminUser server helper"
```

---

### Task 3: Admin layout gate + nav

**Files:** Create `app/admin/layout.tsx`

- [ ] **Step 1: Create `app/admin/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAdminUser(supabase);
  if (!user) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <nav className="mb-6 flex flex-wrap items-center gap-4 border-b pb-3 text-sm">
        <span className="font-bold">🛠️ Admin</span>
        <Link href="/admin" className="text-muted-foreground hover:text-foreground">
          Scores
        </Link>
        <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
          Users
        </Link>
        <Link href="/admin/import" className="text-muted-foreground hover:text-foreground">
          Import
        </Link>
        <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
          ← Leaderboard
        </Link>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success. (The pre-existing `app/admin/import/page.tsx` now renders inside this gated layout.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "Gate /admin pages behind is_admin via layout"
```

---

### Task 4: Require admin on the existing import API

**Files:** Modify `app/api/admin/import/route.ts`

- [ ] **Step 1: Add the import**

Add to the imports in `app/api/admin/import/route.ts`:
```ts
import { getAdminUser } from '@/lib/admin';
```

- [ ] **Step 2: Replace the login-only check**

Replace these lines:
```ts
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
```
with:
```ts
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
```

- [ ] **Step 3: Build + tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run build`
Expected: all tests pass (no test covers this route); build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/import/route.ts
git commit -m "Require admin for the historical import endpoint"
```

---

### Task 5: Score management API (`/api/admin/scores`)

**Files:** Create `app/api/admin/scores/route.ts`

- [ ] **Step 1: Create `app/api/admin/scores/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';
import { parseManualScore } from '@/lib/parser';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const userId = typeof record.userId === 'string' ? record.userId : null;
  const playDate = typeof record.playDate === 'string' ? record.playDate : null;
  const score = parseManualScore(String(record.finalScore ?? ''));

  if (!userId || !playDate || score === null) {
    return NextResponse.json({ error: 'Provide userId, playDate, and a score 0–999.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from('scores').upsert(
    {
      user_id: userId,
      play_date: playDate,
      final_score: score,
      category_scores: {},
      comment_text: null,
      raw_share_text: 'Admin entry',
      parse_status: 'ok',
      entry_method: 'admin',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}

export async function DELETE(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const userId = typeof record.userId === 'string' ? record.userId : null;
  const playDate = typeof record.playDate === 'string' ? record.playDate : null;

  if (!userId || !playDate) {
    return NextResponse.json({ error: 'Provide userId and playDate.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('scores')
    .delete()
    .eq('user_id', userId)
    .eq('play_date', playDate);

  if (error) return NextResponse.json({ error: 'Failed to delete score' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success, `/api/admin/scores` listed.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/scores/route.ts
git commit -m "Add admin score upsert/delete endpoint"
```

---

### Task 6: Finalize API (`/api/admin/finalize`)

**Files:** Create `app/api/admin/finalize/route.ts`

- [ ] **Step 1: Create `app/api/admin/finalize/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';
import { finalizeDay } from '@/lib/finalize';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const playDate = typeof record.playDate === 'string' ? record.playDate : null;
  if (!playDate) return NextResponse.json({ error: 'Provide playDate.' }, { status: 400 });

  const finalized = await finalizeDay(createServiceClient(), playDate, { force: true });
  return NextResponse.json({ finalized });
}
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success, `/api/admin/finalize` listed.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/finalize/route.ts
git commit -m "Add admin force-finalize endpoint"
```

---

### Task 7: Profile-management APIs (rename, nicknames, link-wins)

**Files:**
- Create `app/api/admin/profiles/[id]/route.ts`
- Create `app/api/admin/nicknames/route.ts`
- Create `app/api/admin/link-wins/route.ts`

- [ ] **Step 1: Create `app/api/admin/profiles/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const displayName = typeof record.displayName === 'string' ? record.displayName.trim() : '';
  if (!displayName) return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from('profiles').update({ display_name: displayName }).eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 2: Create `app/api/admin/nicknames/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const userId = typeof record.userId === 'string' ? record.userId : null;
  const nickname = typeof record.nickname === 'string' ? record.nickname.trim() : '';
  if (!userId || !nickname) {
    return NextResponse.json({ error: 'Provide userId and a nickname.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from('nicknames').insert({ user_id: userId, nickname });
  if (error) return NextResponse.json({ error: 'Failed to add nickname' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}

export async function DELETE(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const id = typeof record.id === 'string' ? record.id : null;
  if (!id) return NextResponse.json({ error: 'Provide a nickname id.' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from('nicknames').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete nickname' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 3: Create `app/api/admin/link-wins/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const historicalWinId = typeof record.historicalWinId === 'string' ? record.historicalWinId : null;
  const userId = typeof record.userId === 'string' ? record.userId : null;
  if (!historicalWinId || !userId) {
    return NextResponse.json({ error: 'Provide historicalWinId and userId.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('historical_wins')
    .update({ user_id: userId })
    .eq('id', historicalWinId);
  if (error) return NextResponse.json({ error: 'Failed to link wins' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 4: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success; `/api/admin/profiles/[id]`, `/api/admin/nicknames`, `/api/admin/link-wins` listed.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/profiles app/api/admin/nicknames app/api/admin/link-wins
git commit -m "Add admin profile, nickname, and link-wins endpoints"
```

---

### Task 8: Score management page + table

**Files:**
- Create `components/admin/AdminScoreTable.tsx`
- Create `app/admin/page.tsx`

- [ ] **Step 1: Create `components/admin/AdminScoreTable.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AdminScoreRow {
  userId: string;
  displayName: string;
  score: number | null;
}

export function AdminScoreTable({ playDate, rows }: { playDate: string; rows: AdminScoreRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.userId, r.score?.toString() ?? '']))
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(userId: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/admin/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, playDate, finalScore: drafts[userId] }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? 'Failed to save');
      return;
    }
    router.refresh();
  }

  async function remove(userId: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/admin/scores', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, playDate }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage('Failed to delete');
      return;
    }
    router.refresh();
  }

  async function finalize() {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/admin/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playDate }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error ?? 'Failed to finalize');
      return;
    }
    setMessage(json.finalized ? 'Finalized — notification sent.' : 'Already finalized.');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="admin-date">
          Date
        </label>
        <input
          id="admin-date"
          type="date"
          defaultValue={playDate}
          onChange={(e) => router.push(`/admin?date=${e.target.value}`)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        />
        <Button onClick={finalize} disabled={busy} variant="outline" className="ml-auto">
          Finalize this day
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {rows.map((row) => (
          <li key={row.userId} className="flex items-center gap-3 px-4 py-2">
            <span className="flex-1 font-medium">{row.displayName}</span>
            <Input
              type="number"
              inputMode="numeric"
              className="w-24"
              value={drafts[row.userId] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [row.userId]: e.target.value }))}
            />
            <Button size="sm" onClick={() => save(row.userId)} disabled={busy}>
              Save
            </Button>
            {row.score !== null && (
              <Button size="sm" variant="outline" onClick={() => remove(row.userId)} disabled={busy}>
                Delete
              </Button>
            )}
          </li>
        ))}
      </ul>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/admin/page.tsx`**

```tsx
import { etToday } from '@/lib/dates';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminScoreTable, type AdminScoreRow } from '@/components/admin/AdminScoreTable';

export default async function AdminScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const playDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : etToday();

  const service = createServiceClient();
  const [{ data: profiles }, { data: scores }] = await Promise.all([
    service.from('profiles').select('id, display_name').order('display_name'),
    service.from('scores').select('user_id, final_score').eq('play_date', playDate),
  ]);

  const scoreByUser = new Map(
    (scores ?? []).map((s) => [s.user_id as string, s.final_score as number])
  );
  const rows: AdminScoreRow[] = (profiles ?? []).map((p) => ({
    userId: p.id as string,
    displayName: p.display_name as string,
    score: scoreByUser.get(p.id as string) ?? null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Scores</h1>
      <AdminScoreTable playDate={playDate} rows={rows} />
    </div>
  );
}
```

- [ ] **Step 3: Build + lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run lint && npm run build`
Expected: lint clean; build succeeds with `/admin` listed.

- [ ] **Step 4: Commit**

```bash
git add components/admin/AdminScoreTable.tsx app/admin/page.tsx
git commit -m "Add admin score management page"
```

---

### Task 9: Users list page

**Files:** Create `app/admin/users/page.tsx`

- [ ] **Step 1: Create `app/admin/users/page.tsx`**

```tsx
import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';

export default async function AdminUsersPage() {
  const service = createServiceClient();
  const { data: profiles } = await service
    .from('profiles')
    .select('id, display_name, is_admin')
    .order('display_name');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <ul className="divide-y rounded-lg border">
        {(profiles ?? []).map((p) => (
          <li key={p.id as string}>
            <Link
              href={`/admin/users/${p.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted"
            >
              <span className="font-medium">{p.display_name as string}</span>
              {(p.is_admin as boolean) && (
                <span className="text-xs text-muted-foreground">admin</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run build`
Expected: success, `/admin/users` listed.

- [ ] **Step 3: Commit**

```bash
git add app/admin/users/page.tsx
git commit -m "Add admin users list page"
```

---

### Task 10: Profile detail page + editor

**Files:**
- Create `components/admin/AdminProfileEditor.tsx`
- Create `app/admin/users/[id]/page.tsx`

- [ ] **Step 1: Create `components/admin/AdminProfileEditor.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Nickname {
  id: string;
  nickname: string;
}
interface HistoricalWin {
  id: string;
  playerName: string;
  wins: number;
  userId: string | null;
}

export function AdminProfileEditor({
  profile,
  nicknames,
  historicalWins,
}: {
  profile: { id: string; displayName: string };
  nicknames: Nickname[];
  historicalWins: HistoricalWin[];
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.displayName);
  const [newNickname, setNewNickname] = useState('');
  const [linkId, setLinkId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkedHere = historicalWins.filter((w) => w.userId === profile.id);
  const unlinked = historicalWins.filter((w) => w.userId === null);

  async function call(input: RequestInfo, init: RequestInit, ok: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(input, init);
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? 'Something went wrong');
      return;
    }
    setMessage(ok);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{profile.displayName}</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Display name</h2>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button
            disabled={busy}
            onClick={() =>
              call(
                `/api/admin/profiles/${profile.id}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ displayName: name }),
                },
                'Name updated.'
              )
            }
          >
            Save
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Nicknames</h2>
        <ul className="space-y-1">
          {nicknames.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <span className="flex-1">{n.nickname}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  call(
                    '/api/admin/nicknames',
                    {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: n.id }),
                    },
                    'Nickname removed.'
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            placeholder="Add a nickname"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            className="max-w-xs"
          />
          <Button
            disabled={busy || !newNickname.trim()}
            onClick={() =>
              call(
                '/api/admin/nicknames',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: profile.id, nickname: newNickname }),
                },
                'Nickname added.'
              ).then(() => setNewNickname(''))
            }
          >
            Add
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Historical wins</h2>
        {linkedHere.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Linked: {linkedHere.map((w) => `${w.playerName} (${w.wins})`).join(', ')}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No historical wins linked yet.</p>
        )}
        {unlinked.length > 0 && (
          <div className="flex gap-2">
            <select
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">Link an unlinked record…</option>
              {unlinked.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.playerName} ({w.wins})
                </option>
              ))}
            </select>
            <Button
              disabled={busy || !linkId}
              onClick={() =>
                call(
                  '/api/admin/link-wins',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ historicalWinId: linkId, userId: profile.id }),
                  },
                  'Wins linked.'
                ).then(() => setLinkId(''))
              }
            >
              Link
            </Button>
          </div>
        )}
      </section>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/admin/users/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminProfileEditor } from '@/components/admin/AdminProfileEditor';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: profile } = await service
    .from('profiles')
    .select('id, display_name')
    .eq('id', id)
    .single();
  if (!profile) notFound();

  const [{ data: nicknames }, { data: wins }] = await Promise.all([
    service.from('nicknames').select('id, nickname').eq('user_id', id).order('nickname'),
    service.from('historical_wins').select('id, player_name, wins, user_id').order('player_name'),
  ]);

  return (
    <AdminProfileEditor
      profile={{ id: profile.id as string, displayName: profile.display_name as string }}
      nicknames={(nicknames ?? []).map((n) => ({ id: n.id as string, nickname: n.nickname as string }))}
      historicalWins={(wins ?? []).map((w) => ({
        id: w.id as string,
        playerName: w.player_name as string,
        wins: w.wins as number,
        userId: (w.user_id as string | null) ?? null,
      }))}
    />
  );
}
```

- [ ] **Step 3: Build + lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm run lint && npm run build`
Expected: lint clean; build succeeds with `/admin/users/[id]` listed.

- [ ] **Step 4: Commit**

```bash
git add components/admin/AdminProfileEditor.tsx app/admin/users/[id]/page.tsx
git commit -m "Add admin profile detail editor"
```

---

### Task 11: "Admin" pill in the main header

**Files:** Modify `app/page.tsx`

- [ ] **Step 1: Compute `isAdmin`**

In `app/page.tsx`, find:
```tsx
  const {
    data: { user },
  } = await supabase.auth.getUser();
```
and add immediately after it:
```tsx
  let isAdmin = false;
  if (user) {
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    isAdmin = adminProfile?.is_admin === true;
  }
```

- [ ] **Step 2: Render the pill**

In the logged-in action group, find:
```tsx
                <Link href="/setup" className={pillClass}>
                  Setup
                </Link>
```
and insert immediately BEFORE it:
```tsx
                {isAdmin && (
                  <Link href="/admin" className={pillClass}>
                    Admin
                  </Link>
                )}
```

- [ ] **Step 3: Build + lint + tests**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run lint && npm run build`
Expected: all tests pass; lint clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "Show Admin link in header for admins"
```

---

### Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite, lint, and build**

Run: `source ~/.nvm/nvm.sh && nvm use 20.20.2 && npm test -- --run && npm run lint && npm run build`
Expected: all tests pass; lint clean; build lists `/admin`, `/admin/users`, `/admin/users/[id]`, `/api/admin/scores`, `/api/admin/finalize`, `/api/admin/profiles/[id]`, `/api/admin/nicknames`, `/api/admin/link-wins`.

- [ ] **Step 2: Confirm a clean tree**

Run: `git status`
Expected: clean; everything committed.

---

## Notes for the implementer

- **Do not** apply the migration or set `is_admin` — controller gates. Build/test pass without them.
- All `/admin` pages read with the service-role client (safe: the layout already 404s non-admins). All `/api/admin/*` routes independently call `getAdminUser` and 403 before any service-role write.
- Next 16 makes `params` and `searchParams` Promises — `await` them (shown in the code).
- No new unit tests: score validation reuses the already-tested `parseManualScore`; everything else is glue verified by build/lint and the existing suite.
