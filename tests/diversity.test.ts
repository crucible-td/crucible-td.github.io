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
 * The sample is deliberately large, and it has to be: "no tower appears in
 * every winner" only means anything with enough winners for "every" to carry
 * weight. At 120 builds this reported the Vat as mandatory, and a hand-built
 * Vat-free board then cleared all twenty rounds with 18 of 20 lives -- the
 * finding was an artifact of an under-powered sample, not a fact about the
 * game. Random compositions are mostly bad ones, so it takes a lot of them to
 * turn up enough good builds to generalise from.
 *
 * Raised from 240 to 720 when riders landed, for the same reason and with the
 * same evidence. At 240 the verdict rested on a single build: the tuning
 * before riders produced exactly one Vat-free winner out of 34, and the tuning
 * after produced none out of 34 -- a pass and a fail separated by one sample,
 * from a change that moved the Vat's presence among winners not at all (99%
 * at 960 builds, before and after). A hand-built Vat-free board clears all
 * twenty rounds with 9 of 20 lives under this tuning, which is the direct
 * evidence the meter was too coarse to see. 720 is where the verdict stops
 * flipping. It makes this the slowest file in the suite by a wide margin --
 * three times the sample, each campaign running longer in ticks now that
 * chilled charges walk slower -- which is exactly why the per-edit hook runs
 * `npm run test:fast` and leaves this suite to `npm test` and to CI.
 */
const AUTHORITATIVE_SAMPLE = 720;

/**
 * The sample can be lowered for a faster local run, and only for that.
 *
 * `CRUCIBLE_DIVERSITY_SAMPLE=120 npx vitest run` turns a fifty-second suite
 * into a five-second one, which is the difference between a check that gets
 * run during a balance edit and one that does not. The default stays
 * authoritative, so forgetting the variable gives the slow correct answer
 * rather than a fast wrong one, and CI -- which sets nothing -- always
 * measures at full strength.
 *
 * The two assertions that are artifacts at a small sample do not run in that
 * mode. This is not squeamishness: at 120 builds this file reported the Vat as
 * mandatory on a game where a hand-built Vat-free board cleared all twenty
 * rounds. Asserting it anyway would fail a healthy game, and a suite that
 * cries wolf under its own documented conditions is worse than one that says
 * plainly it did not look.
 */
const SAMPLE = Number(process.env.CRUCIBLE_DIVERSITY_SAMPLE ?? AUTHORITATIVE_SAMPLE);
const UNDER_SAMPLED = SAMPLE < AUTHORITATIVE_SAMPLE;

if (UNDER_SAMPLED) {
  console.warn(
    `\n  diversity: sampling ${SAMPLE} builds, not ${AUTHORITATIVE_SAMPLE}.` +
      `\n  NOT AUTHORITATIVE -- the mandatory-tower and per-tower-usefulness` +
      `\n  verdicts are skipped. Run npm test with no environment override` +
      `\n  before believing anything about build diversity.\n`,
  );
}

const REPORT = runDiversity({ slots: 18, sample: SAMPLE, seed: 1, rounds: 20 });

/** Winner counts are absolute, so the floor has to move with the sample. */
const MIN_WINNERS = Math.max(3, Math.round(15 * (SAMPLE / AUTHORITATIVE_SAMPLE)));

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
    expect(REPORT.winners.length, `sample ${SAMPLE}`).toBeGreaterThanOrEqual(MIN_WINNERS);
  });

  it.skipIf(UNDER_SAMPLED)('makes no tower mandatory', () => {
    // The direct detector for the defect this whole version exists to fix. If
    // a tower shows up in every winning build, the game has a right answer
    // again, whatever the difficulty numbers say.
    //
    // Skipped below the authoritative sample: this is the assertion that
    // reported a false positive at 120 builds, and the header comment explains
    // why running it anyway would be worse than not running it.
    expect(REPORT.mustBuild, `mandatory: ${REPORT.mustBuild.join(', ')}`).toEqual([]);
  });

  it.skipIf(UNDER_SAMPLED)('keeps every tower genuinely useful', () => {
    // The opposite failure: a tower nobody wants. v1's Vat appeared in none of
    // the builds worth making, which made it decoration rather than a choice.
    //
    // Also sample-sensitive: a presence ratio taken over ten winners moves in
    // tenths, so a healthy tower can dip under the floor by chance alone.
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
