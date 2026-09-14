import type { BoardMask, Cell, Gem, GemKind } from './types';
import { Power } from './types';

export interface Bounds {
  rows: number;
  cols: number;
}

export function inBounds(b: Bounds, r: number, c: number): boolean {
  return r >= 0 && r < b.rows && c >= 0 && c < b.cols;
}

export function playable(b: Bounds, mask: BoardMask | undefined, r: number, c: number): boolean {
  return inBounds(b, r, c) && (!mask || mask[r]![c] !== false);
}

export function at(grid: Cell[][], r: number, c: number): Cell {
  return grid[r]?.[c] ?? null;
}

export function setAt(grid: Cell[][], r: number, c: number, gem: Cell): void {
  if (grid[r]) grid[r]![c] = gem;
}

export function cloneGrid(grid: Cell[][]): Cell[][] {
  return grid.map((row) => row.map((g) => (g ? { ...g } : null)));
}

export function makeGem(kind: GemKind, id: number): Gem {
  return { kind, power: Power.None, ice: 0, chain: 0, id };
}
