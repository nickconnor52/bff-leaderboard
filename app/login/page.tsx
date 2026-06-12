'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm font-semibold text-muted-foreground">🏆 BFF Leaderboard</p>
        <div className="w-full rounded-xl border bg-card p-6">
          <p>Check your email for a sign-in link.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm font-semibold text-muted-foreground">🏆 BFF Leaderboard</p>
      <div className="w-full space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Button type="submit" className="w-full">
            Send magic link
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </main>
  );
}
