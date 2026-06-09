import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockSingle = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: mockSingle }) }) };
      }
      return { upsert: mockUpsert };
    },
  }),
}));

function makeRequest(body: unknown, token?: string): Request {
  return new Request('http://localhost/api/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ingest', () => {
  beforeEach(() => {
    mockSingle.mockReset();
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('rejects requests with no token', async () => {
    const response = await POST(makeRequest({ text: 'hello' }));
    expect(response.status).toBe(401);
  });

  it('rejects requests with an unrecognized token', async () => {
    mockSingle.mockResolvedValue({ data: null });

    const response = await POST(makeRequest({ text: 'hello' }, 'bad-token'));

    expect(response.status).toBe(401);
  });

  it('parses recognizable share text and stores it as ok', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'user-123' } });
    const text =
      'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744\n\nDamn, tough one';

    const response = await POST(makeRequest({ text }, 'good-token'));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 744,
        category_scores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
        comment_text: 'Damn, tough one',
        raw_share_text: text,
        parse_status: 'ok',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });

  it('stores unrecognizable text as needs_review instead of rejecting it', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'user-123' } });

    const response = await POST(makeRequest({ text: 'garbled nonsense' }, 'good-token'));

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-123',
        final_score: 0,
        raw_share_text: 'garbled nonsense',
        parse_status: 'needs_review',
      }),
      { onConflict: 'user_id,play_date' }
    );
  });
});
