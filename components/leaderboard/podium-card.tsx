import { cn } from '@/lib/utils';
import type { Standing } from '@/lib/ranking/types';
import { RankBadge } from './rank-badge';
import { MatchLabel } from './match-label';

const PODIUM_STYLES = [
  'border-podium-gold-border bg-podium-gold',
  'border-podium-silver-border bg-podium-silver',
  'border-podium-bronze-border bg-podium-bronze',
];

const MEDALS = ['🥇', '🥈', '🥉'];

export function PodiumCard({
  rank,
  displayName,
  totalScore,
  comment,
  isManual,
  standing,
  isDaily,
}: {
  rank: 1 | 2 | 3;
  displayName: string;
  totalScore: number;
  comment: string | null;
  isManual: boolean;
  standing?: Standing;
  isDaily: boolean;
}) {
  const isHero = rank === 1;

  return (
    <div
      className={cn(
        'h-full rounded-xl border-2 text-center shadow-sm',
        isHero ? 'p-4 sm:p-6' : 'p-3 sm:p-4',
        PODIUM_STYLES[rank - 1]
      )}
    >
      <div className="text-xs font-semibold tracking-wide uppercase sm:text-sm">
        {MEDALS[rank - 1]} #{rank}
      </div>
      <div className={cn('mt-1 font-bold', isHero ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg')}>
        {displayName}
      </div>
      {standing && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
          <RankBadge tier={standing.tier} division={standing.division} lp={standing.lp} showLp />
          {isDaily && (
            <MatchLabel promoPending={standing.promoPending} shieldActive={standing.shieldActive} />
          )}
        </div>
      )}
      <div className={cn('mt-1 font-extrabold', isHero ? 'text-4xl sm:text-5xl' : 'text-xl sm:text-2xl')}>
        {totalScore}
      </div>
      {isManual && (
        <div className="mt-2 inline-block rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
          😤 Cheating
        </div>
      )}
      {comment && (
        <div className={cn('mt-2 italic opacity-80', isHero ? 'text-sm sm:text-base' : 'text-xs')}>
          &ldquo;{comment}&rdquo;
        </div>
      )}
    </div>
  );
}
