import { describe, expect, it } from 'vitest';
import {
  boardAction,
  cardState,
  armTower,
  describeMultiplier,
  describeOverrides,
  describeRider,
  describeRiderGains,
  describeStats,
  elementLabel,
  barsFor,
  chargeRadius,
  chargeReadout,
  matterKey,
  ownedResistance,
  endOverlay,
  layersRemaining,
  matterRows,
  pickCharge,
  towerForKey,
  panelKey,
  rate,
  roundHint,
  roundPreview,
  statsSnapshot,
  toughnessTier,
  waveLabel,
} from '../src/render/decisions.ts';
import { TOWERS, TOWER_IDS } from '../src/sim/towers.ts';
import { UPGRADES } from '../src/sim/upgrades.ts';
import { RESISTANCE } from '../src/sim/resistance.ts';
import { ELEMENT_IDS, STATES, STATE_IDS } from '../src/sim/types.ts';
import type { Stats } from '../src/sim/types.ts';
import { WAVES } from '../src/sim/waves.ts';

/** A stats block with every field zeroed, for tests that only care about one. */
function zeroStats(): Stats {
  return {
    breaks: 0,
    kills: 0,
    wasted: 0,
    leaks: 0,
    leaksByState: { ORE: 0, SLAG: 0, MOLTEN: 0, CRYSTAL: 0, VAPOR: 0 },
    livesLost: 0,
    goldEarned: 0,
  };
}

/**
 * Presentation is where this project's bugs actually come from. Eight real
 * defects shipped from the interface layer and every one was found by hand in
 * a browser, because the logic lived inside event handlers where no test could
 * reach it.
 *
 * Each case below is named after the bug it would have caught, so the next
 * person to read it knows why the line exists rather than only what it does.
 */
describe('what a click on the board means', () => {
  it('places when a tower is armed and the cell is free', () => {
    expect(boardAction({ selected: true, towerHere: false, buildable: true })).toBe('place');
  });

  it('disarms when you click the tower you just placed', () => {
    // Selection persists after building so a line can be laid in one pass, and
    // the preview is already showing red over an occupied cell -- so the click
    // cannot mean "build". It used to mean nothing at all.
    expect(boardAction({ selected: true, towerHere: true, buildable: false })).toBe('disarm');
  });

  it('disarms when you click the lane, rather than doing nothing', () => {
    // The bug this case exists for: a click on the road fell through to
    // `place`, `placeTower` refused it because the cell is not buildable, and
    // nothing else happened. The tower stayed armed with no feedback and no
    // discoverable way to put it down -- Escape and right-click are neither.
    expect(boardAction({ selected: true, towerHere: false, buildable: false })).toBe('disarm');
  });

  it('disarms on an illegal cell even though no tower stands there', () => {
    // `towerHere` was the only reason to disarm before, so an empty-but-illegal
    // cell was the exact gap. Stated separately from the case above because it
    // is the combination, not the lane as such, that used to fall through.
    const lane = boardAction({ selected: true, towerHere: false, buildable: false });
    const occupied = boardAction({ selected: true, towerHere: true, buildable: true });
    expect(lane).toBe(occupied);
  });

  it('still places on a legal empty cell, so a line can be laid in one pass', () => {
    // Disarming on illegal cells must not cost the persistence that lets a
    // player lay several towers without re-arming between each one.
    expect(boardAction({ selected: true, towerHere: false, buildable: true })).toBe('place');
  });

  it('inspects a placed tower when nothing is armed', () => {
    expect(boardAction({ selected: false, towerHere: true, buildable: false })).toBe('inspect');
  });

  it('closes the panel when clicking bare ground', () => {
    expect(boardAction({ selected: false, towerHere: false, buildable: true })).toBe('close');
  });

  it('closes rather than disarms when the lane is clicked with nothing armed', () => {
    // `buildable` must not leak into the unarmed branch: with no tower held
    // there is nothing to disarm, and an open upgrade panel should still shut.
    expect(boardAction({ selected: false, towerHere: false, buildable: false })).toBe('close');
  });
});

describe('how a build-menu card looks', () => {
  const forge = TOWERS.forge.cost;

  it('stays clickable when it is armed but no longer affordable', () => {
    // The stranded selection: disabling the armed card meant no click event,
    // so the only ways to disarm were Escape or right-click -- neither
    // discoverable. It stays enabled and is dimmed instead.
    const s = cardState({ gold: forge - 1, cost: forge, isSelected: true });
    expect(s.disabled).toBe(false);
    expect(s.unaffordable).toBe(true);
    expect(s.pressed).toBe(true);
  });

  it('disables an unaffordable card that is not armed', () => {
    const s = cardState({ gold: forge - 1, cost: forge, isSelected: false });
    expect(s.disabled).toBe(true);
    expect(s.unaffordable).toBe(true);
  });

  it('is plain and enabled when affordable', () => {
    const s = cardState({ gold: forge, cost: forge, isSelected: false });
    expect(s).toEqual({ pressed: false, disabled: false, unaffordable: false });
  });

  it('treats exactly enough gold as affordable', () => {
    expect(cardState({ gold: forge, cost: forge, isSelected: false }).unaffordable).toBe(false);
  });
});

describe('when the upgrade panel rebuilds', () => {
  it('changes when a different tower is inspected', () => {
    // The panel showed the previously clicked tower: keyed on nothing that
    // moved, it never rebuilt.
    expect(panelKey({ id: 1, upgrades: [] })).not.toBe(panelKey({ id: 2, upgrades: [] }));
  });

  it('changes when a tier is bought on the same tower', () => {
    // Keyed on the tower alone, buying a tier left the panel still offering the
    // tier you had just bought.
    expect(panelKey({ id: 1, upgrades: [] })).not.toBe(panelKey({ id: 1, upgrades: ['kiln1'] }));
    expect(panelKey({ id: 1, upgrades: ['kiln1'] })).not.toBe(
      panelKey({ id: 1, upgrades: ['kiln1', 'kiln2'] }),
    );
  });

  it('stays put when nothing has changed, so the panel is not rebuilt every frame', () => {
    expect(panelKey({ id: 3, upgrades: ['damp1'] })).toBe(panelKey({ id: 3, upgrades: ['damp1'] }));
  });
});

describe('describing the table to the player', () => {
  it('calls a wall a wall rather than printing a zero', () => {
    expect(describeMultiplier(0)).toBe('immune');
  });

  it('counts every layer still under a charge, so the board can show depth', () => {
    // The number the board draws as pips. A Crystal is three creatures deep
    // and a Gas is one, and nothing else on the lane distinguishes them --
    // that is the whole reason this exists.
    expect(layersRemaining('CRYSTAL')).toBe(3);
    expect(layersRemaining('ORE')).toBe(2);
    expect(layersRemaining('MOLTEN')).toBe(2);
    expect(layersRemaining('SLAG')).toBe(1);
    expect(layersRemaining('VAPOR')).toBe(1);
  });

  it('reads the depth off the chain rather than off a list of its own', () => {
    // The failure this guards is a silent one: five numbers written out by
    // hand would keep passing the test above while disagreeing with STATES
    // the moment anyone changed what a layer breaks into.
    for (const state of STATE_IDS) {
      const under = STATES[state].breaksInto;
      const expected = under === null ? 1 : layersRemaining(under) + 1;
      expect(layersRemaining(state), state).toBe(expected);
    }
  });

  it('lists the layers deepest first, so the panel reads as the cascade', () => {
    // Crystal is three creatures deep and heads the list; the two layers that
    // are the end of a chain sink to the bottom, which is where a player looks
    // last. Ties keep STATE_IDS order so a sixth layer cannot make the panel
    // reshuffle itself unpredictably.
    expect(matterRows()).toEqual(['CRYSTAL', 'ORE', 'MOLTEN', 'SLAG', 'VAPOR']);
  });

  it('never puts a shallower layer above a deeper one', () => {
    const depths = matterRows().map(layersRemaining);
    expect([...depths].sort((a, b) => b - a)).toEqual(depths);
  });

  it('draws a cell as bars, and reserves none of them for immunity', () => {
    // Zero is a wall, not an empty meter: "does nothing" is a different kind
    // of fact from "does very little", and the panel draws them differently.
    expect(barsFor(0)).toBe(0);
    expect(barsFor(0.5)).toBe(1);
    expect(barsFor(0.75)).toBe(1);
    expect(barsFor(1)).toBe(2);
    expect(barsFor(1.25)).toBe(2);
    expect(barsFor(1.5)).toBe(3);
    expect(barsFor(1.6)).toBe(3);
    expect(barsFor(2)).toBe(4);
  });

  it('caps an upgraded cell at four bars', () => {
    // die3 takes Crystal + Impact to 3.5. A fifth bar would mean the panel
    // disagreed with itself about what a full meter is.
    expect(barsFor(3.5)).toBe(4);
    expect(barsFor(99)).toBe(4);
  });

  it('picks the charge nearest the pointer, not merely one that contains it', () => {
    // Overlap is the normal case, not an edge case: a Crystal breaks into two
    // Lava at the same point on the lane, so something has to break the tie
    // and it has to break it the same way every frame.
    const targets = [
      { id: 1, x: 100, y: 100, r: 20 },
      { id: 2, x: 108, y: 100, r: 20 },
    ];
    expect(pickCharge(targets, { x: 107, y: 100 })).toBe(2);
    expect(pickCharge(targets, { x: 99, y: 100 })).toBe(1);
  });

  it('picks nothing when the pointer is off every charge', () => {
    const targets = [{ id: 1, x: 100, y: 100, r: 10 }];
    expect(pickCharge(targets, { x: 100, y: 140 })).toBeNull();
    expect(pickCharge([], { x: 100, y: 100 })).toBeNull();
  });

  it('forgives a few pixels, because the small layers are tiny and moving', () => {
    // An Ash is about ten pixels across. Demanding a hit inside that while it
    // walks is asking more of a player than the information is worth.
    const targets = [{ id: 1, x: 100, y: 100, r: 6 }];
    expect(pickCharge(targets, { x: 109, y: 100 })).toBe(1);
    expect(pickCharge(targets, { x: 116, y: 100 })).toBeNull();
  });

  it('sizes a charge the same way the board draws it', () => {
    // The bug this prevents is a charge you can see but cannot point at, and
    // it would grow with toughness -- fine in testing, broken on the bosses.
    expect(chargeRadius('CRYSTAL', 1)).toBeCloseTo(12 * 1.35);
    expect(chargeRadius('CRYSTAL', 4)).toBeCloseTo(12 * 1.35 * 2);
    // Capped at 2.1, and the cap is real rather than cautious: raising it to
    // 2.4 puts a Crystal at 39px of radius on a lane 40px wide, and round 20
    // draws as a solid column. Everything above x4.41 is the same size, which
    // is why toughnessTier exists.
    expect(chargeRadius('CRYSTAL', 100)).toBeCloseTo(12 * 1.35 * 2.1);
    expect(chargeRadius('CRYSTAL', 55)).toBe(chargeRadius('CRYSTAL', 17));
  });

  it('tells a player what beats a layer, strongest answer first', () => {
    const crystal = chargeReadout({ state: 'CRYSTAL', scale: 1 });
    expect(crystal.label).toBe('Crystal');
    expect(crystal.counters.map((c) => c.label)).toEqual(['Impact', 'Heat']);
    expect(crystal.counters[0]!.mult).toBe(2);
    expect(crystal.immunities.map((i) => i.label)).toEqual(['Cold', 'Acid']);
    // Named as the creature: the tag's job here is "a crystal giant cracks
    // and two lava beasts climb out", which a player can picture.
    expect(crystal.breaksInto).toEqual({ state: 'MOLTEN', label: 'lava beast', count: 2 });
  });

  it('offers every layer at least two answers, because the table promises it', () => {
    // Not a property of the readout so much as of the resistance table, but
    // this is where a player would notice it breaking: a layer with one
    // counter is a mandatory tower, which is the failure this game is most
    // afraid of.
    for (const state of STATE_IDS) {
      expect(chargeReadout({ state, scale: 1 }).counters.length, state).toBeGreaterThanOrEqual(2);
    }
  });

  it('quotes the charge\'s real hp, not the layer\'s base, so the tag and the health bar agree', () => {
    // The health bar drawn beside the tag multiplies by scale. The tag used to
    // read straight out of STATES, so on the rounds where toughness is the
    // entire difficulty curve the two disagreed by a factor of fifty-two.
    const base = STATES.CRYSTAL.hp;
    expect(chargeReadout({ state: 'CRYSTAL', scale: 1 }).hp).toBe(base);
    expect(chargeReadout({ state: 'CRYSTAL', scale: 55 }).hp).toBe(Math.round(base * 55));
  });

  it('says a terminal layer is the last one rather than inventing a child', () => {
    expect(chargeReadout({ state: 'SLAG', scale: 1 }).breaksInto).toBeNull();
    expect(chargeReadout({ state: 'VAPOR', scale: 1 }).breaksInto).toBeNull();
    expect(chargeReadout({ state: 'VAPOR', scale: 1 }).floats).toBe(true);
  });

  it('prints multipliers plainly', () => {
    expect(describeMultiplier(1)).toBe('×1');
    expect(describeMultiplier(2)).toBe('×2');
    expect(describeMultiplier(1.6)).toBe('×1.6');
  });

  it('names elements as the player reads them, not as the ids spell them', () => {
    // Two of the four no longer derive from their id, which is the whole
    // reason `elementLabel` stopped being a lowercase of `e`. A regression
    // here shows up as physics vocabulary leaking back into the interface.
    expect(elementLabel('HEAT')).toBe('Heat');
    expect(elementLabel('KINETIC')).toBe('Impact');
    expect(elementLabel('SOLVENT')).toBe('Acid');
  });

  it('leads with the new behaviour and puts the old one in brackets', () => {
    const [line] = describeOverrides('kiln1');
    expect(line).toContain('Lava + Heat');
    expect(line).toContain('was immune');
  });

  it('describes every cell a branch rewrites', () => {
    // prism3 touches three, and a panel that quietly showed one would be
    // selling the player a smaller upgrade than they are paying for.
    expect(describeOverrides('prism3')).toHaveLength(3);
  });

  it('says nothing about cells a purely numeric branch leaves alone', () => {
    expect(describeOverrides('bellows1')).toEqual([]);
  });
});

describe('describing a stat change', () => {
  const base = { damage: 4, range: 92, cooldown: 30, splash: 0 };

  it('compares against what the tower has now, not what it shipped with', () => {
    // Partway up a path the panel must price the *next* tier, not the whole
    // path from the start.
    const midPath = { ...base, cooldown: 22 };
    const [line] = describeStats(midPath, 'bellows2');
    expect(line).toContain(`Damage 4 → ${UPGRADES.bellows2.stats!.damage!}`);
    const rateLine = describeStats(midPath, 'bellows2')[1]!;
    expect(rateLine).toContain(`${rate(22)} → ${rate(UPGRADES.bellows2.stats!.cooldown!)}`);
  });

  it('reports fire rate as shots per second, climbing as the tower improves', () => {
    // A cooldown in ticks falls when the tower gets better, which reads
    // backwards next to damage.
    expect(Number(rate(30))).toBeLessThan(Number(rate(15)));
  });

  it('stays silent about stats the tier does not touch', () => {
    expect(describeStats(base, 'kiln1')).toEqual([]);
    expect(describeStats(base, 'die1').every((l) => l.startsWith('Range'))).toBe(true);
  });

  it('says nothing when a value would not actually change', () => {
    const already = { ...base, range: UPGRADES.die1.stats!.range! };
    expect(describeStats(already, 'die1')).toEqual([]);
  });
});

describe('describeRider', () => {
  it('names the lingering effect for every element, so no tower card is blank', () => {
    for (const e of ELEMENT_IDS) expect(describeRider(e).length).toBeGreaterThan(0);
  });

  it('gives the two Heat towers one line, because the rider belongs to the element', () => {
    expect(describeRider(TOWERS.forge.element)).toBe(describeRider(TOWERS.lens.element));
  });
});

describe('describeRiderGains', () => {
  it('says a wall-lifting tier starts the rider working there too', () => {
    // Absolute Zero does not merely let the Chiller hurt Crystal, it lets the
    // Chiller *slow* Crystal -- the best reason in the game to climb a path,
    // and invisible in the multiplier alone.
    const lines = describeRiderGains('depo3');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Crystal');
    expect(lines[0]).toContain('slowed');
  });

  it('says nothing for a tier that only makes an existing counter stronger', () => {
    // die3 takes Crystal + Kinetic from 2.0 to 3.5. The Stamp was already
    // knocking Crystal back, so there is no news here and printing a line
    // every tier would bury the one that matters.
    expect(describeRiderGains('die3')).toEqual([]);
  });

  it('ignores cells rewritten for an element the tower does not throw', () => {
    // recl3 lifts Crystal + Solvent, which is the Vat's own element -- but it
    // also has to not claim anything about the columns it leaves alone.
    expect(describeRiderGains('recl3')).toEqual(['Crystal can now be eaten away too']);
    expect(describeRiderGains('bellows1')).toEqual([]);
  });
});

describe('towerForKey', () => {
  it('maps the number keys onto the build menu, in menu order', () => {
    // The menu is rendered from TOWER_IDS, so the keys must come from the same
    // place. They used to be a second list written out in a keydown handler.
    TOWER_IDS.forEach((id, i) => {
      expect(towerForKey(String(i + 1))).toBe(id);
    });
  });

  it('follows the roster rather than a hardcoded count', () => {
    // The roster is planned to grow to eight. The key after the last tower must
    // be dead, and the last tower's key must be live, without anyone editing a
    // bound in an event handler.
    expect(towerForKey(String(TOWER_IDS.length))).toBe(TOWER_IDS[TOWER_IDS.length - 1]);
    expect(towerForKey(String(TOWER_IDS.length + 1))).toBeNull();
  });

  it('ignores keys that are not a tower slot', () => {
    for (const key of ['0', 'a', 'Escape', ' ', '', 'F1', '-1']) {
      expect(towerForKey(key), `${key} should select nothing`).toBeNull();
    }
  });
});

describe('armTower', () => {
  it('arms a tower when nothing is held', () => {
    expect(armTower(null, 'forge')).toEqual({ selected: 'forge', closeInspect: true });
  });

  it('swaps straight to another tower', () => {
    expect(armTower('forge', 'vat')).toEqual({ selected: 'vat', closeInspect: true });
  });

  it('disarms when the tower already held is pressed again', () => {
    // The click path always did this and the number key did not, so pressing 2
    // twice left the Chiller armed with no way to notice. Both paths now share
    // this function, which is the point of it existing.
    expect(armTower('chiller', 'chiller')).toEqual({ selected: null, closeInspect: false });
  });

  it('leaves the upgrade panel alone when disarming', () => {
    // Closing the panel is tied to *arming* something, because picking a tower
    // to build is a different intent from inspecting one already built. Letting
    // go of a tower is neither, so it must not shut a panel the player opened.
    expect(armTower('lens', 'lens').closeInspect).toBe(false);
  });
});

describe('waveLabel', () => {
  it('reads N/total for an authored round', () => {
    expect(waveLabel({ waveIndex: 6, freeplay: false })).toBe(`7/${WAVES.length}`);
  });

  it('clamps to the total rather than counting past it', () => {
    expect(waveLabel({ waveIndex: WAVES.length, freeplay: false })).toBe(
      `${WAVES.length}/${WAVES.length}`,
    );
  });

  it('drops the denominator in freeplay, because there is no total to count towards', () => {
    expect(waveLabel({ waveIndex: WAVES.length, freeplay: true })).toBe(`${WAVES.length + 1}+`);
  });
});

describe('roundHint', () => {
  it('names the round and shows the authored wave its own hint, same as it always has', () => {
    expect(roundHint({ waveIndex: 2, freeplay: false })).toBe(`Wave 3: ${WAVES[2]!.hint}`);
  });

  it('names the round in freeplay rather than reading a wave that does not exist', () => {
    // Never call freeplayWave for this: it pulls from the seeded RNG, and
    // spending a roll just to fetch a hint would desync the browser from
    // npm run sim on every frame this runs.
    expect(roundHint({ waveIndex: WAVES.length, freeplay: true })).toBe(
      `Freeplay round ${WAVES.length + 1}. It does not stop.`,
    );
  });

  it('returns an unprefixed empty string when there is no hint to show', () => {
    // An index past the authored rounds with freeplay still false should not
    // happen in play, but it must fail safe rather than printing "Wave N: "
    // with nothing after the colon.
    expect(roundHint({ waveIndex: WAVES.length, freeplay: false })).toBe('');
  });
});

describe('roundPreview', () => {
  it('reads an authored round straight off the wave', () => {
    // Round 4 is the one that teaches Heat does nothing to Lava, and it is a
    // single group, so it is the clearest case to pin.
    expect(roundPreview({ waveIndex: 3, freeplay: false })).toEqual([
      { state: 'MOLTEN', count: 14, hpScale: 1, approx: false },
    ]);
  });

  it('sums groups of the same layer at the same toughness', () => {
    for (let i = 0; i < WAVES.length; i++) {
      const rows = roundPreview({ waveIndex: i, freeplay: false });
      const seen = rows.map((r) => `${r.state}@${Math.round(r.hpScale)}`);
      expect(new Set(seen).size).toBe(seen.length);
      expect(rows.reduce((n, r) => n + r.count, 0)).toBe(
        WAVES[i]!.groups.reduce((n, g) => n + g.count, 0),
      );
    }
  });

  it('keeps a slab apart from the trash walking beside it', () => {
    // The point of showing toughness at all: on the board a x55 Crystal and a
    // x17 Ore are drawn at the same size, so one row for each is the only
    // place a player can see the difference.
    const last = WAVES.length - 1;
    const rows = roundPreview({ waveIndex: last, freeplay: false });
    const scales = rows.map((r) => Math.round(r.hpScale));
    expect(Math.max(...scales)).toBeGreaterThan(Math.min(...scales) * 2);
  });

  it('previews a freeplay round without building one', () => {
    // freeplayWave draws from the seeded RNG; this must not, so it is stable
    // across calls and takes no rng at all.
    const opts = { waveIndex: WAVES.length + 4, freeplay: true };
    const rows = roundPreview(opts);
    expect(rows.length).toBeGreaterThan(0);
    expect(roundPreview(opts)).toEqual(rows);
    // Bulk toughness is jittered at spawn, so it is flagged approximate; the
    // leading slab takes no roll and is exact.
    expect(rows.some((r) => r.approx)).toBe(true);
    expect(rows[0]!.approx).toBe(false);
  });

  it('is empty past the authored rounds when freeplay was never entered', () => {
    expect(roundPreview({ waveIndex: WAVES.length, freeplay: false })).toEqual([]);
  });
});

describe('toughnessTier', () => {
  it('leaves the teaching rounds bare', () => {
    // Rounds 1-4 carry no hpScale at all, and a round that is teaching an
    // immunity should not also be introducing armour.
    expect(toughnessTier(1)).toBe(0);
    expect(toughnessTier(1.08)).toBe(0);
    for (const g of WAVES.slice(0, 4).flatMap((w) => w.groups)) {
      expect(toughnessTier(g.hpScale ?? 1)).toBe(0);
    }
  });

  it('separates round 20 slab from the trash walking beside it', () => {
    // The assertion this whole channel exists for. Both are drawn at the same
    // capped radius, so if these tiers ever match, the board is back to
    // showing the hardest thing in the game as the easiest.
    expect(toughnessTier(55)).toBeGreaterThan(toughnessTier(17));
  });

  it('climbs the campaign in steps rather than all at once', () => {
    expect(toughnessTier(3)).toBe(1);
    expect(toughnessTier(10)).toBe(2);
    expect(toughnessTier(32)).toBe(3);
    expect(toughnessTier(100)).toBe(4);
  });

  it('saturates, because freeplay toughness has no ceiling', () => {
    // freeplayWave compounds hpScale without bound; the ladder must not.
    expect(toughnessTier(500)).toBe(4);
    expect(toughnessTier(50000)).toBe(4);
  });
});

describe('statsSnapshot', () => {
  it('keeps reading what it read after the counters move on', () => {
    // The defect: the dev console handle spread world.stats shallowly, so
    // leaksByState in every reading was the same live object and three
    // readings taken across a session all reported the final numbers.
    const live = zeroStats();
    const early = statsSnapshot(live);

    live.leaks += 2;
    live.leaksByState.CRYSTAL += 2;

    expect(early.leaks).toBe(0);
    expect(early.leaksByState.CRYSTAL).toBe(0);
    expect(statsSnapshot(live).leaksByState.CRYSTAL).toBe(2);
  });

  it('copies the map rather than sharing it, in both directions', () => {
    const live = zeroStats();
    const snap = statsSnapshot(live);
    expect(snap.leaksByState).not.toBe(live.leaksByState);
    // A snapshot is a reading, so scribbling on one must not reach the world.
    snap.leaksByState.ORE = 9;
    expect(live.leaksByState.ORE).toBe(0);
  });
});

describe('endOverlay', () => {
  it('is null while the run has not ended', () => {
    expect(endOverlay({ status: 'idle', waveIndex: 0, stats: zeroStats() })).toBeNull();
    expect(endOverlay({ status: 'running', waveIndex: 0, stats: zeroStats() })).toBeNull();
  });

  it('offers freeplay only on a win', () => {
    const result = endOverlay({ status: 'won', waveIndex: WAVES.length, stats: zeroStats() });
    expect(result?.canContinue).toBe(true);
    expect(result?.title).toBe('Furnace cold');
  });

  it('never offers freeplay on a loss', () => {
    const result = endOverlay({ status: 'lost', waveIndex: 9, stats: zeroStats() });
    expect(result?.canContinue).toBe(false);
    expect(result?.title).toBe('Breach');
  });
});

describe('the Matter panel reads the board, not the shipped game', () => {
  it('reproduces the base table exactly when nothing is placed', () => {
    const owned = ownedResistance([]);
    for (const state of STATE_IDS) {
      for (const e of ELEMENT_IDS) {
        expect(owned[state][e], `${state}/${e}`).toBe(RESISTANCE[state][e]);
      }
    }
  });

  it('lifts a wall the player actually paid to lift', () => {
    // Absolute Zero costs 245 on top of two earlier tiers and takes
    // Crystal/Cold from immune to x1.75. The panel used to go on drawing that
    // cell as a wall, which is the interface denying the most expensive
    // purchase in the game.
    expect(RESISTANCE.CRYSTAL.COLD).toBe(0);
    const owned = ownedResistance([{ def: 'chiller', upgrades: ['depo1', 'depo2', 'depo3'] }]);
    expect(owned.CRYSTAL.COLD).toBe(1.75);
  });

  it('credits an override only to the element the tower actually throws', () => {
    // A tower throws one element. Folding its overrides into any other column
    // would tell the player they own an answer they cannot fire.
    const owned = ownedResistance([{ def: 'forge', upgrades: ['depo1', 'depo2', 'depo3'] }]);
    expect(owned.CRYSTAL.COLD).toBe(RESISTANCE.CRYSTAL.COLD);
  });

  it('keeps the best cell owned, not the last one placed', () => {
    const owned = ownedResistance([
      { def: 'chiller', upgrades: ['depo1', 'depo2', 'depo3'] },
      { def: 'chiller', upgrades: [] },
    ]);
    expect(owned.CRYSTAL.COLD).toBe(1.75);
  });

  it('does not rebuild the panel when towers are merely placed in another order', () => {
    const a = [{ def: 'chiller' as const, upgrades: [] }, { def: 'forge' as const, upgrades: ['kiln1' as const] }];
    expect(matterKey(a)).toBe(matterKey([...a].reverse()));
  });

  it('rebuilds the panel when a tier is bought', () => {
    expect(matterKey([{ def: 'chiller', upgrades: ['depo1'] }])).not.toBe(
      matterKey([{ def: 'chiller', upgrades: ['depo1', 'depo2'] }]),
    );
  });
});
