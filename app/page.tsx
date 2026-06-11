import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { AddScoreDialog } from '@/components/leaderboard/add-score-dialog';
import { fetchLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import { getSubtitleTarget, fetchRandomNickname } from '@/lib/nicknames';
import { createClient } from '@/lib/supabase/server';

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'all-time', label: 'All-Time' },
];

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const results = await Promise.allSettled(
    PERIODS.map((period) => fetchLeaderboard(supabase, period.value))
  );
  const entriesByPeriod = results.map((result) =>
    result.status === 'fulfilled' ? result.value : []
  );

  const subtitleTarget = getSubtitleTarget(entriesByPeriod);
  const subtitleName = subtitleTarget
    ? await fetchRandomNickname(supabase, subtitleTarget.userId, subtitleTarget.displayName)
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1 pt-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">🏆 BFF Leaderboard</h1>
          <Link
            href="/setup"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })}
          >
            Setup
          </Link>
        </div>
        <p className="text-sm text-muted-foreground italic sm:text-base">
          {subtitleName ? (
            <>
              Are you smarter than a{' '}
              <span className="font-semibold text-primary not-italic">{subtitleName}</span>?
            </>
          ) : (
            'Track your maptap.gg scores with the squad'
          )}
        </p>
      </header>

      <div className="flex justify-center">
        <AddScoreDialog />
      </div>

      <Tabs defaultValue="daily">
        <div className="flex justify-center">
          <TabsList>
            {PERIODS.map((period) => (
              <TabsTrigger key={period.value} value={period.value}>
                {period.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {PERIODS.map((period, index) => (
          <TabsContent key={period.value} value={period.value}>
            <LeaderboardTable entries={entriesByPeriod[index]} />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
