import type { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Returns the signed-in user ONLY if their profile has `is_admin = true`, else null.
 * Pass a session-scoped server client (RLS lets a user read their own profile row).
 */
export async function getAdminUser(supabase: SupabaseClient): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return profile?.is_admin ? user : null;
}
