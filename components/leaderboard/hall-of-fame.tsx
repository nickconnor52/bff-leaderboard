import type { HallOfFameRow } from '@/lib/hall-of-fame';
import type { Standing } from '@/lib/ranking/types';
import { RankBadge } from './rank-badge';

export function HallOfFame({
  entries,
  standings,
}: {
  entries: HallOfFameRow[];
  standings: Map<string, Standing>;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold sm:text-xl">🏅 All-Time Medals</h2>
        <span className="text-xs text-muted-foreground sm:text-sm">Hall of Fame</span>
      </div>
      <ol className="mt-3 divide-y rounded-lg border">
        {entries.map((entry, index) => {
          const standing = standings.get(entry.userId);
          return (
            <li
              key={entry.playerName}
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-2"
            >
              <span className="text-sm text-muted-foreground tabular-nums">#{index + 1}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{entry.playerName}</span>
                {standing && (
                  <RankBadge tier={standing.tier} division={standing.division} size="sm" />
                )}
              </span>
              <span className="flex items-center gap-3 font-semibold tabular-nums">
                <span title="Gold">🥇 {entry.gold}</span>
                <span title="Silver">🥈 {entry.silver}</span>
                <span title="Bronze">🥉 {entry.bronze}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
