export interface ParsedScore {
  finalScore: number;
  categoryScores: Record<string, number>;
  commentText: string | null;
}

const CATEGORY_PAIR_RE = /(\d+)(\p{Emoji_Presentation})/gu;
const FINAL_SCORE_RE = /Final score:\s*(\d+)/i;

export function parseShareText(rawText: string): ParsedScore | null {
  const finalScoreMatch = rawText.match(FINAL_SCORE_RE);
  if (!finalScoreMatch || finalScoreMatch.index === undefined) return null;

  const beforeFinalScore = rawText.slice(0, finalScoreMatch.index);
  const categoryScores: Record<string, number> = {};
  for (const pair of beforeFinalScore.matchAll(CATEGORY_PAIR_RE)) {
    categoryScores[pair[2]] = parseInt(pair[1], 10);
  }

  if (Object.keys(categoryScores).length === 0) return null;

  const finalScore = parseInt(finalScoreMatch[1], 10);
  const afterFinalScore = rawText
    .slice(finalScoreMatch.index + finalScoreMatch[0].length)
    .trim();

  return {
    finalScore,
    categoryScores,
    commentText: afterFinalScore.length > 0 ? afterFinalScore : null,
  };
}

export function parseManualScore(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return parseInt(trimmed, 10);
}
