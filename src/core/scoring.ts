const BASE_GEM_SCORE = 60;

/** Cascade multiplier grows with each cascade step: x1, x1.5, x2, ... capped at x5. */
export function cascadeMult(cascade: number): number {
  return Math.min(1 + (cascade - 1) * 0.5, 5);
}

export function gemScore(cascade: number): number {
  return Math.round(BASE_GEM_SCORE * cascadeMult(cascade));
}

export function powerSpawnBonus(power: number): number {
  switch (power) {
    case 1:
    case 2:
      return 120;
    case 3:
      return 200;
    case 4:
      return 400;
    default:
      return 0;
  }
}

export function iceScore(): number {
  return 90;
}

export function chainBreakScore(): number {
  return 150;
}

export function starsFor(score: number, thresholds: [number, number, number]): number {
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

/** Convert star thresholds from "multiplier of base goal" into absolute numbers. */
export function starThresholds(base: number): [number, number, number] {
  return [Math.round(base * 1.0), Math.round(base * 1.6), Math.round(base * 2.4)];
}

/** Пороги звёзд за экономию ходов (уровни с целью по очкам):
 *  ★1 — просто пройти, ★2/★3 — закончить с запасом ходов.
 *  scale ослабляет пороги для боссов (их цели тяжёлые, запаса почти не остаётся). */
export function movesStarThresholds(moves: number, scale = 1): [number, number, number] {
  return [
    0,
    Math.max(2, Math.round(moves * 0.2 * scale)),
    Math.max(3, Math.round(moves * 0.35 * scale)),
  ];
}

/** Звёзды по запасу ходов на момент победы (см. movesStarThresholds). */
export function starsForMoves(movesLeft: number, thresholds: [number, number, number]): number {
  if (movesLeft >= thresholds[2]) return 3;
  if (movesLeft >= thresholds[1]) return 2;
  return 1;
}
