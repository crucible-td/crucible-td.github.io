import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCampaign } from '../src/campaign.ts';
import { breadthPlan, depthPlan, laneCells } from '../src/diversity.ts';
import { parseLoadout } from '../src/sim/loadout.ts';
import { TOWERS } from '../src/sim/towers.ts';
import { UPGRADES, chainCost } from '../src/sim/upgrades.ts';
import type { TowerId } from '../src/sim/types.ts';

/**
 * Breadth versus depth: is an upgrade ever worth buying?
 *
 * This file exists because of a hole nothing else could see. `npm run
 * diversity` reported 124 winning builds and no mandatory tower while the game
 * had exactly one right answer -- buy towers, never upgrade -- because the
 * meter only ever varies *which* towers. It holds the slot count at eighteen
 * and gives every tower a tier-3 intent, so every build it samples is a depth
 * build. How many towers, and whether to upgrade at all, was an axis it had
 * never tested.
 *
 * A playtest found it instead: forty towers, no upgrades, all twenty rounds
 * cleared with 19 of 20 lives and 2632 gold spare. The cause was arithmetic --
 * a tower is a linear unit of power at a flat price and an upgrade multiplies
 * one capped tower for several times that price -- so no difficulty setting
 * could fix it. Raising toughness scales the requirement for both builds
 * equally and kills the smaller board first.
 *
 * What fixed it was making tiers worth their price and shaping the pressure
 * around *when* each build's power arrives. These assertions are what stop
 * that quietly reverting: the economy is easy to tune back into a state where
 * thirty tiers exist and nobody should buy any of them.
 */

const REFERENCE = parseLoadout(
  readFileSync(new URL('../.claude/skills/balance-pass/reference/plan.txt', import.meta.url), 'utf8'),
);

/** Stamp and Vat between them have no shared wall, which is what made this the
 *  strongest board to build wide: Kinetic's only immunity is Vapor, which
 *  Solvent specialises in, and Solvent's is Crystal, which Kinetic specialises
 *  in. Every layer is covered without a single upgrade. */
const WIDEST: Parameters<typeof breadthPlan>[1] = ['stamp', 'vat'];

function play(plan: string) {
  return runCampaign(parseLoadout(plan), 1, 20000, 20);
}

describe('a board that never upgrades', () => {
  // Every size a player could actually reach. 40 is what the playtest built;
  // the larger ones are there because "just buy more" was the obvious reply,
  // and the board runs out of lane-adjacent cells and gold before it runs out
  // of that idea.
  for (const count of [40, 55, 70, 90]) {
    it(`loses the campaign with ${count} towers and no upgrades`, () => {
      const r = play(breadthPlan(count, WIDEST));
      expect(r.upgradesBought).toBe(0);
      expect(r.won, `${count} bare towers cleared all 20 rounds with ${r.livesLeft} lives`).toBe(false);
    });
  }

  it('cannot escape by filling every cell on the board', () => {
    // The ceiling, so the property is not merely true at the sizes sampled
    // above. There are 103 buildable cells within reach of the lane, and gold
    // runs out before they do.
    const r = play(breadthPlan(laneCells().length, WIDEST));
    expect(r.won).toBe(false);
  });
});

describe('the same board, upgraded', () => {
  it('gets further than the bare board of equal size, on every seed', () => {
    // The comparison the whole change is about: identical towers in identical
    // positions, differing only in what the gold was spent on.
    //
    // Stated as distance rather than as an outright win, and across three
    // compositions and three seeds rather than one of each. It used to assert
    // that a stamp+vat board won on seed 1, and that held partly because a
    // splash walked the live charge array and cleared cascades it had just
    // created -- the strongest 18-tower depth board in the game was drawing
    // eight lives from a defect. Fixing that left the old assertion resting on
    // the single board and the single seed where the bug paid best.
    //
    // Depth beating breadth pound for pound is the property. Winning outright
    // at eighteen towers was only ever the witness that happened to be handy,
    // and the reference plan below carries that half on every seed.
    const comps: TowerId[][] = [
      ['stamp', 'vat'],
      ['stamp', 'chiller'],
      ['forge', 'stamp', 'vat'],
    ];
    for (const comp of comps) {
      for (const seed of [1, 2, 3]) {
        const where = `${comp.join('+')} seed ${seed}`;
        const bare = runCampaign(parseLoadout(breadthPlan(18, comp)), seed, 20000, 20);
        const climbed = runCampaign(parseLoadout(depthPlan(18, comp)), seed, 20000, 20);

        expect(bare.won, `${where}: a bare board won`).toBe(false);
        expect(bare.upgradesBought, where).toBe(0);
        // How many tiers a climbed board manages varies with how far it gets,
        // since it buys them out of gold the later rounds pay for: 16 on the
        // run that dies at round 14, 49 on the one that reaches 19. The floor
        // is only here to prove the plan really is the depth twin.
        expect(climbed.upgradesBought, where).toBeGreaterThan(10);
        expect(
          climbed.wavesCleared,
          `${where}: climbed cleared ${climbed.wavesCleared}, bare cleared ${bare.wavesCleared}`,
        ).toBeGreaterThan(bare.wavesCleared);
      }
    }
  });

  it('is what the reference plan does, and it clears the campaign', () => {
    const r = runCampaign(REFERENCE, 1, 20000, 20);
    expect(r.won).toBe(true);
    // The plan names a path for all eighteen towers. It used to name eight,
    // and under the current tuning that plan loses on round 18 -- which is the
    // clearest single statement that upgrades stopped being optional.
    expect(r.upgradesBought).toBeGreaterThanOrEqual(40);
  });
});

describe('the price of a tier against the towers it displaces', () => {
  it('buys more damage than the same gold spent on more towers', () => {
    // The measurement that diagnosed the problem, kept as an assertion so the
    // diagnosis cannot silently stop being true. Before the fix this ratio was
    // 0.23 -- a tier bought less than a quarter of what its price in towers
    // did, against the tier's own best target.
    const stamp = TOWERS.stamp;
    const bareDps = (stamp.damage / stamp.cooldown) * 60 * 2.0; // Crystal is x2.0 to Kinetic
    const cost = chainCost('die3');
    const upgraded =
      (UPGRADES.die3.stats!.damage! / stamp.cooldown) * 60 * UPGRADES.die3.overrides!.CRYSTAL!.KINETIC!;

    const gainedByUpgrading = upgraded - bareDps;
    const gainedBySpreading = (cost / stamp.cost) * bareDps;

    expect(gainedByUpgrading).toBeGreaterThan(gainedBySpreading);
  });
});
