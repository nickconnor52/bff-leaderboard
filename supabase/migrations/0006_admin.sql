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
