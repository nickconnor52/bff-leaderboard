'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Nickname {
  id: string;
  nickname: string;
}
interface HistoricalWin {
  id: string;
  playerName: string;
  wins: number;
  userId: string | null;
}

export function AdminProfileEditor({
  profile,
  nicknames,
  historicalWins,
}: {
  profile: { id: string; displayName: string };
  nicknames: Nickname[];
  historicalWins: HistoricalWin[];
}) {
  const router = useRouter();
  const [name, setName] = useState(profile.displayName);
  const [newNickname, setNewNickname] = useState('');
  const [linkId, setLinkId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkedHere = historicalWins.filter((w) => w.userId === profile.id);
  const unlinked = historicalWins.filter((w) => w.userId === null);

  async function call(input: RequestInfo, init: RequestInit, ok: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(input, init);
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? 'Something went wrong');
      return;
    }
    setMessage(ok);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{profile.displayName}</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Display name</h2>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button
            disabled={busy}
            onClick={() =>
              call(
                `/api/admin/profiles/${profile.id}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ displayName: name }),
                },
                'Name updated.'
              )
            }
          >
            Save
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Nicknames</h2>
        <ul className="space-y-1">
          {nicknames.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <span className="flex-1">{n.nickname}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  call(
                    '/api/admin/nicknames',
                    {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: n.id }),
                    },
                    'Nickname removed.'
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            placeholder="Add a nickname"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            className="max-w-xs"
          />
          <Button
            disabled={busy || !newNickname.trim()}
            onClick={() =>
              call(
                '/api/admin/nicknames',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: profile.id, nickname: newNickname }),
                },
                'Nickname added.'
              ).then(() => setNewNickname(''))
            }
          >
            Add
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Historical wins</h2>
        {linkedHere.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Linked: {linkedHere.map((w) => `${w.playerName} (${w.wins})`).join(', ')}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No historical wins linked yet.</p>
        )}
        {unlinked.length > 0 && (
          <div className="flex gap-2">
            <select
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">Link an unlinked record…</option>
              {unlinked.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.playerName} ({w.wins})
                </option>
              ))}
            </select>
            <Button
              disabled={busy || !linkId}
              onClick={() =>
                call(
                  '/api/admin/link-wins',
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ historicalWinId: linkId, userId: profile.id }),
                  },
                  'Wins linked.'
                ).then(() => setLinkId(''))
              }
            >
              Link
            </Button>
          </div>
        )}
      </section>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
