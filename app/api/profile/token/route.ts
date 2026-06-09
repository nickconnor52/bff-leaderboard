import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateApiToken, hashApiToken } from '@/lib/tokens';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const token = generateApiToken();
  const tokenHash = hashApiToken(token);

  const { error } = await supabase
    .from('profiles')
    .update({ api_token_hash: tokenHash })
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }

  return NextResponse.json({ token });
}
