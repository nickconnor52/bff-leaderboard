import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminUser } from '@/lib/admin';
import { parseManualScore } from '@/lib/parser';

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
  const playDate = typeof record.playDate === 'string' ? record.playDate : null;
  const score = parseManualScore(String(record.finalScore ?? ''));

  if (!userId || !playDate || score === null) {
    return NextResponse.json({ error: 'Provide userId, playDate, and a score 0–999.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from('scores').upsert(
    {
      user_id: userId,
      play_date: playDate,
      final_score: score,
      category_scores: {},
      comment_text: null,
      raw_share_text: 'Admin entry',
      parse_status: 'ok',
      entry_method: 'admin',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
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
  const userId = typeof record.userId === 'string' ? record.userId : null;
  const playDate = typeof record.playDate === 'string' ? record.playDate : null;

  if (!userId || !playDate) {
    return NextResponse.json({ error: 'Provide userId and playDate.' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('scores')
    .delete()
    .eq('user_id', userId)
    .eq('play_date', playDate);

  if (error) return NextResponse.json({ error: 'Failed to delete score' }, { status: 500 });
  return NextResponse.json({ status: 'ok' });
}
