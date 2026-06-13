import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const displayName = typeof record.displayName === 'string' ? record.displayName.trim() : '';
  if (!displayName) return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from('profiles').update({ display_name: displayName }).eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
