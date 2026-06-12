import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { AddScoreDialog } from '@/components/leaderboard/add-score-dialog';
import { fetchLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
import { getSubtitleTarget, fetchRandomNickname } from '@/lib/nicknames';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'daily', label: 'Today' },
  { value: 'weekly', label: 'This Week' },
  { value: 'monthly', label: 'This Month' },
  { value: 'all-time', label: 'All-Time' },
];

export default async function LeaderboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const pillClass = cn(
    buttonVariants({ variant: 'outline', size: 'sm', className: 'rounded-full' })
  );

  return (
    <>
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
          <div className="space-y-1 text-center sm:text-left">
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">🏆 BFF Leaderboard</h1>
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
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
            {user ? (
              <>
                {user.email && (
                  <span className="hidden text-sm text-muted-foreground sm:inline">
                    {user.email}
                  </span>
                )}
                <Link href="/setup" className={pillClass}>
                  Setup
                </Link>
                <form action="/auth/signout" method="post">
                  <button type="submit" className={pillClass}>
                    Sign out
                  </button>
                </form>
                <AddScoreDialog />
              </>
            ) : (
              <Link href="/login" className={pillClass}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
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
    </>
  );
}
