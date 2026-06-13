import Link from 'next/link';
import { createServiceClient } from '@/lib/supabase/service';

export default async function AdminUsersPage() {
  const service = createServiceClient();
  const { data: profiles } = await service
    .from('profiles')
    .select('id, display_name, is_admin')
    .order('display_name');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>
      <ul className="divide-y rounded-lg border">
        {(profiles ?? []).map((p) => (
          <li key={p.id as string}>
            <Link
              href={`/admin/users/${p.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted"
            >
              <span className="font-medium">{p.display_name as string}</span>
              {(p.is_admin as boolean) && (
                <span className="text-xs text-muted-foreground">admin</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
