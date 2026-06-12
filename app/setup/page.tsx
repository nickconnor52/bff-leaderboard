'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function SetupPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/profile/token', { method: 'POST' });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? 'Something went wrong');
      } else {
        setToken(json.token ?? null);
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6">
      <p className="text-sm font-semibold text-muted-foreground">🏆 BFF Leaderboard</p>
      <div className="w-full space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-bold">Setup</h1>
        <p>
          Generate your personal token, then paste it into the BFF Leaderboard Shortcut so your
          scores get captured automatically every morning.
        </p>
        <Button onClick={handleGenerate} disabled={loading}>
          {token ? 'Regenerate token' : 'Generate my token'}
        </Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {token && (
          <div className="rounded-lg border bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              Copy this now — you won&apos;t be able to see it again. Regenerating replaces it,
              so the old one will stop working.
            </p>
            <code className="block break-all font-mono text-sm">{token}</code>
          </div>
        )}
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Install the{' '}
            <a
              className="underline"
              href="https://www.icloud.com/shortcuts/ccf508f834ac456989ecf7b38f33b35d"
              target="_blank"
              rel="noreferrer"
            >
              BFF Leaderboard Shortcut
            </a>
            .
          </li>
          <li>When prompted, paste your token above into the Shortcut&apos;s settings.</li>
          <li>Tomorrow morning, after you finish maptap.gg, tap Share → BFF Leaderboard.</li>
        </ol>
      </div>
    </main>
  );
}
