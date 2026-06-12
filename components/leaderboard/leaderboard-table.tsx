import type { LeaderboardEntry } from '@/lib/leaderboard';
import { PodiumCard } from './podium-card';

const PODIUM_LAYOUTS: Record<number, { container: string; cardClasses: string[] }> = {
  1: {
    container: 'grid-cols-1',
    cardClasses: ['col-span-1'],
  },
  2: {
    container: 'grid-cols-2 sm:grid-cols-[1.3fr_1fr]',
    cardClasses: ['col-span-2 sm:col-span-1', 'col-span-2 sm:col-span-1'],
  },
  3: {
    container: 'grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr]',
    cardClasses: ['col-span-2 sm:col-span-1', 'col-span-1', 'col-span-1'],
  },
};

export function LeaderboardTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-center text-muted-foreground">No scores yet for this period.</p>;
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const layout = PODIUM_LAYOUTS[podium.length];

  return (
    <div className="space-y-6">
      <div className={`grid gap-2 sm:gap-3 ${layout.container}`}>
        {podium.map((entry, index) => (
          <div key={entry.userId} className={layout.cardClasses[index]}>
            <PodiumCard
              rank={(index + 1) as 1 | 2 | 3}
              displayName={entry.displayName}
              totalScore={entry.totalScore}
              comment={entry.comment}
              isManual={entry.isManual}
            />
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <ol className="divide-y rounded-lg border" start={4}>
          {rest.map((entry, index) => (
            <li
              key={entry.userId}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:grid sm:grid-cols-[2.5rem_1fr_2fr_auto] sm:items-center sm:gap-4"
            >
              <span className="hidden text-sm text-muted-foreground sm:block">#{index + 4}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="sm:hidden">#{index + 4}</span>
                <span>{entry.displayName}</span>
                {entry.isManual && (
                  <span className="rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
                    😤 Cheating
                  </span>
                )}
                {entry.comment && (
                  <span className="text-xs italic text-muted-foreground sm:hidden">
                    &ldquo;{entry.comment}&rdquo;
                  </span>
                )}
              </span>
              <span className="hidden text-xs italic text-muted-foreground sm:block">
                {entry.comment ? <>&ldquo;{entry.comment}&rdquo;</> : '—'}
              </span>
              <span className="text-right font-semibold">{entry.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
