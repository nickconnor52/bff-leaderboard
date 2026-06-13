import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const keys = typeof record.keys === 'object' && record.keys !== null
    ? (record.keys as Record<string, unknown>)
    : {};
  const endpoint = typeof record.endpoint === 'string' ? record.endpoint : null;
  const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : null;
  const auth = typeof keys.auth === 'string' ? keys.auth : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' });

  if (error) {
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}
