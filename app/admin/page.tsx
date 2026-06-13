import { etToday } from '@/lib/dates';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminScoreTable, type AdminScoreRow } from '@/components/admin/AdminScoreTable';

export default async function AdminScoresPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const playDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : etToday();

  const service = createServiceClient();
  const [{ data: profiles }, { data: scores }] = await Promise.all([
    service.from('profiles').select('id, display_name').order('display_name'),
    service.from('scores').select('user_id, final_score').eq('play_date', playDate),
  ]);

  const scoreByUser = new Map(
    (scores ?? []).map((s) => [s.user_id as string, s.final_score as number])
  );
  const rows: AdminScoreRow[] = (profiles ?? []).map((p) => ({
    userId: p.id as string,
    displayName: p.display_name as string,
    score: scoreByUser.get(p.id as string) ?? null,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Scores</h1>
      <AdminScoreTable playDate={playDate} rows={rows} />
    </div>
  );
}
