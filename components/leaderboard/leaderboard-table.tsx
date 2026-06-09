import type { LeaderboardEntry } from '@/lib/leaderboard';
import { PodiumCard } from './podium-card';

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground">No scores yet for this period.</p>;
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {podium.map((entry, index) => (
          <PodiumCard
            key={entry.userId}
            rank={(index + 1) as 1 | 2 | 3}
            displayName={entry.displayName}
            totalScore={entry.totalScore}
            comment={entry.comment}
          />
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="divide-y rounded-lg border" start={4}>
          {rest.map((entry, index) => (
            <li key={entry.userId} className="flex items-center justify-between px-4 py-2">
              <span>
                #{index + 4} {entry.displayName}
                {entry.comment && (
                  <span className="ml-2 text-xs italic text-muted-foreground">
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
