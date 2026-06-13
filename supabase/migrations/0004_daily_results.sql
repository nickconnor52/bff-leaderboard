-- Records which days have been finalized (all players in, or the cutoff fired).
-- Drives exactly-once notification and the Hall of Fame medal tally.
create table daily_results (
  play_date date primary key,
  finalized_at timestamptz not null default now()
);

alter table daily_results enable row level security;

create policy "Daily results are viewable by authenticated users"
  on daily_results for select to authenticated using (true);
-- No insert/update policy: only the service-role client (finalization) writes here.
