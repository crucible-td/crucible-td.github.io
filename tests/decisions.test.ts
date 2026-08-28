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
  endOverlay,
  towerForKey,
  panelKey,
  rate,
  roundHint,
  waveLabel,
} from '../src/render/decisions.ts';
import { TOWERS, TOWER_IDS } from '../src/sim/towers.ts';
import { UPGRADES } from '../src/sim/upgrades.ts';
import { ELEMENT_IDS } from '../src/sim/types.ts';
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

  it('prints multipliers plainly', () => {
    expect(describeMultiplier(1)).toBe('×1');
    expect(describeMultiplier(2)).toBe('×2');
    expect(describeMultiplier(1.6)).toBe('×1.6');
  });

  it('names elements in prose case', () => {
    expect(elementLabel('HEAT')).toBe('Heat');
    expect(elementLabel('SOLVENT')).toBe('Solvent');
  });

  it('leads with the new behaviour and puts the old one in brackets', () => {
    const [line] = describeOverrides('kiln1');
    expect(line).toContain('Molten + Heat');
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
    expect(describeRiderGains('recl3')).toEqual(['Crystal can now be corroded too']);
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
