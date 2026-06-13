import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminProfileEditor } from '@/components/admin/AdminProfileEditor';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const service = createServiceClient();

  const { data: profile } = await service
    .from('profiles')
    .select('id, display_name')
    .eq('id', id)
    .single();
  if (!profile) notFound();

  const [{ data: nicknames }, { data: wins }] = await Promise.all([
    service.from('nicknames').select('id, nickname').eq('user_id', id).order('nickname'),
    service.from('historical_wins').select('id, player_name, wins, user_id').order('player_name'),
  ]);

  return (
    <AdminProfileEditor
      profile={{ id: profile.id as string, displayName: profile.display_name as string }}
      nicknames={(nicknames ?? []).map((n) => ({ id: n.id as string, nickname: n.nickname as string }))}
      historicalWins={(wins ?? []).map((w) => ({
        id: w.id as string,
        playerName: w.player_name as string,
        wins: w.wins as number,
        userId: (w.user_id as string | null) ?? null,
      }))}
    />
  );
}
