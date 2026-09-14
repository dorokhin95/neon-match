// Верификация фикса placeIce: на каждом уровне льда достаточно для цели,
// а ранее непроходимые уровни (57, 75, 87, 99) решаются beam-search.
import { describe, it, expect } from 'vitest';
import { Engine, goalProgress } from '../src/core/engine';
import { LEVELS, TOTAL_LEVELS } from '../src/core/levels';
import { Rng, hashSeed } from '../src/core/rng';
import type { LevelDef } from '../src/core/types';
import { Power as P } from '../src/core/types';

const BEAM = 10;

function cloneEngine(e: Engine): Engine {
  const c = Object.create(Engine.prototype) as Engine;
  const s = e as unknown as Record<string, unknown>;
  const d = c as unknown as Record<string, unknown>;
  d.level = s.level;
  d.bounds = s.bounds;
  d.mask = s.mask;
  d.grid = (s.grid as { r: number }[][]).map((row) => row.map((g) => (g ? { ...g } : null)));
  d.obj = {
    score: (s.obj as { score: number }).score,
    collected: { ...((s.obj as { collected: Record<string, number> }).collected) },
    ice: (s.obj as { ice: number }).ice,
  };
  d.movesLeft = s.movesLeft;
  d.movesSpent = s.movesSpent;
  d.won = s.won;
  d.nextId = s.nextId;
  const nr = new Rng(0);
  (nr as unknown as { s: number }).s = (s.rng as unknown as { s: number }).s;
  d.rng = nr;
  d.lastObjScoreAtMoveStart = s.lastObjScoreAtMoveStart;
  return c;
}

function countPowers(e: Engine): number {
  let n = 0;
  for (const row of e.grid) for (const g of row) if (g && g.power !== P.None) n++;
  return n;
}

function solve(level: LevelDef): boolean {
  const root = new Engine(level, new Rng(hashSeed(level.n, 0)));
  let beam: Engine[] = [root];
  for (let step = 0; step < level.moves; step++) {
    const children: Array<{ e: Engine; h: number }> = [];
    for (const e of beam) {
      for (const [a, b] of e.findAllValidSwaps()) {
        const c = cloneEngine(e);
        const res = c.tryMove(a, b);
        if (!res.valid) continue;
        if (res.won) return true;
        let h = 0;
        for (const g of c.level.goals) h += goalProgress(c.obj, g) * 100000;
        h += res.score + res.maxCascade * 300 + countPowers(c) * 80 + c.movesLeft * 5;
        children.push({ e: c, h });
      }
    }
    if (children.length === 0) break;
    children.sort((x, y) => y.h - x.h);
    beam = children.slice(0, BEAM).map((x) => x.e);
  }
  return beam.some((e) => e.checkGoals());
}

describe('fix verification', () => {
  it('ice placed >= goal on every level', () => {
    const bad: number[] = [];
    for (let n = 1; n <= TOTAL_LEVELS; n++) {
      const level = LEVELS[n - 1]!;
      const iceGoal = level.goals.find((g) => g.kind === 'ice');
      if (!iceGoal) continue;
      const eng = new Engine(level, new Rng(hashSeed(level.n, 0)));
      let icePlaced = 0;
      for (const row of eng.grid) for (const g of row) if (g) icePlaced += g.ice;
      if (icePlaced < iceGoal.amount) bad.push(n);
    }
    console.log(`ice deficit levels: ${bad.length ? bad.join(', ') : 'NONE'}`);
    expect(bad).toEqual([]);
  });

  it('previously impossible levels are now solvable', () => {
    for (const n of [57, 75, 87, 99]) {
      const ok = solve(LEVELS[n - 1]!);
      console.log(`L${n}: ${ok ? 'SOLVED' : 'not solved'}`);
      expect(ok).toBe(true);
    }
  }, 120000);
});
