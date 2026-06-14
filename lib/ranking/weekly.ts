import type { DayScore } from './types';

// Treat ISO dates as UTC-noon to avoid any TZ/DST drift in pure date math.
function parse(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday (ISO YYYY-MM-DD) of the Mon-Sun week containing `dateISO`. */
export function weekStartOf(dateISO: string): string {
  const d = parse(dateISO);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const deltaToMonday = (dow + 6) % 7; // Mon->0, Sun->6
  d.setUTCDate(d.getUTCDate() - deltaToMonday);
  return toISO(d);
}

/** The Sunday (ISO) ending the week that starts on `weekStartISO` (a Monday). */
export function weekEndOf(weekStartISO: string): string {
  const d = parse(weekStartISO);
  d.setUTCDate(d.getUTCDate() + 6);
  return toISO(d);
}

interface DatedScore extends DayScore {
  playDate: string;
}

/** Sum each user's scores in the given (already week-filtered) rows. */
export function weeklyTotals(rows: DatedScore[]): DayScore[] {
  const byUser = new Map<string, number>();
  for (const r of rows) byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + r.finalScore);
  return [...byUser.entries()].map(([userId, finalScore]) => ({ userId, finalScore }));
}
