import { cn } from '@/lib/utils';

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
}: {
  rank: 1 | 2 | 3;
  displayName: string;
  totalScore: number;
  comment: string | null;
  isManual: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border-2 p-3 text-center shadow-sm sm:p-4',
        PODIUM_STYLES[rank - 1]
      )}
    >
      <div className="text-xs font-semibold tracking-wide uppercase sm:text-sm">
        {MEDALS[rank - 1]} #{rank}
      </div>
      <div className="mt-1 text-base font-bold sm:text-lg">{displayName}</div>
      <div className="mt-1 text-xl font-extrabold sm:text-2xl">{totalScore}</div>
      {isManual && (
        <div className="mt-2 inline-block rounded-full border border-badge-cheating-border bg-badge-cheating-bg px-2 py-0.5 text-[10px] font-semibold text-badge-cheating-text sm:text-xs">
          😤 Cheating
        </div>
      )}
      {comment && <div className="mt-2 text-xs italic opacity-80">&ldquo;{comment}&rdquo;</div>}
    </div>
  );
}
