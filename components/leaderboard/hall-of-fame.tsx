import type { HistoricalWin } from '@/lib/historical-wins';

const MEDALS = ['🥇', '🥈', '🥉'];

export function HallOfFame({ entries }: { entries: HistoricalWin[] }) {
  if (entries.length === 0) return null;

  // Collect footnotes for any entries that carry a note, numbered in display order.
  const notes = entries.filter((entry) => entry.note);

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold sm:text-xl">🏅 All-Time Wins</h2>
        <span className="text-xs text-muted-foreground sm:text-sm">Hall of Fame</span>
      </div>
      <ol className="mt-3 divide-y rounded-lg border">
        {entries.map((entry, index) => (
          <li
            key={entry.playerName}
            className="flex items-center justify-between gap-3 px-4 py-2"
          >
            <span className="flex items-center gap-2">
              <span className="w-6 text-sm text-muted-foreground tabular-nums">
                {MEDALS[index] ?? `#${index + 1}`}
              </span>
              <span className="font-medium">{entry.playerName}</span>
            </span>
            <span className="font-semibold tabular-nums">
              {entry.wins}
              {entry.note && <span className="text-muted-foreground">*</span>}
            </span>
          </li>
        ))}
      </ol>
      {notes.length > 0 && (
        <div className="mt-3 space-y-1">
          {notes.map((entry) => (
            <p key={entry.playerName} className="text-xs italic text-muted-foreground">
              * {entry.note}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
