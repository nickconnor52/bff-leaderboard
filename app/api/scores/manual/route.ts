import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseShareText, parseManualScore } from '@/lib/parser';
import { etToday } from '@/lib/dates';
import { createServiceClient } from '@/lib/supabase/service';
import { maybeFinalizeToday } from '@/lib/finalize';

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

  const bodyRecord = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  let finalScore: number;
  let categoryScores: Record<string, number>;
  let commentText: string | null;
  let rawShareText: string;

  if (typeof bodyRecord.shareText === 'string') {
    const parsed = parseShareText(bodyRecord.shareText);
    if (!parsed) {
      return NextResponse.json(
        { error: "Couldn't read that — make sure you copied the full share text." },
        { status: 400 }
      );
    }
    finalScore = parsed.finalScore;
    categoryScores = parsed.categoryScores;
    commentText = parsed.commentText;
    rawShareText = bodyRecord.shareText;
  } else if (typeof bodyRecord.finalScore === 'number') {
    const score = parseManualScore(String(bodyRecord.finalScore));
    if (score === null) {
      return NextResponse.json({ error: 'Enter a score between 0 and 999.' }, { status: 400 });
    }
    finalScore = score;
    categoryScores = {};
    commentText = null;
    rawShareText = `Manual entry: ${score}`;
  } else {
    return NextResponse.json({ error: 'Missing shareText or finalScore' }, { status: 400 });
  }

  const playDate = etToday();

  const { error } = await supabase.from('scores').upsert(
    {
      user_id: user.id,
      play_date: playDate,
      final_score: finalScore,
      category_scores: categoryScores,
      comment_text: commentText,
      raw_share_text: rawShareText,
      parse_status: 'ok',
      entry_method: 'manual',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) {
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }

  try {
    await maybeFinalizeToday(createServiceClient());
  } catch (err) {
    console.error('finalize after manual entry failed', err);
  }

  return NextResponse.json({ status: 'ok' });
}
