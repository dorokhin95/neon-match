import type { Cell, GemKind, Pos, Power } from './types';
import { Power as P } from './types';
import { at, playable, type Bounds } from './grid';

export interface MatchGroup {
  cells: Pos[];
  kind: GemKind;
  shape: 'line3' | 'line4' | 'line5' | 'big';
  rows: Set<number>;
  cols: Set<number>;
}

function key(r: number, c: number): string {
  return `${r},${c}`;
}

function plainAt(grid: Cell[][], r: number, c: number): boolean {
  const g = at(grid, r, c);
  return g !== null && g.power === P.None;
}

/** Find all horizontal/vertical runs >=3 among plain gems, merge crossings. */
export function findMatches(b: Bounds, mask: boolean[][] | undefined, grid: Cell[][]): MatchGroup[] {
  const runs: MatchGroup[] = [];
  const ok = (r: number, c: number) => playable(b, mask, r, c) && plainAt(grid, r, c);

  for (let r = 0; r < b.rows; r++) {
    let c = 0;
    while (c < b.cols) {
      if (!ok(r, c)) { c++; continue; }
      const kind0 = at(grid, r, c)!.kind;
      let end = c + 1;
      while (end < b.cols) {
        const g2 = at(grid, r, end);
        if (g2 && g2.kind === kind0 && g2.power === P.None && ok(r, end)) end++;
        else break;
      }
      if (end - c >= 3) {
        const cells: Pos[] = [];
        for (let i = c; i < end; i++) cells.push({ r, c: i });
        runs.push(toGroup(cells, kind0));
      }
      c = end;
    }
  }
  for (let c = 0; c < b.cols; c++) {
    let r = 0;
    while (r < b.rows) {
      if (!ok(r, c)) { r++; continue; }
      const kind0 = at(grid, r, c)!.kind;
      let end = r + 1;
      while (end < b.rows) {
        const g2 = at(grid, end, c);
        if (g2 && g2.kind === kind0 && g2.power === P.None && ok(end, c)) end++;
        else break;
      }
      if (end - r >= 3) {
        const cells: Pos[] = [];
        for (let i = r; i < end; i++) cells.push({ r: i, c });
        runs.push(toGroup(cells, kind0));
      }
      r = end;
    }
  }
  return mergeGroups(runs);
}

function toGroup(cells: Pos[], kind: GemKind): MatchGroup {
  const rows = new Set<number>();
  const cols = new Set<number>();
  for (const p of cells) { rows.add(p.r); cols.add(p.c); }
  const len = cells.length;
  const straight = rows.size === 1 || cols.size === 1;
  let shape: MatchGroup['shape'] = 'line3';
  if (straight) {
    if (len >= 5) shape = 'line5';
    else if (len === 4) shape = 'line4';
  } else if (len >= 5) {
    shape = 'big';
  }
  return { cells, kind, shape, rows, cols };
}

function mergeGroups(runs: MatchGroup[]): MatchGroup[] {
  const out: MatchGroup[] = [];
  const used = new Array<boolean>(runs.length).fill(false);
  for (let i = 0; i < runs.length; i++) {
    if (used[i]!) continue;
    const group = runs[i]!;
    for (let j = i + 1; j < runs.length; j++) {
      if (used[j]! || runs[j]!.kind !== group.kind) continue;
      const overlap = runs[j]!.cells.some((p) => group.cells.some((q) => q.r === p.r && q.c === p.c));
      if (overlap) {
        const seen = new Set(group.cells.map((p) => key(p.r, p.c)));
        for (const p of runs[j]!.cells) {
          if (!seen.has(key(p.r, p.c))) group.cells.push(p);
        }
        for (const p of runs[j]!.cells) { group.rows.add(p.r); group.cols.add(p.c); }
        if (group.cells.length >= 5 && group.rows.size > 1 && group.cols.size > 1) group.shape = 'big';
        else if (group.cells.length === 4 && (group.rows.size > 1 && group.cols.size > 1)) group.shape = 'line4';
        used[j] = true;
      }
    }
    out.push(group);
  }
  return out;
}

/** Which power gem a match shape produces (None = no power). */
export function powerForShape(shape: MatchGroup['shape']): Power {
  switch (shape) {
    case 'line4': return P.RowBlaster;
    case 'line5': return P.Prism;
    case 'big': return P.Bomb;
    default: return P.None;
  }
}
