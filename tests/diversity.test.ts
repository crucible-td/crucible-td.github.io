import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src/campaign.ts';
import { runDiversity } from '../src/diversity.ts';
import { parseLoadout } from '../src/sim/loadout.ts';
import { TOWER_IDS } from '../src/sim/towers.ts';

/**
 * The three properties this game is judged on.
 *
 * The previous version of Crucible passed every balance check it had -- fair
 * difficulty, every round survivable, a campaign winnable on every seed -- and
 * was still wrong, because there was exactly one build worth making. Being
 * balanced is necessary and not sufficient. These assertions are the
 * difference, and they are the reason `src/diversity.ts` exists at all.
 *
 * Seeded, so a failure here is a real change rather than an unlucky reroll.
 * The sample is deliberately large: "no tower appears in every winner" only
 * means anything when there are enough winners for the word "every" to have
 * weight. At sixty builds the surviving population was small enough that three
 * towers were trivially common to all of them, which says more about the
 * sample than about the game.
 */
const REPORT = runDiversity({ slots: 14, sample: 150, seed: 1 });

describe('build diversity', () => {
  it('lets every single tower survive the opening round', () => {
    // "You should be able to survive round 1 with different towers." Round 1 is
    // bare Ore precisely so that the opening is a preference, not a puzzle.
    for (const t of TOWER_IDS) {
      const r = runCampaign(parseLoadout(`${t}@5,9`), 1, 20000);
      expect(r.wavesCleared, `${t} alone should clear round 1`).toBeGreaterThanOrEqual(1);
    }
  });

  it('has more than one build that clears the whole campaign', () => {
    // Materially different compositions, not permutations of position -- the
    // harness holds the lane slots fixed so that this counts strategies.
    expect(REPORT.distinctWinners).toBeGreaterThanOrEqual(3);
  });

  it('finds enough winners for the mandatory check to mean anything', () => {
    expect(REPORT.winners.length).toBeGreaterThanOrEqual(15);
  });

  it('makes no tower mandatory', () => {
    // The direct detector for the defect this whole version exists to fix. If
    // a tower shows up in every winning build, the game has a right answer
    // again, whatever the difficulty numbers say.
    expect(REPORT.mustBuild, `mandatory: ${REPORT.mustBuild.join(', ')}`).toEqual([]);
  });

  it('keeps every tower genuinely useful', () => {
    // The opposite failure: a tower nobody wants. v1's Vat appeared in none of
    // the builds worth making, which made it decoration rather than a choice.
    for (const t of TOWER_IDS) {
      expect(REPORT.presence[t], `${t} appears in no winning build`).toBeGreaterThan(0.1);
    }
  });

  it('still demands a real build by the end', () => {
    // Plural must not mean trivial: most compositions should fail, or the
    // late rounds are not asking anything of the player.
    const winRate = REPORT.winners.length / REPORT.builds.length;
    expect(winRate).toBeGreaterThan(0.05);
    expect(winRate).toBeLessThan(0.5);
  });
});
