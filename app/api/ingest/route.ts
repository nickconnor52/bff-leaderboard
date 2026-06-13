import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { hashApiToken } from '@/lib/tokens';
import { parseShareText } from '@/lib/parser';
import { etToday } from '@/lib/dates';
import { maybeFinalizeToday } from '@/lib/finalize';

export async function POST(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('api_token_hash', hashApiToken(token))
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const bodyRecord = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const text = typeof bodyRecord.text === 'string' ? bodyRecord.text : '';

  if (text.trim().length === 0) {
    return NextResponse.json({ error: 'Missing share text' }, { status: 400 });
  }

  const parsed = parseShareText(text);
  const playDate = etToday();

  const { error } = await supabase.from('scores').upsert(
    {
      user_id: profile.id,
      play_date: playDate,
      final_score: parsed?.finalScore ?? 0,
      category_scores: parsed?.categoryScores ?? {},
      comment_text: parsed?.commentText ?? null,
      raw_share_text: text,
      parse_status: parsed ? 'ok' : 'needs_review',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) {
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }

  try {
    await maybeFinalizeToday(supabase);
  } catch (err) {
    console.error('finalize after ingest failed', err);
  }

  return NextResponse.json({ status: parsed ? 'ok' : 'needs_review' });
}
