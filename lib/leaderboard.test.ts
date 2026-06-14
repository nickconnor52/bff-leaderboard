import { describe, it, expect } from 'vitest';
import { aggregateLeaderboard, getDateRange } from './leaderboard';

describe('aggregateLeaderboard', () => {
  it('sums scores per user, counts games played, sorts by total descending, and surfaces a comment only when exactly one game contributed', () => {
    const rows = [
      { user_id: 'a', final_score: 700, display_name: 'Alice', comment_text: 'Tough one', entry_method: 'shortcut' },
      { user_id: 'b', final_score: 900, display_name: 'Bob', comment_text: 'Easy mode', entry_method: 'shortcut' },
      { user_id: 'a', final_score: 800, display_name: 'Alice', comment_text: 'Redemption!', entry_method: 'shortcut' },
    ];

    expect(aggregateLeaderboard(rows)).toEqual([
      {
        userId: 'a',
        displayName: 'Alice',
        totalScore: 1500,
        gamesPlayed: 2,
        averageScore: 750,
        comment: null,
        isManual: false,
      },
      {
        userId: 'b',
        displayName: 'Bob',
        totalScore: 900,
        gamesPlayed: 1,
        averageScore: 900,
        comment: 'Easy mode',
        isManual: false,
      },
    ]);
  });

  it('returns an empty list for no rows', () => {
    expect(aggregateLeaderboard([])).toEqual([]);
  });

  it('marks an entry as manual when its only row was manually entered', () => {
    const rows = [
      { user_id: 'c', final_score: 261, display_name: 'Craig', comment_text: null, entry_method: 'manual' },
    ];

    expect(aggregateLeaderboard(rows)[0].isManual).toBe(true);
  });

  it('marks an entry as manual if any row in the period was manually entered', () => {
    const rows = [
      { user_id: 'c', final_score: 261, display_name: 'Craig', comment_text: null, entry_method: 'shortcut' },
      { user_id: 'c', final_score: 100, display_name: 'Craig', comment_text: null, entry_method: 'manual' },
    ];

    expect(aggregateLeaderboard(rows)[0].isManual).toBe(true);
  });

  it('does not mark an entry as manual when no rows were manually entered', () => {
    const rows = [
      { user_id: 'c', final_score: 261, display_name: 'Craig', comment_text: null, entry_method: 'shortcut' },
      { user_id: 'c', final_score: 100, display_name: 'Craig', comment_text: null, entry_method: 'import' },
    ];

    expect(aggregateLeaderboard(rows)[0].isManual).toBe(false);
  });
});

describe('getDateRange', () => {
  it('returns null for all-time (meaning: no date filtering)', () => {
    expect(getDateRange('all-time', new Date('2026-06-07T12:00:00Z'))).toBeNull();
  });

  it('returns the same start and end day for daily', () => {
    expect(getDateRange('daily', new Date('2026-06-07T12:00:00Z'))).toEqual({
      start: '2026-06-07',
      end: '2026-06-07',
    });
  });

  it('returns a Sunday-to-Saturday range for weekly', () => {
    // 2026-06-10 is a Wednesday; its week runs Sun 2026-06-07 to Sat 2026-06-13
    expect(getDateRange('weekly', new Date('2026-06-10T12:00:00Z'))).toEqual({
      start: '2026-06-07',
      end: '2026-06-13',
    });
  });

  it('returns the full calendar month for monthly', () => {
    expect(getDateRange('monthly', new Date('2026-06-15T12:00:00Z'))).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
    });
  });

  it('uses the Eastern calendar day, not UTC (evening ET is still "today")', () => {
    // 2026-06-14T02:00:00Z is 2026-06-13 10pm ET — scores carry ET play_date, so
    // "today" must be 2026-06-13, not the UTC date 2026-06-14.
    expect(getDateRange('daily', new Date('2026-06-14T02:00:00Z'))).toEqual({
      start: '2026-06-13',
      end: '2026-06-13',
    });
  });

  it('keeps weekly/monthly on the Eastern day across the UTC midnight boundary', () => {
    // Same instant (2026-06-13 10pm ET). Month must stay June; the week must be the
    // one containing Sat 2026-06-13, i.e. Sun 06-07 .. Sat 06-13.
    expect(getDateRange('monthly', new Date('2026-06-14T02:00:00Z'))).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
    });
    expect(getDateRange('weekly', new Date('2026-06-14T02:00:00Z'))).toEqual({
      start: '2026-06-07',
      end: '2026-06-13',
    });
  });
});
