'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ImportPage() {
  const [displayName, setDisplayName] = useState('');
  const [playDate, setPlayDate] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus('saving');

    const response = await fetch('/api/admin/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName, playDate, finalScore }),
    });

    if (response.ok) {
      setStatus('done');
      setDisplayName('');
      setPlayDate('');
      setFinalScore('');
    } else {
      setStatus('error');
    }
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-bold">Backfill a historical score</h1>
      <p className="text-sm text-muted-foreground">
        For reconstructing results from before the app existed. The display name must match an
        existing profile exactly.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          placeholder="Display name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
        <Input
          type="date"
          value={playDate}
          onChange={(event) => setPlayDate(event.target.value)}
          required
        />
        <Input
          type="number"
          placeholder="Final score"
          value={finalScore}
          onChange={(event) => setFinalScore(event.target.value)}
          required
        />
        <Button type="submit" disabled={status === 'saving'}>
          Save
        </Button>
        {status === 'done' && <p className="text-sm text-green-600">Saved.</p>}
        {status === 'error' && <p className="text-sm text-red-600">Something went wrong — check the display name matches exactly.</p>}
      </form>
    </main>
  );
}
