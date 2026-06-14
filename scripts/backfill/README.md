# Historical score backfill (one-off, 2026-06-13)

Audit trail for the import that recovered the pre-app maptap.gg history from the group's
iMessage thread ("Get Off The Game") and made it the authoritative score history. This was a
**one-time** run; it lives here for reproducibility, not as part of the app build.

**Result:** 281 scores (253 share cards + 28 bare numbers) across 2026-04-28 → 2026-06-13
imported into `scores` (`entry_method='import'`), all days finalized, and `historical_wins`
retired (migration `0007`). Derived golds cross-validated against the old manual win tally.

## Prerequisites

- **macOS Full Disk Access** for the terminal running these commands (Messages DB is
  TCC-protected). Toggle it in System Settings → Privacy & Security → Full Disk Access, then
  restart the terminal.
- Node 20 (`source ~/.nvm/nvm.sh && nvm use 20.20.2`).
- `.env.local` at repo root with `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  (the import/finalize steps write with the service role).

## Pipeline

Run from the repo root. Intermediate data lands in `scripts/backfill/data/` (gitignored).

```bash
mkdir -p scripts/backfill/data scripts/backfill/_compiled

# 1. Dump the target thread (chat 998) from the local Messages DB to JSON.
#    See dump-chat.sql for how the chat id + handle mapping were identified.
sqlite3 ~/Library/Messages/chat.db < scripts/backfill/dump-chat.sql > scripts/backfill/data/raw.json

# 2. Compile the app's own parser + medal logic so the backfill parses IDENTICALLY to
#    live ingest (no duplicated parsing logic).
npx tsc lib/parser.ts lib/medals.ts --outDir scripts/backfill/_compiled --module es2022 --target es2022

# 3. Parse messages -> reviewable scores (data/backfill_scores.csv + .json).
node scripts/backfill/extract.mjs

# 4. Bulk upsert into `scores` (entry_method='import'); applies the agreed swaps/edits.
node scripts/backfill/import.mjs

# 5. Finalize every imported day (direct daily_results inserts -> no push spam) and
#    recompute the Hall of Fame from the live DB to verify.
node scripts/backfill/finalize-verify.mjs
```

## Key parsing decisions / gotchas (learned the hard way)

- **maptap era starts 2026-04-28.** Everything before is bare-number noise → bounded to era.
- **Bare numbers** (~10%, mostly Conner's posting style) are kept only if in-era and ≥300.
- **Tapback reactions must be excluded.** Standard tapbacks are `associated_message_type` ≠ 0
  (filtered in SQL); custom-emoji reactions ("Reacted 😂 to …") are stored as `amt=0` and
  echo the quoted card, so they're also filtered by text prefix. Missing this attributed
  reacted-to scores to the reactor.
- **play_date = the card's own date** (`www.maptap.gg June 1`), not the message date; the
  regex allows a `(http://www.maptap.gg/)` parenthetical between the domain and the date.
- Handle→profile mapping was resolved from macOS Contacts; see `dump-chat.sql`.

After step 4, `historical_wins` rows were deleted and the table dropped via migration
`0007_drop_historical_wins.sql` so the Hall of Fame doesn't double-count.
