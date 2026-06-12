import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Clears the Supabase session cookies and sends the user back to the leaderboard.
// 303 forces the POST (from the header's sign-out form) to follow as a GET.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
