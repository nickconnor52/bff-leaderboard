import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';
import { finalizeDay } from '@/lib/finalize';

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
  const playDate = typeof record.playDate === 'string' ? record.playDate : null;
  if (!playDate) return NextResponse.json({ error: 'Provide playDate.' }, { status: 400 });

  const finalized = await finalizeDay(createServiceClient(), playDate, { force: true });
  return NextResponse.json({ finalized });
}
