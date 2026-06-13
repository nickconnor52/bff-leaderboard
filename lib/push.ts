import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

let configured = false;

/** Lazily set VAPID details so importing this module never throws when env is absent. */
function ensureConfigured(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends a podium notification to every stored subscription. Expired subscriptions
 * (HTTP 404/410) are deleted; other per-send failures are logged and skipped. A blank
 * `podiumText` (no medals) sends nothing.
 */
export async function notifyPodium(
  supabase: SupabaseClient,
  podiumText: string
): Promise<void> {
  if (!podiumText) return;
  ensureConfigured();

  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');
  const subs = (data ?? []) as SubscriptionRow[];

  const payload = JSON.stringify({ title: '🏆 BFF Leaderboard', body: podiumText, url: '/' });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error('push send failed', s.endpoint, statusCode);
        }
      }
    })
  );
}
