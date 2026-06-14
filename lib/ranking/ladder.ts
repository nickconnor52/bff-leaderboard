import type { LadderState, RankingConfig, Standing } from './types';
import { RUNG_COUNT } from './types';

export function rungForRating(rating: number, config: RankingConfig): number {
  const raw = Math.floor((rating - config.ladderFloor) / config.bandWidth);
  return Math.min(RUNG_COUNT - 1, Math.max(0, raw));
}

export function initialState(config: RankingConfig): LadderState {
  return {
    rating: config.startRating,
    displayedRung: rungForRating(config.startRating, config),
    promoPending: false,
    shieldActive: false,
    shieldCount: 0,
  };
}

function ladderTop(config: RankingConfig): number {
  // Just below the very top so rungForRating stays at 17.
  return config.ladderFloor + RUNG_COUNT * config.bandWidth - 1e-9;
}

function promoQualifies(place: number, fieldSize: number, config: RankingConfig): boolean {
  return place <= Math.max(1, Math.min(config.promoPlace, fieldSize - 1));
}

/**
 * Apply one event's delta to a player's ladder state. The rating floats freely (clamped to
 * the ladder); displayedRung is gated so it only rises via a promo win and only falls past
 * the shield — realizing the spec's "hold at boundary" promo/shield rules.
 */
export function applyEvent(
  state: LadderState,
  delta: number,
  place: number,
  fieldSize: number,
  config: RankingConfig,
  canPromote = true // false for weekly events: they can push you to a cap but never advance
): LadderState {
  let rating = Math.min(ladderTop(config), Math.max(config.ladderFloor, state.rating + delta));
  const natural = rungForRating(rating, config);
  let { displayedRung, promoPending, shieldActive } = state;
  let shieldCount = state.shieldCount ?? 0;

  if (natural > displayedRung) {
    shieldActive = false;
    shieldCount = 0;
    if (promoPending) {
      if (canPromote && promoQualifies(place, fieldSize, config)) {
        displayedRung += 1;
        promoPending = rungForRating(rating, config) > displayedRung; // more to climb -> re-pend
      }
      // else: failed/ineligible promo, stay pending
    } else {
      promoPending = true;
    }
  } else if (natural < displayedRung) {
    promoPending = false;
    const used = shieldCount;
    if (used < config.shieldDays) {
      // Protect: hold rating at the division floor while shielded.
      shieldActive = true;
      shieldCount = used + 1;
      rating = config.ladderFloor + displayedRung * config.bandWidth;
    } else {
      // Shield exhausted: demote, and the rating floats down as today.
      displayedRung -= 1;
      shieldActive = false;
      shieldCount = 0;
    }
  } else {
    promoPending = false;
    shieldActive = false;
    shieldCount = 0;
  }

  return { rating, displayedRung, promoPending, shieldActive, shieldCount };
}

export function deriveStanding(
  userId: string,
  state: LadderState,
  championCount: number,
  config: RankingConfig
): Standing {
  const rung = state.displayedRung;
  const tier = Math.floor(rung / 3);
  const division = (rung % 3) + 1;
  let lp: number;
  if (state.promoPending) lp = 100;
  else if (state.shieldActive) lp = 0;
  else {
    const within = ((state.rating - (config.ladderFloor + rung * config.bandWidth)) / config.bandWidth) * 100;
    lp = Math.round(Math.min(100, Math.max(0, within)));
  }
  return {
    userId,
    rating: state.rating,
    tier,
    division,
    lp,
    promoPending: state.promoPending,
    shieldActive: state.shieldActive,
    championCount,
  };
}
