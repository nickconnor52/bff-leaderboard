-- Dump the target group thread from the local macOS Messages DB as JSON.
-- Run against ~/Library/Messages/chat.db (requires Full Disk Access).
--
-- How the target was identified (2026-06-13):
--   * The thread is chat ROWID 998, "Get Off The Game" (chat727195677584633153):
--     6 other members + you = the exact 7-player roster, single chat row.
--   * Participant phone -> profile mapping (resolved via macOS Contacts):
--       +15134779530 Zach Thomas      -> profile "Sach Thomas"      544ee572-…
--       +15135025993 Jason Ratterman  -> profile "Jason Ratterman"  4ce8c437-…
--       +15857343160 Conner Craig     -> profile "Conner Craig"     3fa1d4a0-…
--       +16147389585 Jordan Mosier    -> profile "Jordan Mosier"    0859e149-…
--       +16149491132 Matthew Bonadies -> profile "RBI Machine"      e37aade2-…
--       +16307467682 Christian Lobello-> profile "Christian Lobello"df73707a-…
--       (is_from_me = 1)              -> profile "Nick"             cde3e4e8-…
--
-- Filters:
--   * associated_message_type = 0 keeps only authored messages (drops tapbacks). Custom-
--     emoji reactions sneak through as amt=0 and are dropped later by text prefix in extract.mjs.
--   * Mac epoch -> Unix seconds: date/1e9 + 978307200.
.mode json
SELECT
  m.ROWID AS rowid,
  CAST(m.date / 1000000000 + 978307200 AS INTEGER) AS ts_unix,
  CASE WHEN m.is_from_me = 1 THEN 'Me' ELSE h.id END AS sender,
  m.text AS text
FROM chat_message_join j
JOIN message m ON m.ROWID = j.message_id
LEFT JOIN handle h ON h.ROWID = m.handle_id
WHERE j.chat_id = 998
  AND m.text IS NOT NULL AND m.text <> ''
  AND m.associated_message_type = 0
ORDER BY m.date;
