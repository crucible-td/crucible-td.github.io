import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePlan, runCampaign } from '../src/campaign.ts';

/**
 * The reference campaign is the closest thing this project has to "a person
 * played the whole game". `npm run sim` can only prove a wave is survivable
 * with free towers and a fresh twenty lives; these assertions prove the ten
 * waves are beatable by a player who has to pay for every tower and carries
 * their damage forward.
 *
 * If a tuning change moves these numbers, that is not automatically wrong --
 * but it is never incidental, so update them deliberately and say why.
 */
const PLAN = parsePlan(
  readFileSync(new URL('../.claude/skills/balance-pass/reference/plan.txt', import.meta.url), 'utf8'),
);

describe('reference campaign', () => {
  it('is winnable while paying for every tower', () => {
    const r = runCampaign(PLAN, 1, 20000);
    expect(r.won).toBe(true);
    expect(r.wavesCleared).toBe(10);
    expect(r.livesLeft).toBe(14);
  });

  it('wins on every seed tried, not just the lucky one', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = runCampaign(PLAN, seed, 20000);
      expect(r.won, `seed ${seed} lost on wave ${r.wavesCleared + 1}`).toBe(true);
    }
  });

  it('loses its lives to Vapor on wave 4, where a Vat meets Molten', () => {
    // MOLTEN/SOLVENT yields VAPOR, so the second Vat upgrades wave 4's Molten
    // into the most expensive state in the game. This is the intended cost of
    // the opening the economy is built around -- if it ever moves, the Vat's
    // role in the early game has changed.
    const wave4 = runCampaign(PLAN, 1, 20000).waves.find((w) => w.wave === 4);
    expect(wave4?.leaksByState.VAPOR).toBe(2);
    expect(wave4?.livesLost).toBe(6);
  });

  it('finishes with gold it could not spend, showing the late economy overpays', () => {
    const r = runCampaign(PLAN, 1, 20000);
    expect(r.planRemaining).toBe(0);
    expect(r.goldLeft).toBeGreaterThan(500);
  });
});
