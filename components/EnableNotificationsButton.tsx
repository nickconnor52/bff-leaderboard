'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function EnableNotificationsButton() {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (!supported || (isIos && !standalone)) {
    return (
      <div className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
        To get result notifications on iPhone, add this site to your Home Screen first: tap the
        Share icon, choose <span className="font-medium">Add to Home Screen</span>, then open it
        from there and enable notifications.
      </div>
    );
  }

  async function enable() {
    setStatus('working');
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('error');
        setMessage('Notifications were not allowed.');
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
        ),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) {
        setStatus('error');
        setMessage('Could not save your subscription — try again.');
        return;
      }
      setStatus('done');
      setMessage('Notifications enabled! 🔔');
    } catch {
      setStatus('error');
      setMessage('Something went wrong enabling notifications.');
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={enable} disabled={status === 'working' || status === 'done'}>
        {status === 'done'
          ? 'Notifications on 🔔'
          : status === 'working'
            ? 'Enabling…'
            : 'Enable notifications'}
      </Button>
      {message && (
        <p className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
