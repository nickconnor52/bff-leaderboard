import type { LeaderboardEntry } from '@/lib/leaderboard';
import { PodiumCard } from './podium-card';

const PODIUM_GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground">No scores yet for this period.</p>;
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      <div className={`grid gap-2 sm:gap-3 ${PODIUM_GRID_COLS[podium.length]}`}>
        {podium.map((entry, index) => (
          <PodiumCard
            key={entry.userId}
            rank={(index + 1) as 1 | 2 | 3}
            displayName={entry.displayName}
            totalScore={entry.totalScore}
            comment={entry.comment}
            isManual={entry.isManual}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="divide-y rounded-lg border" start={4}>
          {rest.map((entry, index) => (
            <li key={entry.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="flex flex-wrap items-center gap-2">
                <span>
                  #{index + 4} {entry.displayName}
                </span>
                {entry.isManual && (
                  <span className="rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
                    😤 Cheating
                  </span>
                )}
                {entry.comment && (
                  <span className="text-xs italic text-muted-foreground">
                    &ldquo;{entry.comment}&rdquo;
                  </span>
                )}
              </span>
              <span className="font-semibold">{entry.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
