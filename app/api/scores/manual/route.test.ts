import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ upsert: mockUpsert }),
  }),
}));

vi.mock('@/lib/finalize', () => ({
  maybeFinalizeToday: vi.fn().mockResolvedValue(false),
}));

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/scores/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/scores/manual', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(makeRequest({ finalScore: 294 }));

    expect(response.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('parses pasted share text and stores it as a manual entry', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    const text = 'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744\n\nDamn, tough one';

    const response = await POST(makeRequest({ shareText: text }));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 744,
        category_scores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
        comment_text: 'Damn, tough one',
        raw_share_text: text,
        parse_status: 'ok',
        entry_method: 'manual',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });

  it('rejects unparseable share text without writing anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({ shareText: 'garbled nonsense' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/share text/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('stores a raw final score with empty category scores', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({ finalScore: 294 }));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 294,
        category_scores: {},
        comment_text: null,
        raw_share_text: 'Manual entry: 294',
        parse_status: 'ok',
        entry_method: 'manual',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });

  it('rejects an out-of-range raw score without writing anything', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({ finalScore: 1000 }));

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed JSON body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(
      new Request('http://localhost/api/scores/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      })
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 when neither shareText nor finalScore is provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });

    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
