import { describe, it, expect } from 'vitest';
import { parseShareText } from './parser';

describe('parseShareText', () => {
  it('parses a full share with category scores and a trailing comment', () => {
    const input =
      'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744\n\nDamn, tough one';

    expect(parseShareText(input)).toEqual({
      finalScore: 744,
      categoryScores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
      commentText: 'Damn, tough one',
    });
  });

  it('parses a share with no trailing comment', () => {
    const input = 'www.maptap.gg June 799🔥 96🏅 66🙃 89🎉 50🫣Final score: 744';

    expect(parseShareText(input)).toEqual({
      finalScore: 744,
      categoryScores: { '🔥': 799, '🏅': 96, '🙃': 66, '🎉': 89, '🫣': 50 },
      commentText: null,
    });
  });

  it('returns null when the text has no recognizable "Final score" or category pairs', () => {
    expect(parseShareText('744')).toBeNull();
    expect(parseShareText('garbled nonsense')).toBeNull();
  });

  it('returns null when there is a final score but no category pairs', () => {
    expect(parseShareText('Final score: 744')).toBeNull();
  });
});
