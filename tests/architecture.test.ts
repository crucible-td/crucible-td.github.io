import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The rules the whole project rests on, which until now were held by
 * discipline alone.
 *
 * CLAUDE.md calls the first of these "the one architectural rule": the
 * simulation never imports from the renderer and never touches the DOM. Break
 * it and headless playtesting stops working -- and headless playtesting is the
 * reason every balance claim in this repo is a measurement rather than an
 * opinion. A rule that important should not depend on everyone remembering it.
 *
 * These read the source rather than importing it, so a violation is caught
 * even in a file nothing else pulls in.
 */
const SIM_DIR = new URL('../src/sim/', import.meta.url);

function simFiles(): { name: string; text: string }[] {
  return readdirSync(SIM_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((name) => ({ name, text: readFileSync(new URL(name, SIM_DIR), 'utf8') }));
}

describe('the simulation stays pure', () => {
  it('has files to check, so a bad glob cannot pass this suite silently', () => {
    expect(simFiles().length).toBeGreaterThan(5);
  });

  it('never imports from the renderer', () => {
    for (const { name, text } of simFiles()) {
      const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);
      const offending = imports.filter((i) => i.includes('render'));
      expect(offending, `src/sim/${name} imports ${offending.join(', ')}`).toEqual([]);
    }
  });

  it('never touches the DOM', () => {
    for (const { name, text } of simFiles()) {
      expect(text, `src/sim/${name}`).not.toMatch(/\bdocument\.|window\.|requestAnimationFrame/);
    }
  });

  it('never calls Math.random', () => {
    // rng.ts states this in prose -- "Nothing in src/sim may call
    // Math.random()" -- and prose is not a test. Every random draw has to go
    // through the seeded Rng or the same seed stops producing the same run,
    // which would make every number this project reports meaningless.
    for (const { name, text } of simFiles()) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      expect(code, `src/sim/${name}`).not.toContain('Math.random');
    }
  });
});
