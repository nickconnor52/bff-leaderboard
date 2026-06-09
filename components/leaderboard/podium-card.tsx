import { cn } from '@/lib/utils';

const PODIUM_STYLES = [
  'border-yellow-400 bg-yellow-50 text-yellow-900',
  'border-slate-400 bg-slate-50 text-slate-900',
  'border-amber-700 bg-amber-50 text-amber-900',
];

export function PodiumCard({
  rank,
  displayName,
  totalScore,
  comment,
}: {
  rank: 1 | 2 | 3;
  displayName: string;
  totalScore: number;
  comment: string | null;
}) {
  return (
    <div className={cn('rounded-xl border-2 p-4 text-center shadow-sm', PODIUM_STYLES[rank - 1])}>
      <div className="text-sm font-semibold uppercase tracking-wide">#{rank}</div>
      <div className="mt-1 text-lg font-bold">{displayName}</div>
      <div className="mt-1 text-2xl font-extrabold">{totalScore}</div>
      {comment && (
        <div className="mt-2 text-xs italic opacity-80">&ldquo;{comment}&rdquo;</div>
      )}
    </div>
  );
}
