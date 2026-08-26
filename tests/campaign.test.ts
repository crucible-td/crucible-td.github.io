import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src/campaign.ts';
import { parseLoadout } from '../src/sim/loadout.ts';

/**
 * The reference campaign is the closest thing this project has to "a person
 * played the whole game". `npm run sim` can only prove a round is survivable
 * with free towers and a fresh twenty lives; these assertions prove the ten
 * rounds are beatable by a player who has to pay for every tower and carries
 * their damage forward.
 *
 * If a tuning change moves these numbers, that is not automatically wrong --
 * but it is never incidental, so update them deliberately and say why.
 */
const PLAN = parseLoadout(
  readFileSync(new URL('../.claude/skills/balance-pass/reference/plan.txt', import.meta.url), 'utf8'),
);

describe('reference campaign', () => {
  it('is winnable while paying for every tower', () => {
    const r = runCampaign(PLAN, 1, 20000);
    expect(r.won).toBe(true);
    expect(r.wavesCleared).toBe(10);
    expect(r.livesLeft).toBe(10);
  });

  it('wins on every seed tried, not just the lucky one', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = runCampaign(PLAN, seed, 20000);
      expect(r.won, `seed ${seed} lost on round ${r.wavesCleared + 1}`).toBe(true);
    }
  });

  it('uses all five towers, because a reference build should', () => {
    // v1's measured-optimal build contained no Vats at all, which was the
    // first hard evidence that a quarter of the roster was decoration. A
    // reference plan that quietly drops a tower is a warning sign, not a
    // detail.
    const used = new Set(PLAN.map((p) => p.def));
    expect(used.size).toBe(5);
  });

  it('stays tense to the end instead of being decided by round 7', () => {
    // All the damage in the back third, none before it. Rounds 1-8 clean and
    // 9-10 biting is the shape; if lives start drifting back toward 20 the
    // difficulty has drained away, and ECONOMY.roundClearBonus is the dial.
    const r = runCampaign(PLAN, 1, 20000);
    const early = r.waves.filter((w) => w.wave <= 7).reduce((n, w) => n + w.livesLost, 0);
    const late = r.waves.filter((w) => w.wave >= 8).reduce((n, w) => n + w.livesLost, 0);
    expect(early).toBe(0);
    expect(late).toBeGreaterThanOrEqual(5);
  });

  it('wastes almost no shots, because the build covers every layer', () => {
    // Wasted shots are hits landing on something immune to them. A reference
    // build should have an answer to everything it meets; a large number here
    // means the plan has a hole a real player would feel.
    const r = runCampaign(PLAN, 1, 20000);
    const wasted = r.waves.reduce((n, w) => n + w.wasted, 0);
    const breaks = r.waves.reduce((n, w) => n + w.breaks, 0);
    expect(wasted / breaks).toBeLessThan(0.05);
  });
});
