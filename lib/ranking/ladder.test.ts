import { describe, it, expect } from 'vitest';
import { rungForRating, deriveStanding, applyEvent } from './ladder';
import { DEFAULT_CONFIG } from './config';
import type { LadderState } from './types';

const C = DEFAULT_CONFIG; // bandWidth 100, floor 0 -> rung = floor(rating/100), 0..17

describe('rungForRating', () => {
  it('maps rating to a clamped 0..17 rung', () => {
    expect(rungForRating(0, C)).toBe(0);
    expect(rungForRating(150, C)).toBe(1);
    expect(rungForRating(99999, C)).toBe(17);
    expect(rungForRating(-50, C)).toBe(0);
  });
});

describe('deriveStanding', () => {
  it('derives tier/division/lp from a settled state', () => {
    const s: LadderState = { rating: 1740, displayedRung: 17, promoPending: false, shieldActive: false };
    const out = deriveStanding('u', s, 0, C);
    expect(out.tier).toBe(5);     // Diamond
    expect(out.division).toBe(3); // III
    expect(out.lp).toBe(40);      // (1740-1700)/100
  });
  it('shows LP 100 while promo pending and 0 while shielded', () => {
    expect(deriveStanding('u', { rating: 500, displayedRung: 4, promoPending: true, shieldActive: false }, 0, C).lp).toBe(100);
    expect(deriveStanding('u', { rating: 500, displayedRung: 6, promoPending: false, shieldActive: true }, 0, C).lp).toBe(0);
  });
});

describe('applyEvent — promotion', () => {
  it('does not cross up on first reach; enters promo pending', () => {
    const start: LadderState = { rating: 195, displayedRung: 1, promoPending: false, shieldActive: false };
    const next = applyEvent(start, 20, 1, 7, C); // rating -> 215, natural rung 2 > displayed 1
    expect(next.displayedRung).toBe(1);
    expect(next.promoPending).toBe(true);
  });
  it('promotes on a top-3 day while pending', () => {
    const pending: LadderState = { rating: 215, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, 5, 2, 7, C); // place 2 <= 3
    expect(next.displayedRung).toBe(2);
    expect(next.promoPending).toBe(false);
  });
  it('stays pending on a non-top-3 day', () => {
    const pending: LadderState = { rating: 215, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, 3, 5, 7, C); // place 5 > 3
    expect(next.displayedRung).toBe(1);
    expect(next.promoPending).toBe(true);
  });
  it('cancels pending when a loss drops back into the division', () => {
    const pending: LadderState = { rating: 205, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, -20, 6, 7, C); // rating 185 -> natural rung 1 == displayed
    expect(next.promoPending).toBe(false);
    expect(next.displayedRung).toBe(1);
  });
  it('does not advance on a weekly event even with a qualifying place (canPromote=false)', () => {
    const pending: LadderState = { rating: 215, displayedRung: 1, promoPending: true, shieldActive: false };
    const next = applyEvent(pending, 5, 1, 7, C, false); // place 1 but weekly -> no advance
    expect(next.displayedRung).toBe(1);
    expect(next.promoPending).toBe(true);
  });
});

describe('applyEvent — demotion shield', () => {
  it('shields the first drop below the division floor', () => {
    const start: LadderState = { rating: 205, displayedRung: 2, promoPending: false, shieldActive: false };
    const next = applyEvent(start, -20, 6, 7, C); // rating 185 -> natural 1 < displayed 2
    expect(next.displayedRung).toBe(2);
    expect(next.shieldActive).toBe(true);
  });
  it('demotes on a second drop while shielded', () => {
    const shielded: LadderState = {
      rating: 200,
      displayedRung: 2,
      promoPending: false,
      shieldActive: true,
      shieldCount: 1,
    };
    const next = applyEvent(shielded, -20, 6, 7, C); // rating 180 still natural 1 < 2
    expect(next.displayedRung).toBe(1);
  });
  it('clears the shield on a recovering gain', () => {
    const shielded: LadderState = { rating: 185, displayedRung: 2, promoPending: false, shieldActive: true };
    const next = applyEvent(shielded, 30, 1, 7, C); // rating 215 -> natural 2 == displayed
    expect(next.shieldActive).toBe(false);
  });
  it('a gain never demotes a shielded player; clears the shield instead', () => {
    // Engage the shield via a loss from a settled in-band state.
    const start: LadderState = { rating: 205, displayedRung: 2, promoPending: false, shieldActive: false };
    const shielded = applyEvent(start, -20, 6, 7, C); // rating 185 -> natural 1 < displayed 2, shield engages
    expect(shielded.shieldActive).toBe(true);
    expect(shielded.displayedRung).toBe(2);
    expect(shielded.rating).toBe(200); // clamped to division floor while shielded

    // A small qualifying gain should clear the shield without demoting.
    const next = applyEvent(shielded, 5, 1, 7, C); // rating 205 -> natural 2 == displayed
    expect(next.displayedRung).toBe(2);
    expect(next.shieldActive).toBe(false);
  });
  it('wires shieldDays: protects for N consecutive demotion-events before demoting', () => {
    const config = { ...C, shieldDays: 2 };
    const start: LadderState = { rating: 205, displayedRung: 2, promoPending: false, shieldActive: false };

    const afterFirstLoss = applyEvent(start, -20, 6, 7, config); // rating -> 185, natural 1 < 2
    expect(afterFirstLoss.displayedRung).toBe(2);
    expect(afterFirstLoss.shieldActive).toBe(true);
    expect(afterFirstLoss.shieldCount).toBe(1);

    const afterSecondLoss = applyEvent(afterFirstLoss, -20, 6, 7, config); // still shielded (used 1 < 2)
    expect(afterSecondLoss.displayedRung).toBe(2);
    expect(afterSecondLoss.shieldActive).toBe(true);
    expect(afterSecondLoss.shieldCount).toBe(2);

    const afterThirdLoss = applyEvent(afterSecondLoss, -20, 6, 7, config); // used 2 >= 2 -> demote
    expect(afterThirdLoss.displayedRung).toBe(1);
    expect(afterThirdLoss.shieldActive).toBe(false);
    expect(afterThirdLoss.shieldCount).toBe(0);
  });
});
