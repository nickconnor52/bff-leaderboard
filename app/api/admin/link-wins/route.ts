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
  const historicalWinId = typeof record.historicalWinId === 'string' ? record.historicalWinId : null;
  const userId = typeof record.userId === 'string' ? record.userId : null;
  if (!historicalWinId || !userId) {
    return NextResponse.json({ error: 'Provide historicalWinId and userId.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('historical_wins')
    .update({ user_id: userId })
    .eq('id', historicalWinId);
  if (error) return NextResponse.json({ error: 'Failed to link wins' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
