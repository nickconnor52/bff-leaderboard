import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeaderboardTable } from '@/components/leaderboard/leaderboard-table';
import { fetchLeaderboard, type LeaderboardPeriod } from '@/lib/leaderboard';
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

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">BFF Leaderboard</h1>
      <Tabs defaultValue="daily">
        <TabsList>
          {PERIODS.map((period) => (
            <TabsTrigger key={period.value} value={period.value}>
              {period.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {PERIODS.map((period, index) => (
          <TabsContent key={period.value} value={period.value}>
            <LeaderboardTable entries={entriesByPeriod[index]} />
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}
