import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const userId = typeof record.userId === 'string' ? record.userId : null;
  const nickname = typeof record.nickname === 'string' ? record.nickname.trim() : '';
  if (!userId || !nickname) {
    return NextResponse.json({ error: 'Provide userId and a nickname.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from('nicknames').insert({ user_id: userId, nickname });
  if (error) return NextResponse.json({ error: 'Failed to add nickname' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}

export async function DELETE(request: Request): Promise<Response> {
  const supabase = await createClient();
  const admin = await getAdminUser(supabase);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const id = typeof record.id === 'string' ? record.id : null;
  if (!id) return NextResponse.json({ error: 'Provide a nickname id.' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.from('nicknames').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Failed to delete nickname' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
