/** Current date in America/New_York as an ISO `YYYY-MM-DD` string. */
export function etToday(now: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}
