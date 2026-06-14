export interface RankingConfig {
  curveScale: number;   // base points for 1st (and -this for last)
  kFactor: number;      // Elo surprise weight
  dScale: number;       // logistic rating scale for expected placement
  dailyWeight: number;
  weeklyWeight: number;
  eventMultiplier: number; // global / special-event multiplier
  bandWidth: number;    // rating span of one division
  ladderFloor: number;  // rating at the bottom of Iron I
  startRating: number;  // everyone's rating at the era start
  promoPlace: number;   // best place that counts as a promo win (3)
  shieldDays: number;   // days of demotion protection (1)
}

export interface DayScore {
  userId: string;
  finalScore: number;
}

export interface LadderState {
  rating: number;
  displayedRung: number; // 0..17 (the division actually achieved)
  promoPending: boolean;
  shieldActive: boolean;
  shieldCount?: number; // consecutive shielded demotion-events absorbed; absent/0 = not shielded
}

export interface RatingEvent {
  userId: string;
  kind: 'daily' | 'weekly';
  eventDate: string; // play_date (daily) or week_start (weekly), ISO YYYY-MM-DD
  delta: number;
  rating: number;
  rung: number;
  lp: number;
  promoPending: boolean;
  shieldActive: boolean;
}

export interface Standing {
  userId: string;
  rating: number;
  tier: number;     // 0 Iron .. 5 Diamond
  division: number; // 1 (I, low) .. 3 (III, high)
  lp: number;       // 0..100
  promoPending: boolean;
  shieldActive: boolean;
  championCount: number;
}

export interface WeeklyChampion {
  weekStart: string; // Monday ISO date
  championUserId: string;
  totalScore: number;
}

export const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Emerald'] as const;
export const RUNG_COUNT = 21; // 7 tiers x 3 divisions (Emerald is the top tier)
