import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAdminUser(supabase);
  if (!user) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <nav className="mb-6 flex flex-wrap items-center gap-4 border-b pb-3 text-sm">
        <span className="font-bold">🛠️ Admin</span>
        <Link href="/admin" className="text-muted-foreground hover:text-foreground">
          Scores
        </Link>
        <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
          Users
        </Link>
        <Link href="/admin/import" className="text-muted-foreground hover:text-foreground">
          Import
        </Link>
        <Link href="/" className="ml-auto text-muted-foreground hover:text-foreground">
          ← Leaderboard
        </Link>
      </nav>
      {children}
    </div>
  );
}
