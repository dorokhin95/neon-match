// ============ Core types ============

export type GemKind = 0 | 1 | 2 | 3 | 4 | 5;

/** Power gem variants drawn over the base gem. */
export enum Power {
  None = 0,
  RowBlaster = 1, // clears its row
  ColBlaster = 2, // clears its column
  Bomb = 3, // clears 3x3
  Prism = 4, // color bomb
}

export interface Gem {
  kind: GemKind;
  power: Power;
  /** Ice layers on top of the gem (0..2). Ice is removed by adjacent matches/blasts. */
  ice: number;
  /** Chain lock level (0 = free, 1 = chained, needs one adjacent match). */
  chain: number;
  id: number;
}

export type Cell = Gem | null;

export interface Pos {
  r: number;
  c: number;
}

export type GoalKind = 'score' | 'collect' | 'ice';

export interface Goal {
  kind: GoalKind;
  /** For collect: gem kind. Ignored otherwise. */
  gem?: GemKind;
  amount: number;
}

export type BoardMask = boolean[][]; // true = playable cell

export interface LevelDef {
  n: number;
  rows: number;
  cols: number;
  colors: number; // 4..6 gem colors in play
  moves: number;
  goals: Goal[];
  /** Star thresholds: 1/2/3 stars by score. */
  stars: [number, number, number];
  /** Пороги звёзд за экономию ходов (уровни с целью по очкам): сколько ходов
   *  должно остаться к моменту победы. ★1 — просто пройти уровень.
   *  Очки на таких уровнях не оценивают: порог ★1 совпал бы с целью. */
  starsMoves?: [number, number, number];
  mask?: BoardMask;
  intro?: string;
}

/** Дескриптор визуального эффекта бонуса с местом срабатывания. */
export interface FxSpec {
  kind: 'rows' | 'cols' | 'rows2' | 'cols2' | 'bomb' | 'prism' | 'wipe' | 'bolt';
  /** Координаты срабатывания в клетках поля: строка/столбец луча или центр взрыва. */
  r?: number;
  c?: number;
}

export interface ClearInfo {
  /** Cells affected by this clear (for particles). */
  cells: Pos[];
  /** ids of gems removed by this clear; a gem may survive if only its ice
   *  layer or chain broke. */
  ids: number[];
  /** Cells where an ice layer shattered (gem survives). */
  ice: Pos[];
  /** ids of gems whose chain lock broke (gem survives). */
  chains: number[];
  /** ID бонус-гемов, потраченных активацией: их фигурки исчезают вместе с очисткой,
   *  но очки за них не начисляются (сами бонус-эффекты уже учтены). */
  bonusIds: number[];
  /** Визуальные эффекты с координатами срабатывания. */
  fx?: FxSpec[];
  scoreGain: number;
  cascade: number;
}

export type Step =
  | { kind: 'swap'; a: Pos; b: Pos; idA: number; idB: number }
  | { kind: 'swapBack'; a: Pos; b: Pos; idA: number; idB: number }
  | { kind: 'clear'; info: ClearInfo }
  | { kind: 'powerSpawn'; pos: Pos; power: Power; from: GemKind; id: number }
  | {
      kind: 'fall';
      moves: Array<{ id: number; from: Pos; to: Pos; dist: number }>;
      /** Свежесозданные гемы: стартуют стопкой над полем и падают на места.
       *  Снимок гемa обязателен: к моменту проигрывания шага итоговое поле
       *  уже просчитано, и позиция в нём может не совпадать с позицией шага. */
      newGems: Array<{ id: number; to: Pos; dropCells: number; kind: GemKind; power: Power; ice: number; chain: number }>;
    }
  | { kind: 'shuffle' }
  | { kind: 'prismZap'; srcId: number; srcPos: Pos; kind0: GemKind }
  | { kind: 'chainBreak'; ids: number[] };

export interface CollectDelta {
  gem?: GemKind;
  ice: number;
}

export interface MoveResult {
  steps: Step[];
  valid: boolean;
  score: number;
  maxCascade: number;
  collected: CollectDelta;
  won: boolean;
  possible: boolean;
  movesLeft: number;
}

export interface WinStats {
  score: number;
  stars: number;
  bestCascade: number;
  /** Пороги звёзд уровня — для расшифровки «сколько до следующей звезды». */
  starThresholds?: [number, number, number];
  /** Звёзды за экономию ходов: пороги запаса и сам запас на момент победы. */
  starMoves?: [number, number, number];
  movesLeft?: number;
}
