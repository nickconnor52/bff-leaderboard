import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { finalizeDay } from '@/lib/finalize';
import { etToday } from '@/lib/dates';

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = etToday();

  const { data: scoreDays } = await supabase
    .from('scores')
    .select('play_date')
    .lt('play_date', today);
  const { data: doneDays } = await supabase.from('daily_results').select('play_date');

  const done = new Set((doneDays ?? []).map((d) => d.play_date as string));
  const pending = [...new Set((scoreDays ?? []).map((d) => d.play_date as string))].filter(
    (d) => !done.has(d)
  );

  const finalized: string[] = [];
  for (const day of pending) {
    if (await finalizeDay(supabase, day, { force: true })) finalized.push(day);
  }

  return NextResponse.json({ finalized });
}
