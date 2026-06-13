'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AdminScoreRow {
  userId: string;
  displayName: string;
  score: number | null;
}

export function AdminScoreTable({ playDate, rows }: { playDate: string; rows: AdminScoreRow[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(rows.map((r) => [r.userId, r.score?.toString() ?? '']))
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(userId: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/admin/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, playDate, finalScore: drafts[userId] }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? 'Failed to save');
      return;
    }
    router.refresh();
  }

  async function remove(userId: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/admin/scores', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, playDate }),
    });
    setBusy(false);
    if (!res.ok) {
      setMessage('Failed to delete');
      return;
    }
    router.refresh();
  }

  async function finalize() {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/admin/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playDate }),
    });
    setBusy(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(json.error ?? 'Failed to finalize');
      return;
    }
    setMessage(json.finalized ? 'Finalized — notification sent.' : 'Already finalized.');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="admin-date">
          Date
        </label>
        <input
          id="admin-date"
          type="date"
          defaultValue={playDate}
          onChange={(e) => router.push(`/admin?date=${e.target.value}`)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        />
        <Button onClick={finalize} disabled={busy} variant="outline" className="ml-auto">
          Finalize this day
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {rows.map((row) => (
          <li key={row.userId} className="flex items-center gap-3 px-4 py-2">
            <span className="flex-1 font-medium">{row.displayName}</span>
            <Input
              type="number"
              inputMode="numeric"
              className="w-24"
              value={drafts[row.userId] ?? ''}
              onChange={(e) => setDrafts((d) => ({ ...d, [row.userId]: e.target.value }))}
            />
            <Button size="sm" onClick={() => save(row.userId)} disabled={busy}>
              Save
            </Button>
            {row.score !== null && (
              <Button size="sm" variant="outline" onClick={() => remove(row.userId)} disabled={busy}>
                Delete
              </Button>
            )}
          </li>
        ))}
      </ul>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
