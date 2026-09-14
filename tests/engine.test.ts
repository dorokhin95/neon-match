import { describe, expect, it } from 'vitest';
import { Engine, combinePowers } from '../src/core/engine';
import { findMatches, powerForShape } from '../src/core/match';
import { getLevel, LEVELS, TOTAL_LEVELS, maskFull } from '../src/core/levels';
import { Rng } from '../src/core/rng';
import { Power } from '../src/core/types';
import { cascadeMult, starsForMoves } from '../src/core/scoring';

function newEngine(n = 1, seed = 42): Engine {
  return new Engine(getLevel(n), new Rng(seed));
}

describe('levels', () => {
  it('has 100 levels with sane values', () => {
    expect(LEVELS.length).toBe(TOTAL_LEVELS);
    LEVELS.forEach((l, i) => {
      expect(l.n).toBe(i + 1);
      expect(l.moves).toBeGreaterThan(0);
      expect(l.colors).toBeGreaterThanOrEqual(4);
      expect(l.colors).toBeLessThanOrEqual(6);
      expect(l.goals.length).toBeGreaterThan(0);
      expect(l.stars[0]).toBeLessThanOrEqual(l.stars[1]);
      expect(l.stars[1]).toBeLessThanOrEqual(l.stars[2]);
    });
  });

  it('levels are deterministic per number', () => {
    const a = newEngine(7, 123);
    const b = newEngine(7, 123);
    expect(a.grid.map((r) => r.map((g) => g?.kind).join(','))).toEqual(
      b.grid.map((r) => r.map((g) => g?.kind).join(',')),
    );
  });

  it('starts without ready matches and with a valid move', () => {
    for (const n of [1, 15, 37, 64, 99]) {
      const e = newEngine(n);
      expect(findMatches(e.bounds, e.mask, e.grid).length).toBe(0);
      expect(e.hasValidMove()).toBe(true);
    }
  });
});

describe('matching', () => {
  it('detects horizontal and vertical runs', () => {
    const e = newEngine(1);
    e.grid[0]![0]!.kind = 0;
    e.grid[0]![1]!.kind = 0;
    e.grid[0]![2]!.kind = 0;
    const groups = findMatches(e.bounds, e.mask, e.grid);
    expect(groups.length).toBeGreaterThan(0);
  });

  it('maps shapes to powers', () => {
    expect(powerForShape('line4')).toBe(Power.RowBlaster);
    expect(powerForShape('line5')).toBe(Power.Prism);
    expect(powerForShape('big')).toBe(Power.Bomb);
    expect(powerForShape('line3')).toBe(Power.None);
  });
});

describe('engine', () => {
  it('tryMove rejects invalid swaps and refunds moves', () => {
    const e = newEngine(1);
    const moves0 = e.movesLeft;
    let found = false;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 7; c++) {
        const ga = e.grid[r]![c]!;
        const gb = e.grid[r]![c + 1]!;
        if (ga.power === Power.None && gb.power === Power.None && ga.kind !== gb.kind) {
          const res = e.tryMove({ r, c }, { r, c: c + 1 });
          if (!res.valid) {
            found = true;
            break outer;
          }
        }
      }
    }
    expect(found).toBe(true);
    expect(e.movesLeft).toBe(moves0);
  });

  it('tryMove valid swap consumes a move and scores', () => {
    const e = newEngine(1);
    const swaps = e.findAllValidSwaps();
    expect(swaps.length).toBeGreaterThan(0);
    const [a, b] = swaps[0]!;
    const res = e.tryMove(a, b);
    expect(res.valid).toBe(true);
    expect(res.score).toBeGreaterThan(0);
    expect(e.movesLeft).toBe(getLevel(1).moves - 1);
    expect(res.steps.length).toBeGreaterThan(0);
  });

  it('grid stays full: gravity refills every playable cell', () => {
    const e = newEngine(3);
    const mask = maskFull(8, 8);
    for (let i = 0; i < 12; i++) {
      const swaps = e.findAllValidSwaps();
      if (swaps.length === 0) break;
      e.tryMove(swaps[0]![0]!, swaps[0]![1]!);
    }
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (e.mask && !e.mask[r]![c]) continue;
        void mask;
        expect(e.grid[r]![c]).not.toBeNull();
      }
    }
  });

  it('power gem activates on any swap, even without a match', () => {
    const e = newEngine(1);
    // Ищем любую пару соседних клеток; делаем один из гемов бонусом.
    let pair: [[number, number], [number, number]] | null = null;
    outer: for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 7; c++) {
        if (e.grid[r]![c] && e.grid[r]![c + 1]) {
          pair = [[r, c], [r, c + 1]];
          break outer;
        }
      }
    }
    expect(pair).not.toBeNull();
    const [a, b] = pair!;
    const ga = e.grid[a[0]]![a[1]]!;
    ga.power = Power.RowBlaster;
    const movesBefore = e.movesLeft;
    const res = e.tryMove({ r: a[0], c: a[1] }, { r: b[0], c: b[1] });
    expect(res.valid).toBe(true);
    expect(res.score).toBeGreaterThan(0);
    expect(e.movesLeft).toBe(movesBefore - 1);
    // Бонус потрачен: на поле не должно остаться гема с этим id.
    const ids = new Set(e.grid.flat().map((g) => g?.id));
    expect(ids.has(ga.id)).toBe(false);
  });

  it('cascade chain resolves without duplicate ids', () => {
    const e = newEngine(15);
    for (let i = 0; i < 20; i++) {
      const swaps = e.findAllValidSwaps();
      if (swaps.length === 0) break;
      e.tryMove(swaps[0]![0]!, swaps[0]![1]!);
    }
    const seen = new Set<number>();
    for (const row of e.grid) {
      for (const g of row) {
        if (g) {
          expect(seen.has(g.id)).toBe(false);
          seen.add(g.id);
        }
      }
    }
  });

  it('board never becomes stuck without a valid move', () => {
    const e = newEngine(9);
    for (let i = 0; i < 25; i++) {
      const swaps = e.findAllValidSwaps();
      if (swaps.length === 0) break;
      e.tryMove(swaps[0]![0]!, swaps[0]![1]!);
      if (e.movesLeft <= 0) break;
    }
    expect(e.hasValidMove()).toBe(true);
  });
});

describe('superpowers', () => {
  it('bomb clears 3x3 without spending a move and keeps the board full', () => {
    const e = newEngine(1);
    const movesBefore = e.movesLeft;
    const total = () => e.grid.flat().filter(Boolean).length;
    const before = total();
    const res = e.useSuperBomb({ r: 2, c: 2 });
    expect(res.valid).toBe(true);
    expect(res.movesLeft).toBe(movesBefore);
    expect(total()).toBe(before);
  });

  it('lightning removes one gem without spending a move', () => {
    const e = newEngine(1);
    const movesBefore = e.movesLeft;
    const total = () => e.grid.flat().filter(Boolean).length;
    const before = total();
    const res = e.useSuperLightning({ r: 4, c: 4 });
    expect(res.valid).toBe(true);
    expect(res.movesLeft).toBe(movesBefore);
    expect(total()).toBe(before);
  });

  it('extra moves add moves', () => {
    const e = newEngine(1);
    const before = e.movesLeft;
    const res = e.useExtraMoves(2);
    expect(e.movesLeft).toBe(before + 2);
    expect(res.movesLeft).toBe(before + 2);
  });
});

describe('combinePowers', () => {
  it('maps power pairs to combined effects', () => {
    expect(combinePowers(Power.Prism, Power.Prism)).toBe('wipe');
    expect(combinePowers(Power.Prism, Power.Bomb)).toBe('colorblasters');
    expect(combinePowers(Power.Bomb, Power.Bomb)).toBe('megabomb');
  });
});

describe('scoring', () => {
  it('cascade multiplier caps at x5', () => {
    expect(cascadeMult(1)).toBe(1);
    expect(cascadeMult(9)).toBe(5);
    expect(cascadeMult(4)).toBe(2.5);
  });

  it('moves-based stars: score-goal levels are rated by spare moves', () => {
    // Уровни с целью по очкам обязаны оцениваться ходами, а не очками.
    LEVELS.forEach((l) => {
      const hasScore = l.goals.some((g) => g.kind === 'score');
      if (hasScore) {
        expect(l.starsMoves, `L${l.n} must have starsMoves`).toBeDefined();
        const [, t2, t3] = l.starsMoves!;
        expect(t2).toBeGreaterThanOrEqual(2);
        expect(t3).toBeGreaterThan(t2);
        expect(t3).toBeLessThan(l.moves);
      } else {
        expect(l.starsMoves, `L${l.n} must NOT have starsMoves`).toBeUndefined();
      }
    });
  });

  it('starsForMoves maps spare moves to stars, floor of 1 star', () => {
    const th: [number, number, number] = [0, 4, 7];
    expect(starsForMoves(7, th)).toBe(3);
    expect(starsForMoves(10, th)).toBe(3);
    expect(starsForMoves(4, th)).toBe(2);
    expect(starsForMoves(6, th)).toBe(2);
    expect(starsForMoves(3, th)).toBe(1);
    expect(starsForMoves(0, th)).toBe(1);
    expect(starsForMoves(-2, th)).toBe(1); // играбельные «+2 хода» не дают звёзд
  });
});
