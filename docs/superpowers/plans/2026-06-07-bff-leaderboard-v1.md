# bff-leaderboard v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js + Supabase app where 7 friends can have their daily maptap.gg scores
captured automatically (via an iOS Shortcut) and view daily/weekly/monthly/all-time leaderboards
with podium styling.

**Architecture:** A Next.js (App Router) app backed by Supabase (Postgres + Auth). An `/api/ingest`
route accepts share text authenticated by a per-user API token (validated against a hash, looked
up via the Supabase service-role client), parses it with a pure `parseShareText` function, and
upserts one row per user per day into a `scores` table. Authenticated pages render leaderboards
by aggregating those rows over different date ranges.

**Tech Stack:** Next.js (App Router, TypeScript), Supabase (Postgres + Auth via `@supabase/ssr`),
Tailwind CSS + shadcn/ui, Vitest for unit tests, deployed on Vercel.

**Reference spec:** `docs/superpowers/specs/2026-06-07-bff-leaderboard-v1-design.md`

---

## Task 1: Project scaffolding

**Files:**
- Create: Next.js app structure (`app/`, `lib/`, `components/`, config files) at repo root
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Scaffold the Next.js app**

Run (in the repo root, which currently only has `README.md` and `.git`):

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --eslint --use-npm
```

When prompted about the non-empty directory, choose to continue (it only contains `README.md`
and `.git`).

- [ ] **Step 2: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

Choose: TypeScript = yes, style = "New York" or "Default" (either is fine), base color = Slate,
CSS variables = yes. This creates `components.json`, `lib/utils.ts` (the `cn` helper), and updates
`app/globals.css`.

- [ ] **Step 3: Add the shadcn components we'll need**

```bash
npx shadcn@latest add button input tabs
```

This creates `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/tabs.tsx`.

- [ ] **Step 4: Install Vitest and testing dependencies**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 5: Create the Vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

- [ ] **Step 6: Add a test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with Tailwind, shadcn/ui, and Vitest"
```

---

## Task 2: maptap.gg share-text parser (TDD)

**Files:**
- Create: `lib/parser.ts`
- Test: `lib/parser.test.ts`

This is pure logic with no external dependencies — the ideal place to validate the whole TDD
loop (and the Vitest setup from Task 1) before touching any infrastructure.

- [ ] **Step 1: Write the failing tests**

Create `lib/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseShareText } from './parser';

describe('parseShareText', () => {
  it('parses a full share with category scores and a trailing comment', () => {
    const input =
      'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744\n\nDamn, tough one';

    expect(parseShareText(input)).toEqual({
      finalScore: 744,
      categoryScores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
      commentText: 'Damn, tough one',
    });
  });

  it('parses a share with no trailing comment', () => {
    const input = 'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744';

    expect(parseShareText(input)).toEqual({
      finalScore: 744,
      categoryScores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
      commentText: null,
    });
  });

  it('returns null when the text has no recognizable "Final score" or category pairs', () => {
    expect(parseShareText('744')).toBeNull();
    expect(parseShareText('garbled nonsense')).toBeNull();
  });

  it('returns null when there is a final score but no category pairs', () => {
    expect(parseShareText('Final score: 744')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npx vitest run lib/parser.test.ts
```

Expected: FAIL — `Cannot find module './parser'` (the module doesn't exist yet).

- [ ] **Step 3: Implement the parser**

Create `lib/parser.ts`:

```typescript
export interface ParsedScore {
  finalScore: number;
  categoryScores: Record<string, number>;
  commentText: string | null;
}

const CATEGORY_PAIR_RE = /(\d+)(\p{Emoji_Presentation})/gu;
const FINAL_SCORE_RE = /Final score:\s*(\d+)/i;

export function parseShareText(rawText: string): ParsedScore | null {
  const finalScoreMatch = rawText.match(FINAL_SCORE_RE);
  if (!finalScoreMatch || finalScoreMatch.index === undefined) return null;

  const beforeFinalScore = rawText.slice(0, finalScoreMatch.index);
  const categoryScores: Record<string, number> = {};
  for (const pair of beforeFinalScore.matchAll(CATEGORY_PAIR_RE)) {
    categoryScores[pair[2]] = parseInt(pair[1], 10);
  }

  if (Object.keys(categoryScores).length === 0) return null;

  const finalScore = parseInt(finalScoreMatch[1], 10);
  const afterFinalScore = rawText
    .slice(finalScoreMatch.index + finalScoreMatch[0].length)
    .trim();

  return {
    finalScore,
    categoryScores,
    commentText: afterFinalScore.length > 0 ? afterFinalScore : null,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx vitest run lib/parser.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/parser.ts lib/parser.test.ts
git commit -m "Add maptap.gg share-text parser"
```

---

## Task 3: Supabase project setup and client libraries

**Files:**
- Create: `.env.local` (not committed — contains secrets)
- Create: `.env.local.example`
- Create: `lib/supabase/browser.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/service.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Create a Supabase project**

This is a manual step outside the codebase:

1. Go to https://supabase.com and create a new project (e.g. named "bff-leaderboard").
2. Once it's provisioned, open **Project Settings → API**.
3. Note down three values: the **Project URL**, the **anon/public key**, and the
   **service_role key** (keep this one secret — it bypasses all database security rules).

- [ ] **Step 2: Install the Supabase client libraries**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Add environment variables**

Create `.env.local` (this file must NOT be committed):

```
NEXT_PUBLIC_SUPABASE_URL=<your project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
```

Create `.env.local.example` (this one IS committed, so future-you knows what's needed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Confirm `.env.local` is listed in `.gitignore` (Next.js's default `.gitignore` already includes
`.env*.local`, so this should already be the case — just verify it).

- [ ] **Step 4: Create the browser Supabase client**

Create `lib/supabase/browser.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 5: Create the server Supabase client**

Create `lib/supabase/server.ts`:

```typescript
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
}
```

- [ ] **Step 6: Create the service-role Supabase client**

This client bypasses Row Level Security and must only ever be used in server-side code (API
routes) that performs its own authorization checks — never expose it to the browser.

Create `lib/supabase/service.ts`:

```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/supabase .env.local.example .gitignore package.json package-lock.json
git commit -m "Add Supabase client setup (browser, server, service-role)"
```

---

## Task 4: Database schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the schema migration**

Create `supabase/migrations/0001_init.sql`:

```sql
-- Profile for each authenticated user, with a hashed personal API token
-- used by the iOS Shortcut to authenticate score submissions.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  api_token_hash text unique,
  created_at timestamptz not null default now()
);

-- Automatically create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- One score per user per day. category_scores is flexible JSON because we
-- don't yet know the full meaning of maptap.gg's scoring categories, and this
-- keeps the door open for achievements later without a schema rewrite.
create table scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  play_date date not null,
  final_score integer not null,
  category_scores jsonb not null default '{}',
  comment_text text,
  raw_share_text text not null,
  parse_status text not null default 'ok' check (parse_status in ('ok', 'needs_review')),
  created_at timestamptz not null default now(),
  unique (user_id, play_date)
);

alter table profiles enable row level security;
alter table scores enable row level security;

-- Everyone in the group can see everyone's profile and scores — it's a
-- shared leaderboard for 7 friends, not a multi-tenant system.
create policy "Profiles are viewable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Scores are viewable by authenticated users"
  on scores for select
  to authenticated
  using (true);

create policy "Users can insert their own scores"
  on scores for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own scores"
  on scores for update
  to authenticated
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration**

In the Supabase dashboard, open **SQL Editor**, paste the contents of
`supabase/migrations/0001_init.sql`, and run it. Confirm in **Table Editor** that `profiles` and
`scores` now exist.

(Note: the `/api/ingest` and admin-import routes use the service-role client, which bypasses
these RLS policies entirely after performing their own token/session checks — that's why insert
policies only need to cover the case of a regular authenticated user inserting their own row.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "Add profiles and scores schema migration"
```

---

## Task 5: Authentication (magic-link login + session middleware)

**Files:**
- Create: `middleware.ts`
- Create: `app/login/page.tsx`
- Create: `app/auth/callback/route.ts`

- [ ] **Step 1: Enable email magic-link auth in Supabase**

In the Supabase dashboard, go to **Authentication → Providers → Email** and confirm "Email"
is enabled with "Confirm email" — Supabase's default magic-link flow needs no further
configuration for this project.

- [ ] **Step 2: Create the session-refresh middleware**

Create `middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 3: Create the auth callback route**

Magic links redirect back to this route, which exchanges the code for a session.

Create `app/auth/callback/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}/`);
}
```

- [ ] **Step 4: Create the login page**

Create `app/login/page.tsx`:

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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <main className="mx-auto max-w-sm p-6 text-center">
        <p>Check your email for a sign-in link.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm space-y-4 p-6">
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
    </main>
  );
}
```

- [ ] **Step 5: Manually verify the login flow**

```bash
npm run dev
```

Visit `http://localhost:3000/login`, enter your email, submit, and confirm:
1. The page switches to "Check your email for a sign-in link."
2. The email arrives and clicking its link redirects you back to `/` while signed in (you can
   confirm you're signed in via the Supabase dashboard's **Authentication → Users** list, or by
   temporarily adding `console.log` of `supabase.auth.getUser()` to a page).

Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/login app/auth
git commit -m "Add magic-link authentication"
```

---

## Task 6: Personal API tokens (TDD for the core logic, then UI)

**Files:**
- Create: `lib/tokens.ts`
- Test: `lib/tokens.test.ts`
- Create: `app/api/profile/token/route.ts`
- Create: `app/setup/page.tsx`

- [ ] **Step 1: Write the failing tests for token generation/hashing**

Create `lib/tokens.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateApiToken, hashApiToken } from './tokens';

describe('generateApiToken', () => {
  it('generates a 64-character hex string', () => {
    expect(generateApiToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a different token on each call', () => {
    expect(generateApiToken()).not.toBe(generateApiToken());
  });
});

describe('hashApiToken', () => {
  it('hashes the same token to the same value', () => {
    expect(hashApiToken('abc123')).toBe(hashApiToken('abc123'));
  });

  it('hashes different tokens to different values', () => {
    expect(hashApiToken('abc123')).not.toBe(hashApiToken('xyz789'));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npx vitest run lib/tokens.test.ts
```

Expected: FAIL — `Cannot find module './tokens'`.

- [ ] **Step 3: Implement token generation/hashing**

Create `lib/tokens.ts`:

```typescript
import { randomBytes, createHash } from 'crypto';

export function generateApiToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx vitest run lib/tokens.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Create the token-generation API route**

This route requires a signed-in session, generates a fresh token, stores its hash on the
caller's profile, and returns the raw token exactly once (it's never recoverable afterward).

Create `app/api/profile/token/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateApiToken, hashApiToken } from '@/lib/tokens';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const token = generateApiToken();
  const tokenHash = hashApiToken(token);

  const { error } = await supabase
    .from('profiles')
    .update({ api_token_hash: tokenHash })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }

  return NextResponse.json({ token });
}
```

- [ ] **Step 6: Create the setup page**

Create `app/setup/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function SetupPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const response = await fetch('/api/profile/token', { method: 'POST' });
    const json = await response.json();
    setToken(json.token ?? null);
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Setup</h1>
      <p>
        Generate your personal token, then paste it into the BFF Leaderboard Shortcut so your
        scores get captured automatically every morning.
      </p>
      <Button onClick={handleGenerate} disabled={loading}>
        {token ? 'Regenerate token' : 'Generate my token'}
      </Button>
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
        <li>Install the BFF Leaderboard Shortcut (link coming in Task 11).</li>
        <li>When prompted, paste your token above into the Shortcut&apos;s settings.</li>
        <li>Tomorrow morning, after you finish maptap.gg, tap Share → BFF Leaderboard.</li>
      </ol>
    </main>
  );
}
```

- [ ] **Step 7: Manually verify**

```bash
npm run dev
```

Sign in at `/login`, then visit `/setup`, click "Generate my token," and confirm a token
appears. In the Supabase dashboard's **Table Editor → profiles**, confirm `api_token_hash` is
now populated for your row (it will be a long hex string, not the raw token). Stop the dev
server when done.

- [ ] **Step 8: Commit**

```bash
git add lib/tokens.ts lib/tokens.test.ts app/api/profile app/setup
git commit -m "Add personal API token generation and setup page"
```

---

## Task 7: Ingest endpoint

**Files:**
- Create: `app/api/ingest/route.ts`
- Test: `app/api/ingest/route.test.ts`

- [ ] **Step 1: Write the failing tests**

These tests mock the service-role Supabase client so we can verify the route's logic (auth
check, parsing integration, status codes, and the data passed to `upsert`) without a real
database.

Create `app/api/ingest/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockSingle = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: mockSingle }) }) };
      }
      return { upsert: mockUpsert };
    },
  }),
}));

function makeRequest(body: unknown, token?: string): Request {
  return new Request('http://localhost/api/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ingest', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('rejects requests with no token', async () => {
    const response = await POST(makeRequest({ text: 'hello' }));
    expect(response.status).toBe(401);
  });

  it('rejects requests with an unrecognized token', async () => {
    mockSingle.mockResolvedValue({ data: null });

    const response = await POST(makeRequest({ text: 'hello' }, 'bad-token'));

    expect(response.status).toBe(401);
  });

  it('parses recognizable share text and stores it as ok', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'user-123' } });
    const text =
      'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744\n\nDamn, tough one';

    const response = await POST(makeRequest({ text }, 'good-token'));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 744,
        category_scores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
        comment_text: 'Damn, tough one',
        raw_share_text: text,
        parse_status: 'ok',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });

  it('stores unrecognizable text as needs_review instead of rejecting it', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'user-123' } });

    const response = await POST(makeRequest({ text: 'garbled nonsense' }, 'good-token'));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 0,
        raw_share_text: 'garbled nonsense',
        parse_status: 'needs_review',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npx vitest run app/api/ingest/route.test.ts
```

Expected: FAIL — `Cannot find module './route'` (or similar — the route doesn't exist yet).

- [ ] **Step 3: Implement the ingest route**

Create `app/api/ingest/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hashApiToken } from '@/lib/tokens';
import { parseShareText } from '@/lib/parser';

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('api_token_hash', hashApiToken(token))
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const body = await request.json();
  const text = typeof body?.text === 'string' ? body.text : '';

  if (text.trim().length === 0) {
    return NextResponse.json({ error: 'Missing share text' }, { status: 400 });
  }

  const parsed = parseShareText(text);
  const playDate = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from('scores').upsert(
    {
      user_id: profile.id,
      play_date: playDate,
      final_score: parsed?.finalScore ?? 0,
      category_scores: parsed?.categoryScores ?? {},
      comment_text: parsed?.commentText ?? null,
      raw_share_text: text,
      parse_status: parsed ? 'ok' : 'needs_review',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) {
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }

  return NextResponse.json({ status: parsed ? 'ok' : 'needs_review' });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx vitest run app/api/ingest/route.test.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Manually verify against the real database**

```bash
npm run dev
```

In another terminal, generate a token at `/setup` (Task 6), then:

```bash
curl -i -X POST http://localhost:3000/api/ingest \
  -H "Authorization: Bearer <your token>" \
  -H "Content-Type: application/json" \
  -d '{"text":"www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744\n\nDamn, tough one"}'
```

Expected: `HTTP/1.1 200 OK` with body `{"status":"ok"}`. Confirm in the Supabase dashboard's
**Table Editor → scores** that a row now exists for your user with `final_score = 744` and
today's `play_date`. Run the same `curl` command again and confirm the row is updated in place
(not duplicated) — this proves the upsert/overwrite behavior works. Stop the dev server when
done.

- [ ] **Step 6: Commit**

```bash
git add app/api/ingest
git commit -m "Add score ingest endpoint authenticated by personal API token"
```

---

## Task 8: Leaderboard ranking logic (TDD)

**Files:**
- Create: `lib/leaderboard.ts`
- Test: `lib/leaderboard.test.ts`

The date-range and aggregation logic is pure and the most important thing to get right, so we
test it directly. The thin Supabase-querying wrapper around it (`fetchLeaderboard`) is verified
manually in Task 9 once there's real data and a page to view it on.

- [ ] **Step 1: Write the failing tests**

Create `lib/leaderboard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateLeaderboard, getDateRange } from './leaderboard';

describe('aggregateLeaderboard', () => {
  it('sums scores per user, counts games played, sorts by total descending, and surfaces a comment only when exactly one game contributed', () => {
    const rows = [
      { user_id: 'a', final_score: 700, display_name: 'Alice', comment_text: 'Tough one' },
      { user_id: 'b', final_score: 900, display_name: 'Bob', comment_text: 'Easy mode' },
      { user_id: 'a', final_score: 800, display_name: 'Alice', comment_text: 'Redemption!' },
    ];

    expect(aggregateLeaderboard(rows)).toEqual([
      {
        userId: 'b',
        displayName: 'Bob',
        totalScore: 900,
        gamesPlayed: 1,
        averageScore: 900,
        comment: 'Easy mode',
      },
      {
        userId: 'a',
        displayName: 'Alice',
        totalScore: 1500,
        gamesPlayed: 2,
        averageScore: 750,
        comment: null,
      },
    ]);
  });

  it('returns an empty list for no rows', () => {
    expect(aggregateLeaderboard([])).toEqual([]);
  });
});

describe('getDateRange', () => {
  it('returns null for all-time (meaning: no date filtering)', () => {
    expect(getDateRange('all-time', new Date('2026-06-07T12:00:00Z'))).toBeNull();
  });

  it('returns the same start and end day for daily', () => {
    expect(getDateRange('daily', new Date('2026-06-07T12:00:00Z'))).toEqual({
      start: '2026-06-07',
      end: '2026-06-07',
    });
  });

  it('returns a Sunday-to-Saturday range for weekly', () => {
    // 2026-06-10 is a Wednesday; its week runs Sun 2026-06-07 to Sat 2026-06-13
    expect(getDateRange('weekly', new Date('2026-06-10T12:00:00Z'))).toEqual({
      start: '2026-06-07',
      end: '2026-06-13',
    });
  });

  it('returns the full calendar month for monthly', () => {
    expect(getDateRange('monthly', new Date('2026-06-15T12:00:00Z'))).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
npx vitest run lib/leaderboard.test.ts
```

Expected: FAIL — `Cannot find module './leaderboard'`.

- [ ] **Step 3: Implement the ranking logic and the data-fetching wrapper**

Create `lib/leaderboard.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all-time';

export interface ScoreRow {
  user_id: string;
  final_score: number;
  display_name: string;
  comment_text: string | null;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalScore: number;
  gamesPlayed: number;
  averageScore: number;
  /**
   * Only populated when exactly one game contributed to this entry — for the
   * `daily` period that's always true; for longer periods it avoids picking an
   * arbitrary comment out of several days' worth of banter.
   */
  comment: string | null;
}

export function aggregateLeaderboard(rows: ScoreRow[]): LeaderboardEntry[] {
  const byUser = new Map<
    string,
    { displayName: string; total: number; count: number; lastComment: string | null }
  >();

  for (const row of rows) {
    const existing = byUser.get(row.user_id) ?? {
      displayName: row.display_name,
      total: 0,
      count: 0,
      lastComment: null,
    };
    existing.total += row.final_score;
    existing.count += 1;
    existing.lastComment = row.comment_text;
    byUser.set(row.user_id, existing);
  }

  return Array.from(byUser.entries())
    .map(([userId, { displayName, total, count, lastComment }]) => ({
      userId,
      displayName,
      totalScore: total,
      gamesPlayed: count,
      averageScore: Math.round(total / count),
      comment: count === 1 ? lastComment : null,
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getDateRange(
  period: LeaderboardPeriod,
  referenceDate: Date
): { start: string; end: string } | null {
  if (period === 'all-time') return null;

  if (period === 'daily') {
    const day = toIsoDate(referenceDate);
    return { start: day, end: day };
  }

  if (period === 'weekly') {
    const start = new Date(referenceDate);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: toIsoDate(start), end: toIsoDate(end) };
  }

  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

interface ScoreWithProfile {
  user_id: string;
  final_score: number;
  comment_text: string | null;
  profiles: { display_name: string } | { display_name: string }[] | null;
}

function displayNameFrom(profiles: ScoreWithProfile['profiles']): string {
  if (!profiles) return 'Unknown';
  return Array.isArray(profiles) ? (profiles[0]?.display_name ?? 'Unknown') : profiles.display_name;
}

export async function fetchLeaderboard(
  supabase: SupabaseClient,
  period: LeaderboardPeriod,
  referenceDate: Date = new Date()
): Promise<LeaderboardEntry[]> {
  const range = getDateRange(period, referenceDate);

  let query = supabase
    .from('scores')
    .select('user_id, final_score, comment_text, profiles(display_name)');
  if (range) {
    query = query.gte('play_date', range.start).lte('play_date', range.end);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: ScoreRow[] = (data ?? []).map((row: ScoreWithProfile) => ({
    user_id: row.user_id,
    final_score: row.final_score,
    display_name: displayNameFrom(row.profiles),
    comment_text: row.comment_text,
  }));

  return aggregateLeaderboard(rows);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npx vitest run lib/leaderboard.test.ts
```

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/leaderboard.ts lib/leaderboard.test.ts
git commit -m "Add leaderboard ranking and date-range logic"
```

---

## Task 9: Leaderboard UI

**Files:**
- Create: `components/leaderboard/podium-card.tsx`
- Create: `components/leaderboard/leaderboard-table.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create the podium card component**

Create `components/leaderboard/podium-card.tsx`:

```tsx
import { cn } from '@/lib/utils';

const PODIUM_STYLES = [
  'border-yellow-400 bg-yellow-50 text-yellow-900',
  'border-slate-400 bg-slate-50 text-slate-900',
  'border-amber-700 bg-amber-50 text-amber-900',
];

export function PodiumCard({
  rank,
  displayName,
  totalScore,
  comment,
}: {
  rank: 1 | 2 | 3;
  displayName: string;
  totalScore: number;
  comment: string | null;
}) {
  return (
    <div className={cn('rounded-xl border-2 p-4 text-center shadow-sm', PODIUM_STYLES[rank - 1])}>
      <div className="text-sm font-semibold uppercase tracking-wide">#{rank}</div>
      <div className="mt-1 text-lg font-bold">{displayName}</div>
      <div className="mt-1 text-2xl font-extrabold">{totalScore}</div>
      {comment && (
        <div className="mt-2 text-xs italic opacity-80">&ldquo;{comment}&rdquo;</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the leaderboard table component**

Create `components/leaderboard/leaderboard-table.tsx`:

```tsx
import type { LeaderboardEntry } from '@/lib/leaderboard';
import { PodiumCard } from './podium-card';

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground">No scores yet for this period.</p>;
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {podium.map((entry, index) => (
          <PodiumCard
            key={entry.userId}
            rank={(index + 1) as 1 | 2 | 3}
            displayName={entry.displayName}
            totalScore={entry.totalScore}
            comment={entry.comment}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="divide-y rounded-lg border" start={4}>
          {rest.map((entry, index) => (
            <li key={entry.userId} className="flex items-center justify-between px-4 py-2">
              <span>
                #{index + 4} {entry.displayName}
                {entry.comment && (
                  <span className="ml-2 text-xs italic text-muted-foreground">
                    &ldquo;{entry.comment}&rdquo;
                  </span>
                )}
              </span>
              <span className="font-semibold">{entry.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire up the leaderboard page**

Replace the contents of `app/page.tsx`:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { fetchLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import { createClient } from '@/lib/supabase/server';

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'all-time', label: 'All-Time' },
];

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const entriesByPeriod = await Promise.all(
    PERIODS.map((period) => fetchLeaderboard(supabase, period.value))
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">BFF Leaderboard</h1>
      <Tabs defaultValue="daily">
        <TabsList>
          {PERIODS.map((period) => (
            <TabsTrigger key={period.value} value={period.value}>
              {period.label}
            </TabsTrigger>
          ))}
        </TabsList>
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

- [ ] **Step 4: Manually verify in the browser**

```bash
npm run dev
```

Visit `http://localhost:3000/`, sign in if redirected to `/login`, and confirm:
1. The four tabs (Today, This Week, This Month, All-Time) render and switch correctly.
2. The score you submitted via `curl` in Task 7 appears, and — since it's the only score —
   renders as the #1 podium card with gold styling, including the "Damn, tough one" comment in
   italics beneath the score.
3. Submit a second score for a different user (you can do this by creating a second test
   account, generating its token, and `curl`-ing again) and confirm both render with correct
   podium/list placement and ranking by total score.
4. Submit a second day's score for the *same* user (e.g. re-run the Task 7 `curl` with a
   different `text` after manually changing that row's `play_date` in the Supabase dashboard, or
   wait a day) and confirm that once they have more than one game in a period, their comment
   stops being shown for that period — proving the "only show when unambiguous" rule works.

Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add components/leaderboard app/page.tsx
git commit -m "Add leaderboard UI with podium styling for top 3"
```

---

## Task 10: Manual history-entry admin page

**Files:**
- Create: `app/api/admin/import/route.ts`
- Create: `app/admin/import/page.tsx`

Any signed-in member of the group can use this page — for a trusted 7-person friend group,
requiring a session is sufficient and building a separate roles/permissions system would be
overkill. In practice, only Nick or Jordan will use it to backfill old results.

- [ ] **Step 1: Create the import API route**

Create `app/api/admin/import/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { displayName, playDate, finalScore } = await request.json();
  if (!displayName || !playDate || !finalScore) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('id')
    .eq('display_name', displayName)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'No profile with that display name' }, { status: 404 });
  }

  const { error } = await service.from('scores').upsert(
    {
      user_id: profile.id,
      play_date: playDate,
      final_score: Number(finalScore),
      category_scores: {},
      comment_text: null,
      raw_share_text: '[manually backfilled — original share text not available]',
      parse_status: 'ok',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 2: Create the import page**

Create `app/admin/import/page.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ImportPage() {
  const [displayName, setDisplayName] = useState('');
  const [playDate, setPlayDate] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('saving');

    const response = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName, playDate, finalScore }),
    });

    if (response.ok) {
      setStatus('done');
      setDisplayName('');
      setPlayDate('');
      setFinalScore('');
    } else {
      setStatus('error');
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Backfill a historical score</h1>
      <p className="text-sm text-muted-foreground">
        For reconstructing results from before the app existed. The display name must match an
        existing profile exactly.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          placeholder="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
        <Input
          type="date"
          value={playDate}
          onChange={(event) => setPlayDate(event.target.value)}
          required
        />
        <Input
          type="number"
          placeholder="Final score"
          value={finalScore}
          onChange={(event) => setFinalScore(event.target.value)}
          required
        />
        <Button type="submit" disabled={status === 'saving'}>
          Save
        </Button>
        {status === 'done' && <p className="text-sm text-green-600">Saved.</p>}
        {status === 'error' && <p className="text-sm text-red-600">Something went wrong — check the display name matches exactly.</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Manually verify**

```bash
npm run dev
```

Sign in, visit `/admin/import`, enter your own display name (check it in the Supabase
dashboard's **Table Editor → profiles** if unsure), pick a past date, enter a score, and submit.
Confirm "Saved." appears and a new row shows up in **Table Editor → scores** with
`raw_share_text = '[manually backfilled — original share text not available]'`. Then visit `/`
and confirm the backfilled date now contributes to the appropriate weekly/monthly/all-time
totals. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin app/admin
git commit -m "Add manual history-backfill admin page"
```

---

## Task 11: iOS Shortcut and setup instructions

**Files:**
- Modify: `app/setup/page.tsx`

This task is mostly building something *outside* the codebase (an iOS Shortcut), then linking
to it from the app.

- [ ] **Step 1: Build the Shortcut on your iPhone**

In the Shortcuts app, create a new shortcut named "BFF Leaderboard" with these actions, in
order:

1. **Receive** input from Share Sheet: **Text**. (This makes the Shortcut appear when sharing
   text — including from maptap.gg's Share button.)
2. **Text**: a text field where you'll store your token. Set its value to a placeholder like
   `PASTE-YOUR-TOKEN-HERE` — each friend will edit this field to their own token after
   installing.
3. **Get Contents of URL**:
   - URL: `https://<your-deployed-domain>/api/ingest`
   - Method: `POST`
   - Headers: `Authorization` = `Bearer <value from the Text action in step 2>`,
     `Content-Type` = `application/json`
   - Request Body: choose "JSON", with one field `text` set to the **Shortcut Input** (the
     shared text from step 1)
4. **Show Notification** (optional but nice): title "BFF Leaderboard", body set to the
   `status` field from the URL response — gives instant confirmation that the score was
   captured.

Test it yourself first: open maptap.gg, finish a round, tap Share, choose "BFF Leaderboard"
from the share sheet, and confirm you get a success notification and the score appears on `/`.

- [ ] **Step 2: Get a shareable link for the Shortcut**

In the Shortcuts app, open the Shortcut, tap the share icon, and choose "Copy iCloud Link."
This produces a URL anyone can open to install a copy of the Shortcut on their own phone.

- [ ] **Step 3: Add the link and clearer instructions to the setup page**

In `app/setup/page.tsx`, replace the placeholder list item:

```tsx
<li>Install the BFF Leaderboard Shortcut (link coming in Task 11).</li>
```

with:

```tsx
<li>
  Install the{' '}
  <a className="underline" href="<your iCloud Shortcut link>" target="_blank" rel="noreferrer">
    BFF Leaderboard Shortcut
  </a>
  .
</li>
```

(Replace `<your iCloud Shortcut link>` with the actual URL from Step 2.)

- [ ] **Step 4: Walk one friend through setup end-to-end**

Have one other person sign in, generate their token at `/setup`, install the Shortcut from
your link, paste their token into the Shortcut's Text action, and try sharing a real score.
Confirm it appears correctly attributed to them on the leaderboard. This is the real proof that
"as seamless as possible" has been achieved — fix anything that trips them up before rolling it
out to the rest of the group.

- [ ] **Step 5: Commit**

```bash
git add app/setup/page.tsx
git commit -m "Link the BFF Leaderboard Shortcut from the setup page"
```

---

## Task 12: Documentation and deployment

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Write `CLAUDE.md`**

Create `CLAUDE.md` at the repo root:

```markdown
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

## Vision / future ideas (not yet built)

- **Achievements** (e.g. "first podium," win streaks). The `category_scores` JSON and daily
  granularity were chosen specifically to make this possible later without a schema rewrite.
- **Support for additional games** beyond maptap.gg. The current schema is intentionally
  maptap.gg-specific; generalize once a second game's actual format is known, rather than
  guessing now.
- **Automated history import.** Jordan's existing tracking is informal/scattered across chat
  messages, so v1 only ships a manual backfill page (`/admin/import`).
```

- [ ] **Step 2: Commit the documentation**

```bash
git add CLAUDE.md
git commit -m "Add CLAUDE.md with architecture overview and future vision"
```

- [ ] **Step 3: Deploy to Vercel**

1. Push the repo to GitHub (create a new repo if it isn't hosted there yet).
2. In Vercel, "Add New Project," import the GitHub repo, and set the same three environment
   variables from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`) in the project's settings.
3. Deploy. Once live, update the Supabase project's **Authentication → URL Configuration** to
   include the deployed domain in "Site URL" and "Redirect URLs" (so magic links redirect
   correctly in production).
4. Update the Shortcut's URL (Task 11, Step 1) to point at the deployed domain instead of
   `localhost`, and re-share the iCloud link if it changed.

- [ ] **Step 4: Smoke-test production**

Visit the deployed URL, sign in, generate a token, share a real maptap.gg score via the
Shortcut, and confirm it appears on the live leaderboard. This is the full loop working
end-to-end in the real environment your friends will use.

---

## Spec coverage check

- Capture flow (Shortcut → ingest → parse → store): Tasks 2, 6, 7, 11 ✓
- Account + login with personal tokens: Tasks 5, 6 ✓
- Data model (`profiles`, `scores`, flexible `category_scores`, `raw_share_text` safety net,
  `parse_status`): Task 4 ✓
- Daily/weekly/monthly/all-time leaderboards with podium treatment: Tasks 8, 9 ✓
- Comment/personality flourishes surfaced in the UI: parser captures `commentText` (Task 2),
  stored (Task 4/7), and rendered next to each entry — shown only when an entry represents
  exactly one game, so longer-period views never display an arbitrarily-chosen comment
  (Task 8/9) ✓
- Manual history backfill: Task 10 ✓
- Documentation for future agentic work (`CLAUDE.md`, specs): Task 12 ✓
- Deployment (Vercel): Task 12 ✓
