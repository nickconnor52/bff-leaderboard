import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let displayName: unknown, playDate: unknown, finalScore: unknown;
  try {
    ({ displayName, playDate, finalScore } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!displayName || !playDate || !finalScore) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  const score = Number(finalScore);
  if (isNaN(score)) {
    return NextResponse.json({ error: 'finalScore must be a number' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('id')
    .eq('display_name', displayName)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'No profile with that display name' }, { status: 404 });
  }

  const { error } = await service.from('scores').upsert(
    {
      user_id: profile.id,
      play_date: playDate,
      final_score: score,
      category_scores: {},
      comment_text: null,
      raw_share_text: '[manually backfilled — original share text not available]',
      parse_status: 'ok',
      entry_method: 'import',
    },
    { onConflict: 'user_id,play_date' }
  );

  if (error) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}
