import type { BoardMask, GemKind, Goal, LevelDef } from './types';
import { movesStarThresholds, starThresholds } from './scoring';

export const TOTAL_LEVELS = 100;

// ============ Masks ============

export function maskFull(rows: number, cols: number): BoardMask {
  return Array.from({ length: rows }, () => Array<boolean>(cols).fill(true));
}

export function maskCross(rows: number, corners: number): BoardMask {
  const m = maskFull(rows, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      const corner = (r < corners || r >= rows - corners) && (c < corners || c >= rows - corners);
      if (corner) m[r]![c] = false;
    }
  }
  return m;
}

export function maskDiamond(rows: number): BoardMask {
  const m = maskFull(rows, rows);
  const mid = (rows - 1) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < rows; c++) {
      if (Math.abs(r - mid) + Math.abs(c - mid) > mid) m[r]![c] = false;
    }
  }
  return m;
}

export function maskFrame(rows: number, hole: number): BoardMask {
  const m = maskFull(rows, rows);
  const lo = Math.floor((rows - hole) / 2);
  const hi = lo + hole;
  for (let r = lo; r < hi; r++) {
    for (let c = lo; c < hi; c++) m[r]![c] = false;
  }
  return m;
}

export function maskStripes(rows: number, cols: number): BoardMask {
  const m = maskFull(rows, cols);
  for (let r = 1; r < rows; r += 4) {
    for (let c = 0; c < cols; c++) m[r]![c] = false;
  }
  return m;
}

export const MASKS: Record<string, BoardMask> = {
  cross8: maskCross(8, 2),
  diamond8: maskDiamond(8),
  frame8: maskFrame(8, 4),
  stripes8: maskStripes(8, 8),
};

// ============ Goal helpers ============

export function goalScore(amount: number): Goal {
  return { kind: 'score', amount };
}

export function goalCollect(gem: GemKind, amount: number): Goal {
  return { kind: 'collect', gem, amount };
}

export function goalIce(amount: number): Goal {
  return { kind: 'ice', amount };
}

// ============ Level builder ============

function lvl(
  n: number,
  colors: number,
  moves: number,
  goals: Goal[],
  base: number,
  maskName?: string,
  starsScale = 1,
): LevelDef {
  // Если среди целей есть очки, звёзды за очки дублировали бы условие победы
  // (порог ★1 = цель). Такие уровни оцениваются экономией ходов.
  const byMoves = goals.some((g) => g.kind === 'score');
  return {
    n,
    rows: 8,
    cols: 8,
    colors,
    moves,
    goals,
    stars: starThresholds(base),
    starsMoves: byMoves ? movesStarThresholds(moves, starsScale) : undefined,
    mask: maskName ? MASKS[maskName] : undefined,
  };
}

// ============ Tiers 1–25 (hand-tuned) ============

const T1: LevelDef[] = [
  lvl(1, 5, 20, [goalScore(1200)], 1200),
  lvl(2, 5, 20, [goalCollect(0, 12)], 900),
  lvl(3, 5, 20, [goalCollect(2, 14)], 1000),
  lvl(4, 5, 20, [goalScore(2000)], 2000, 'cross8'),
  lvl(5, 5, 20, [goalCollect(4, 15)], 1200),
  lvl(6, 5, 22, [goalIce(8)], 900),
  lvl(7, 5, 22, [goalIce(12)], 1000),
  lvl(8, 5, 22, [goalScore(2600)], 2600, 'diamond8'),
];

const T2: LevelDef[] = [
  lvl(9, 5, 24, [goalIce(16)], 1100),
  lvl(10, 5, 24, [goalIce(24)], 1400),
  lvl(11, 5, 24, [goalScore(3200)], 3200, 'frame8'),
  lvl(12, 5, 24, [goalCollect(1, 18)], 1500),
  lvl(13, 6, 24, [goalCollect(3, 20)], 1600),
  lvl(14, 6, 24, [goalIce(28)], 1500),
  lvl(15, 6, 24, [goalScore(4000), goalCollect(0, 10)], 4000, 'stripes8'),
  lvl(16, 6, 26, [goalIce(32)], 1600),
  lvl(17, 6, 26, [goalCollect(2, 22)], 1700),
  lvl(18, 6, 26, [goalIce(36)], 1800),
  lvl(19, 6, 26, [goalScore(4800)], 4800, 'cross8'),
  lvl(20, 6, 26, [goalCollect(5, 24), goalCollect(1, 12)], 1900),
  lvl(21, 6, 26, [goalIce(40), goalCollect(4, 10)], 2000),
  lvl(22, 6, 28, [goalScore(5600)], 5600, 'frame8'),
  lvl(23, 6, 28, [goalIce(44)], 2100),
  lvl(24, 6, 28, [goalCollect(0, 26)], 2200),
  lvl(25, 6, 28, [goalScore(6400), goalIce(20)], 6400, 'diamond8'),
];

// ============ Tiers 3–5 (26–100, procedural patterns) ============

const MASK_CYCLE = ['frame8', 'stripes8', 'cross8', 'diamond8', undefined, undefined] as const;
const KINDS: GemKind[] = [0, 1, 2, 3, 4, 5];

function proceduralLevels(): LevelDef[] {
  const out: LevelDef[] = [];
  for (let n = 26; n <= TOTAL_LEVELS; n++) {
    const tier = n <= 50 ? 0 : n <= 75 ? 1 : 2; // difficulty tier
    const colors = 6;
    const moves = 26 - tier + (n % 3 === 0 ? -2 : 0);
    const maskName = MASK_CYCLE[n % MASK_CYCLE.length];
    const boss = n % 25 === 0;
    const goals: Goal[] = [];
    let base: number;
    let starsScale = 1;

    if (boss) {
      // Boss board: score + ice + collect, generous star base.
      const g = KINDS[n % 6]!;
      goals.push(goalScore(6000 + tier * 1800), goalIce(24 + tier * 6), goalCollect(g, 10 + tier * 4));
      base = 6000 + tier * 1800;
      starsScale = 0.7;
    } else {
      const pattern = n % 5;
      if (pattern === 0) {
        const amount = 3000 + tier * 1500 + (n % 7) * 200;
        goals.push(goalScore(amount));
        base = amount;
      } else if (pattern === 1) {
        const g = KINDS[n % 6]!;
        const amount = 16 + tier * 6 + (n % 4) * 2;
        goals.push(goalCollect(g, amount));
        base = amount * 120;
      } else if (pattern === 2) {
        const amount = 20 + tier * 10 + (n % 5) * 2;
        goals.push(goalIce(amount));
        base = amount * 130;
      } else if (pattern === 3) {
        const a = KINDS[(n + 1) % 6]!;
        const b = KINDS[(n + 3) % 6]!;
        goals.push(goalCollect(a, 12 + tier * 4), goalCollect(b, 10 + tier * 4));
        base = (22 + tier * 8) * 120;
      } else {
        const ice = 16 + tier * 8 + (n % 4) * 2;
        const g = KINDS[n % 6]!;
        goals.push(goalIce(ice), goalCollect(g, 8 + tier * 3));
        base = ice * 130;
      }
    }
    out.push(lvl(n, colors, moves, goals, base, maskName, starsScale));
  }
  return out;
}

export const LEVELS: LevelDef[] = [...T1, ...T2, ...proceduralLevels()];

export function getLevel(n: number): LevelDef {
  const idx = Math.max(0, Math.min(TOTAL_LEVELS - 1, n - 1));
  return LEVELS[idx]!;
}
