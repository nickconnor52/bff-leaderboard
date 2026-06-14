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
