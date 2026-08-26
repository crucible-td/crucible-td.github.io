import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src/campaign.ts';
import { parseLoadout } from '../src/sim/loadout.ts';

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
const PLAN = parseLoadout(
  readFileSync(new URL('../.claude/skills/balance-pass/reference/plan.txt', import.meta.url), 'utf8'),
);

describe('reference campaign', () => {
  it('is winnable while paying for every tower', () => {
    const r = runCampaign(PLAN, 1, 20000);
    expect(r.won).toBe(true);
    expect(r.wavesCleared).toBe(10);
    expect(r.livesLeft).toBe(12);
  });

  it('wins on every seed tried, not just the lucky one', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = runCampaign(PLAN, seed, 20000);
      expect(r.won, `seed ${seed} lost on wave ${r.wavesCleared + 1}`).toBe(true);
    }
  });

  it('does not strand wave 4 as Vapor when a lone Vat meets Molten', () => {
    // Wave 4 is all Molten and affords exactly one tower. MOLTEN/SOLVENT used
    // to yield VAPOR, so the Vat the opening economy teaches converted the
    // whole wave into the fastest, most expensive state in the game and could
    // not finish it -- two Vats dissolve a Vapor, and wave 4 only ever affords
    // one. Quenching to SLAG instead leaves it killable by the Stamps the
    // player already owns. A regression here is that trap coming back.
    const wave4 = runCampaign(PLAN, 1, 20000).waves.find((w) => w.wave === 4);
    expect(wave4?.leaksByState.VAPOR).toBe(0);
    expect(wave4?.livesLost).toBe(0);
  });

  it('stays tense to the end instead of being decided by wave 7', () => {
    // Roughly half the life bar spent, all of it in the back third. Waves 1-7
    // clean and waves 8-10 biting is the shape; if lives start drifting back
    // toward 20 the difficulty has quietly drained away again, and the cause
    // is almost always ECONOMY.waveClearBonus funding too much board.
    const r = runCampaign(PLAN, 1, 20000);
    const early = r.waves.filter((w) => w.wave <= 7).reduce((n, w) => n + w.livesLost, 0);
    const late = r.waves.filter((w) => w.wave >= 8).reduce((n, w) => n + w.livesLost, 0);
    expect(early).toBeLessThanOrEqual(1);
    expect(late).toBeGreaterThanOrEqual(5);
  });

  it('runs out of waves rather than gold, so the economy is not overpaying', () => {
    // Previously this ended with 924 gold and nothing left to buy. Some slack
    // is fine -- the plan outlasting the run is healthy -- but a large figure
    // here means the late economy pays for board the player cannot place.
    const r = runCampaign(PLAN, 1, 20000);
    expect(r.planRemaining).toBe(3);
    expect(r.goldLeft).toBeLessThan(500);
  });
});
