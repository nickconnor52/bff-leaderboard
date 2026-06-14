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

  const { data: nicknames } = await service
    .from('nicknames')
    .select('id, nickname')
    .eq('user_id', id)
    .order('nickname');

  return (
    <AdminProfileEditor
      profile={{ id: profile.id as string, displayName: profile.display_name as string }}
      nicknames={(nicknames ?? []).map((n) => ({ id: n.id as string, nickname: n.nickname as string }))}
    />
  );
}
