-- Pre-app "Hall of Fame" win tallies, carried over from the manual era (when
-- Jordan tracked wins by hand). Decoupled from profiles so the counts can be
-- seeded by name before everyone has an account; `user_id` is filled in later
-- when each player signs up, linking their history to their profile.
create table historical_wins (
  id uuid primary key default gen_random_uuid(),
  player_name text not null,
  wins integer not null default 0,
  -- Optional footnote shown next to the count (e.g. an asterisk story).
  note text,
  user_id uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table historical_wins enable row level security;

create policy "Historical wins are viewable by authenticated users"
  on historical_wins for select
  to authenticated
  using (true);
