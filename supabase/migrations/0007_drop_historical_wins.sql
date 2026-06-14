-- Retire the pre-app "Hall of Fame" seed table. On 2026-06-13 the full chat-era
-- history (maptap.gg shares + bare scores) was parsed from the group iMessage thread
-- and imported into `scores` as real rows (entry_method='import'), and every day was
-- finalized in `daily_results`. The Hall of Fame now derives all medals from `scores`,
-- so this summary tally is no longer a source of truth.
--
-- (The rows were already emptied via the service role when the import landed; this
-- drops the table itself and its `link-wins` admin plumbing.)
drop table if exists historical_wins;
