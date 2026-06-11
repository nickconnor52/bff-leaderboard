'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Mode = 'paste' | 'number';

export function AddScoreDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('paste');
  const [shareText, setShareText] = useState('');
  const [finalScore, setFinalScore] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const body = mode === 'paste' ? { shareText } : { finalScore: Number(finalScore) };

    try {
      const response = await fetch('/api/scores/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json();

      if (!response.ok) {
        setError(json.error ?? 'Something went wrong');
        return;
      }

      setOpen(false);
      setShareText('');
      setFinalScore('');
      router.refresh();
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled =
    submitting || (mode === 'paste' ? shareText.trim().length === 0 : finalScore.trim().length === 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setError(null);
      }}
    >
      <DialogTrigger className={buttonVariants({ className: 'font-semibold' })}>
        + Add my score
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add my score</DialogTitle>
          <DialogDescription>Manual entries get a friendly &ldquo;😤 Cheating&rdquo; badge.</DialogDescription>
        </DialogHeader>

        <div className="flex w-fit gap-1 rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode('paste')}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              mode === 'paste' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Paste share text
          </button>
          <button
            type="button"
            onClick={() => setMode('number')}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
              mode === 'number' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            )}
          >
            Just the number
          </button>
        </div>

        {mode === 'paste' ? (
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-transparent p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Paste your maptap.gg share text here..."
            value={shareText}
            onChange={(event) => setShareText(event.target.value)}
          />
        ) : (
          <Input
            type="number"
            min={0}
            max={999}
            placeholder="294"
            value={finalScore}
            onChange={(event) => setFinalScore(event.target.value)}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSubmit} disabled={submitDisabled}>
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
