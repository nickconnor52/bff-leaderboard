import { describe, it, expect } from 'vitest';
import { parseShareText, parseManualScore } from './parser';

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

describe('parseManualScore', () => {
  it('parses a valid 1-3 digit score', () => {
    expect(parseManualScore('294')).toBe(294);
    expect(parseManualScore('7')).toBe(7);
    expect(parseManualScore('0')).toBe(0);
  });

  it('trims surrounding whitespace', () => {
    expect(parseManualScore('  294  ')).toBe(294);
  });

  it('returns null for non-numeric input', () => {
    expect(parseManualScore('abc')).toBeNull();
    expect(parseManualScore('')).toBeNull();
  });

  it('returns null for values over 999', () => {
    expect(parseManualScore('1000')).toBeNull();
  });

  it('returns null for negative numbers', () => {
    expect(parseManualScore('-5')).toBeNull();
  });
});
