-- Tracks how a score was submitted. 'manual' entries get the "Cheating" badge in the
-- UI; 'import' (historical backfill via /admin/import) does not, so the bulk history
-- import doesn't retroactively tag everyone's all-time record.
alter table scores
  add column entry_method text not null default 'shortcut'
  check (entry_method in ('shortcut', 'manual', 'import'));

-- Per-user nickname bank, used for the "Are you smarter than a <nickname>?" subtitle.
-- Seeded by hand via the Supabase SQL editor for v1, e.g.:
--   insert into nicknames (user_id, nickname)
--   select id, unnest(array['Ratterman', 'Slowpoke'])
--   from profiles where display_name = 'Craig';
create table nicknames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  nickname text not null
);

alter table nicknames enable row level security;

create policy "Nicknames are viewable by authenticated users"
  on nicknames for select
  to authenticated
  using (true);
