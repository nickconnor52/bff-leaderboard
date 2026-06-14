import type { RankingConfig } from './types';

/**
 * Pre-calibration defaults. The live values are stored in the `ranking_config` table
 * and tuned by `scripts/ranking/calibrate.mjs` (Task 10). bandWidth=100 over 18 rungs
 * spans 1800 rating points above ladderFloor.
 */
export const DEFAULT_CONFIG: RankingConfig = {
  curveScale: 25,
  kFactor: 10,
  dScale: 200,
  dailyWeight: 1,
  weeklyWeight: 3,
  eventMultiplier: 1,
  bandWidth: 100,
  ladderFloor: 0,
  startRating: 800, // ~Silver I to start; calibration will adjust
  promoPlace: 3,
  shieldDays: 1,
};
