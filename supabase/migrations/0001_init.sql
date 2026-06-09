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
