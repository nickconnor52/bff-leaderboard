import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSubtitleTarget, fetchRandomNickname } from './nicknames';
import type { LeaderboardEntry } from './leaderboard';

function entry(userId: string, totalScore: number): LeaderboardEntry {
  return {
    userId,
    displayName: userId,
    totalScore,
    gamesPlayed: 1,
    averageScore: totalScore,
    comment: null,
    isManual: false,
  };
}

describe('getSubtitleTarget', () => {
  it('returns the last entry of the daily leaderboard when it has entries', () => {
    const daily = [entry('a', 400), entry('b', 200)];
    const allTime = [entry('a', 4000), entry('c', 100)];

    expect(getSubtitleTarget([daily, [], [], allTime])).toEqual(entry('b', 200));
  });

  it('falls back to the last entry of the all-time leaderboard when daily is empty', () => {
    const allTime = [entry('a', 4000), entry('c', 100)];

    expect(getSubtitleTarget([[], [], [], allTime])).toEqual(entry('c', 100));
  });

  it('returns null when both daily and all-time are empty', () => {
    expect(getSubtitleTarget([[], [], [], []])).toBeNull();
  });
});

describe('fetchRandomNickname', () => {
  function supabaseReturning(data: { nickname: string }[] | null): SupabaseClient {
    return {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data }),
        }),
      }),
    } as unknown as SupabaseClient;
  }

  it('returns a nickname from the table when one exists', async () => {
    const supabase = supabaseReturning([{ nickname: 'Ratterman' }]);

    expect(await fetchRandomNickname(supabase, 'user-1', 'Craig')).toBe('Ratterman');
  });

  it('falls back to the display name when no nicknames are seeded', async () => {
    const supabase = supabaseReturning([]);

    expect(await fetchRandomNickname(supabase, 'user-1', 'Craig')).toBe('Craig');
  });

  it('falls back to the display name when the query returns null', async () => {
    const supabase = supabaseReturning(null);

    expect(await fetchRandomNickname(supabase, 'user-1', 'Craig')).toBe('Craig');
  });

  it('picks one of multiple nicknames', async () => {
    const supabase = supabaseReturning([{ nickname: 'Ratterman' }, { nickname: 'Slowpoke' }]);

    const result = await fetchRandomNickname(supabase, 'user-1', 'Craig');

    expect(['Ratterman', 'Slowpoke']).toContain(result);
  });
});
