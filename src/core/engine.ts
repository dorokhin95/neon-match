import type {
  BoardMask,
  Cell,
  ClearInfo,
  CollectDelta,
  FxSpec,
  GemKind,
  Goal,
  LevelDef,
  MoveResult,
  Pos,
  Power,
  Step,
} from './types';
import { Power as P } from './types';
import { makeGem, playable, setAt, type Bounds } from './grid';
import { findMatches, powerForShape, type MatchGroup } from './match';
import { chainBreakScore, gemScore, iceScore, powerSpawnBonus } from './scoring';
import { Rng } from './rng';

export interface ObjectiveState {
  score: number;
  collected: Partial<Record<GemKind, number>>;
  ice: number;
}

/** Convert a prism's source position to its gem id for the renderer. */
function idAt(grid: Cell[][], p: Pos): number {
  return grid[p.r]?.[p.c]?.id ?? -1;
}

export class Engine {
  readonly bounds: Bounds;
  readonly mask: BoardMask | undefined;
  grid: Cell[][];
  level: LevelDef;
  obj: ObjectiveState;
  movesLeft: number;
  /** Ходов реально потрачено (без бонусных «+2 хода») — для честных звёзд
   *  за экономию: запас = level.moves - movesSpent. */
  movesSpent = 0;
  won = false;
  private nextId = 1;
  private rng: Rng;
  /** Счёт на момент начала хода — для подсчёта выигрыша. */
  private lastObjScoreAtMoveStart = 0;

  constructor(level: LevelDef, rng: Rng) {
    this.level = level;
    this.bounds = { rows: level.rows, cols: level.cols };
    this.mask = level.mask;
    this.rng = rng;
    this.movesLeft = level.moves;
    this.obj = { score: 0, collected: {}, ice: 0 };
    this.grid = this.emptyGrid();
    this.fillInitial();
    if (this.findAnyMatch().length > 0 || !this.hasValidMove()) {
      this.shuffleBoard();
    }
    this.placeIce();
  }

  // ============ Setup ============

  private emptyGrid(): Cell[][] {
    return Array.from({ length: this.bounds.rows }, () => Array<Cell>(this.bounds.cols).fill(null));
  }

  private inPlay(r: number, c: number): boolean {
    return playable(this.bounds, this.mask, r, c);
  }

  private fillInitial(): void {
    for (let pass = 0; pass < 10; pass++) {
      for (let r = 0; r < this.bounds.rows; r++) {
        for (let c = 0; c < this.bounds.cols; c++) {
          if (this.inPlay(r, c) && this.grid[r]![c] === null) {
            this.grid[r]![c] = makeGem(this.pickNoMatchKind(r, c), this.nextId++);
          }
        }
      }
      if (this.findAnyMatch().length === 0) return;
      for (let r = 0; r < this.bounds.rows; r++) {
        for (let c = 0; c < this.bounds.cols; c++) {
          if (this.inPlay(r, c)) this.grid[r]![c] = null;
        }
      }
    }
    // Last resort: fill randomly, ignore initial matches.
    for (let r = 0; r < this.bounds.rows; r++) {
      for (let c = 0; c < this.bounds.cols; c++) {
        if (this.inPlay(r, c) && this.grid[r]![c] === null) {
          this.grid[r]![c] = makeGem(this.rng.int(0, this.level.colors - 1) as GemKind, this.nextId++);
        }
      }
    }
  }

  private pickNoMatchKind(r: number, c: number): GemKind {
    const max = this.level.colors;
    const banned = new Set<number>();
    if (c >= 2) {
      const a = this.grid[r]![c - 1];
      const b = this.grid[r]![c - 2];
      if (a && b && a.kind === b.kind) banned.add(a.kind);
    }
    if (r >= 2) {
      const a = this.grid[r - 1]![c];
      const b = this.grid[r - 2]![c];
      if (a && b && a.kind === b.kind) banned.add(a.kind);
    }
    for (let tries = 0; tries < 20; tries++) {
      const k = this.rng.int(0, max - 1);
      if (!banned.has(k)) return k as GemKind;
    }
    for (let k = 0; k < max; k++) {
      if (!banned.has(k)) return k as GemKind;
    }
    return 0 as GemKind;
  }

  /** Разместить лёд на поле: без этого цель «разбей лёд» невыполнима.
   *  Сумма слоёв всегда >= цели (с запасом), распределение детерминировано. */
  private placeIce(): void {
    const iceGoal = this.level.goals.find((g) => g.kind === 'ice');
    if (!iceGoal) return;
    const cells: Pos[] = [];
    for (let r = 0; r < this.bounds.rows; r++) {
      for (let c = 0; c < this.bounds.cols; c++) {
        if (this.inPlay(r, c) && this.grid[r]![c] !== null) cells.push({ r, c });
      }
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      const tmp = cells[i]!;
      cells[i] = cells[j]!;
      cells[j] = tmp;
    }
    let remaining = iceGoal.amount + 4; // запас, чтобы уровень был проходим
    let i = 0;
    while (remaining > 0 && i < cells.length) {
      const gem = this.grid[cells[i]!.r]![cells[i]!.c]!;
      if (gem.ice === 0) {
        // Двойной лёд появляется на уровнях с большой целью.
        const layers = remaining >= 2 && iceGoal.amount >= 16 && this.rng.next() < 0.25 ? 2 : 1;
        gem.ice = layers;
        remaining -= layers;
      }
      i++;
    }
    // На маленьких масках (ромб/полосы) играбельных клеток может не хватить,
    // чтобы набрать цель одинарным льдом. Докладываем второй слой на уже
    // покрытые клетки, иначе цель «разбей лёд» становится невыполнимой.
    if (remaining > 0) {
      for (let j = 0; j < cells.length && remaining > 0; j++) {
        const gem = this.grid[cells[j]!.r]![cells[j]!.c]!;
        if (gem.ice === 1) {
          gem.ice = 2;
          remaining -= 1;
        }
      }
    }
  }

  // ============ Queries ============

  hasValidMove(): boolean {
    return this.findAllValidSwaps().length > 0;
  }

  /** All swappable pairs that produce a match. */
  findAllValidSwaps(): Array<[Pos, Pos]> {
    const res: Array<[Pos, Pos]> = [];
    const b = this.bounds;
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        if (!this.inPlay(r, c) || this.grid[r]![c] === null) continue;
        for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (!this.inPlay(r2, c2) || this.grid[r2]![c2] === null) continue;
          if (this.swapProducesMatch({ r, c }, { r: r2, c: c2 })) {
            res.push([{ r, c }, { r: r2, c: c2 }]);
          }
        }
      }
    }
    return res;
  }

  private swapProducesMatch(a: Pos, b: Pos): boolean {
    const ga = this.grid[a.r]![a.c]!;
    const gb = this.grid[b.r]![b.c]!;
    if (ga.power !== P.None || gb.power !== P.None) return true; // power combos always valid
    setAt(this.grid, a.r, a.c, gb);
    setAt(this.grid, b.r, b.c, ga);
    const found = this.findAnyMatch().length > 0;
    setAt(this.grid, a.r, a.c, ga);
    setAt(this.grid, b.r, b.c, gb);
    return found;
  }

  private findAnyMatch(): MatchGroup[] {
    return findMatches(this.bounds, this.mask, this.grid);
  }

  // ============ Move execution ============

  tryMove(a: Pos, b: Pos): MoveResult {
    const steps: Step[] = [];
    if (!this.adjacent(a, b) || !this.inPlay(a.r, a.c) || !this.inPlay(b.r, b.c)) {
      return this.invalidResult();
    }
    const ga = this.grid[a.r]![a.c];
    const gb = this.grid[b.r]![b.c];
    if (!ga || !gb) return this.invalidResult();

    this.swap(a, b);
    steps.push({ kind: 'swap', a, b, idA: ga.id, idB: gb.id });

    const powerCombo = ga.power !== P.None || gb.power !== P.None;
    const matches = this.findAnyMatch();

    // Обычный свап без бонусов обязан давать матч, иначе откат без траты хода.
    // Свап с бонусом НЕ откатывается: бонус срабатывает всегда и списывает ход.
    if (matches.length === 0 && !powerCombo) {
      this.swap(a, b);
      steps.push({ kind: 'swapBack', a, b, idA: ga.id, idB: gb.id });
      return { steps, valid: false, score: 0, maxCascade: 0, collected: { ice: 0 }, won: false, possible: true, movesLeft: this.movesLeft };
    }

    this.movesLeft--;
    this.movesSpent++;
    this.lastObjScoreAtMoveStart = this.obj.score;
    const collected: CollectDelta = { ice: 0 };
    let score = 0;
    let maxCascade = 0;

    if (powerCombo) {
      const comboSteps = this.activateCombo(a, b, collected);
      steps.push(...comboSteps);
      // После взрыва бонуса поле обязано утрястись, даже если матчей больше нет:
      // без этого дыры остаются висеть до следующего хода.
      this.applyGravityAndRefill(steps);
    }

    let cascade = 0;
    while (true) {
      const groups = this.findAnyMatch();
      if (groups.length === 0) break;
      cascade++;
      maxCascade = Math.max(maxCascade, cascade);
      // Бонус появляется там, куда игрок передвинул гем (только первый каскад).
      const prefer = cascade === 1 ? [b, a] : [];
      const clear = this.resolveGroups(groups, cascade, collected, steps, prefer);
      score += clear.scoreGain;
      this.obj.score += clear.scoreGain;
      this.applyGravityAndRefill(steps);
    }

    if (!this.hasValidMove()) {
      this.shuffleBoard();
      steps.push({ kind: 'shuffle' });
    }

    const won = this.checkGoals();
    // Возвращаем весь выигрыш хода: каскады + очки бонусов (бонус пишется в obj напрямую).
    const total = Math.max(score, this.obj.score - (this.lastObjScoreAtMoveStart ?? 0));
    return { steps, valid: true, score: total, maxCascade, collected, won, possible: true, movesLeft: this.movesLeft };
  }

  private invalidResult(): MoveResult {
    return { steps: [], valid: false, score: 0, maxCascade: 0, collected: { ice: 0 }, won: false, possible: true, movesLeft: this.movesLeft };
  }

  private adjacent(a: Pos, b: Pos): boolean {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  private swap(a: Pos, b: Pos): void {
    const ga = this.grid[a.r]![a.c];
    this.grid[a.r]![a.c] = this.grid[b.r]![b.c];
    this.grid[b.r]![b.c] = ga;
  }

  // ============ Power activation ============

  /** Swap of two power gems (or power + normal). Returns steps. */
  private activateCombo(a: Pos, b: Pos, collected: CollectDelta): Step[] {
    const steps: Step[] = [];
    const ga = this.grid[a.r]![a.c]!;
    const gb = this.grid[b.r]![b.c]!;

    if (ga.power !== P.None && gb.power !== P.None) {
      // Both are powers: combined effect.
      const combo = combinePowers(ga.power, gb.power);
      // Consume both, trigger combined.
      this.grid[a.r]![a.c] = null;
      this.grid[b.r]![b.c] = null;
      steps.push(...this.triggerCombined(combo, a, b, ga.kind, collected, [a, b], [ga.id, gb.id]));
      return steps;
    }

    // One power + one normal: activate the power where the player moved it TO.
    // powerGem.pos — клетка назначения (после свапа бонус уже стоит там).
    const powerGem = ga.power !== P.None ? { gem: ga, pos: a } : { gem: gb, pos: b };
    const otherPos = powerGem.pos === a ? b : a;
    const otherGem = this.grid[otherPos.r]![otherPos.c]!;
    this.grid[powerGem.pos.r]![powerGem.pos.c] = null;
    steps.push(...this.activatePower(powerGem.gem.power, powerGem.pos, otherGem.kind, collected, [powerGem.pos], [powerGem.gem.id]));
    return steps;
  }

  private activatePower(
    power: Power,
    atPos: Pos,
    fromKind: GemKind,
    collected: CollectDelta,
    consumed: Pos[],
    bonusIds: number[] = [],
  ): Step[] {
    switch (power) {
      case P.RowBlaster:
        return this.clearAndStep(this.mergeCells([this.lineCells(atPos.r, true), consumed]), collected, [{ kind: 'rows', r: atPos.r }], 0, bonusIds);
      case P.ColBlaster:
        return this.clearAndStep(this.mergeCells([this.lineCells(atPos.c, false), consumed]), collected, [{ kind: 'cols', c: atPos.c }], 0, bonusIds);
      case P.Bomb:
        return this.clearAndStep(this.mergeCells([this.areaCells(atPos, 1), consumed]), collected, [{ kind: 'bomb', r: atPos.r, c: atPos.c }], 0, bonusIds);
      case P.Prism:
        return this.prismZap(fromKind, atPos, consumed, collected, bonusIds);
      default:
        return [];
    }
  }

  private triggerCombined(
    combo: CombinedPower,
    a: Pos,
    b: Pos,
    kindA: GemKind,
    collected: CollectDelta,
    consumed: Pos[],
    bonusIds: number[] = [],
  ): Step[] {
    switch (combo) {
      case 'cross':
        return this.clearAndStep(
          this.mergeCells([this.lineCells(a.r, true), this.lineCells(b.c, false), consumed]),
          collected,
          [{ kind: 'rows', r: a.r }, { kind: 'cols', c: b.c }],
          0,
          bonusIds,
        );
      case 'megabomb':
        return this.clearAndStep(this.mergeCells([this.areaCells(a, 2), consumed]), collected, [{ kind: 'bomb', r: a.r, c: a.c }], 0, bonusIds);
      case 'wiperow':
        return this.clearAndStep(
          this.mergeCells([this.lineCells(a.r, true), this.lineCells(b.r, true), consumed]),
          collected,
          [{ kind: 'rows', r: a.r }, { kind: 'rows2', r: b.r }],
          0,
          bonusIds,
        );
      case 'wipecol':
        return this.clearAndStep(
          this.mergeCells([this.lineCells(a.c, false), this.lineCells(b.c, false), consumed]),
          collected,
          [{ kind: 'cols', c: a.c }, { kind: 'cols2', c: b.c }],
          0,
          bonusIds,
        );
      case 'colorblasters': {
        // Every gem of kindA fires its own row blaster, all in one clear step.
        const cellLists = this.findAllKind(kindA).map((p) => this.lineCells(p.r, true));
        return this.clearAndStep(this.mergeCells([...cellLists, consumed]), collected, [{ kind: 'rows', r: a.r }], 0, bonusIds);
      }
      case 'wipe': {
        const cells: Pos[] = [];
        for (let r = 0; r < this.bounds.rows; r++) {
          for (let c = 0; c < this.bounds.cols; c++) cells.push({ r, c });
        }
        return this.clearAndStep(this.mergeCells([cells, consumed]), collected, [{ kind: 'wipe', r: a.r, c: a.c }], 0, bonusIds);
      }
    }
  }

  private findAllKind(kind: GemKind): Pos[] {
    const res: Pos[] = [];
    for (let r = 0; r < this.bounds.rows; r++) {
      for (let c = 0; c < this.bounds.cols; c++) {
        const g = this.grid[r]![c];
        if (g && g.kind === kind) res.push({ r, c });
      }
    }
    return res;
  }

  private lineCells(index: number, horizontal: boolean): Pos[] {
    const cells: Pos[] = [];
    if (horizontal) {
      for (let c = 0; c < this.bounds.cols; c++) cells.push({ r: index, c });
    } else {
      for (let r = 0; r < this.bounds.rows; r++) cells.push({ r, c: index });
    }
    return cells;
  }

  private areaCells(center: Pos, radius: number): Pos[] {
    const cells: Pos[] = [];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        cells.push({ r: center.r + dr, c: center.c + dc });
      }
    }
    return cells;
  }

  /** Dedupe cell lists and keep only playable cells. */
  private mergeCells(lists: Pos[][]): Pos[] {
    const seen = new Set<string>();
    const out: Pos[] = [];
    for (const list of lists) {
      for (const p of list) {
        const k = `${p.r},${p.c}`;
        if (seen.has(k) || !this.inPlay(p.r, p.c)) continue;
        seen.add(k);
        out.push(p);
      }
    }
    return out;
  }

  private prismZap(targetKind: GemKind, srcPos: Pos, consumed: Pos[], collected: CollectDelta, bonusIds: number[] = []): Step[] {
    const steps: Step[] = [];
    steps.push({ kind: 'prismZap', srcId: idAt(this.grid, srcPos), srcPos, kind0: targetKind });
    const cells = this.mergeCells([this.findAllKind(targetKind), consumed]);
    steps.push(...this.clearAndStep(cells, collected, [{ kind: 'prism', r: srcPos.r, c: srcPos.c }], 0, bonusIds));
    return steps;
  }

  /** Clear every removable gem in `cells`, then emit a single visual clear step.
   *  `bonusIds` — фигурки потраченных бонусов, исчезающие вместе с очисткой. */
  private clearAndStep(cells: Pos[], collected: CollectDelta, fx: FxSpec[] = [], cascade = 0, bonusIds: number[] = []): Step[] {
    const acc = this.clearCells(cells, collected);
    if (acc.ids.length > 0) this.obj.score += acc.ids.length * gemScore(1);
    const step = this.makeClearStep(cells, acc, cascade, fx, bonusIds);
    return acc.chains.length > 0 ? [step, { kind: 'chainBreak', ids: acc.chains }] : [step];
  }

  /** Был ли в свапе бонусный гем (для пауза-защиты и подсказок). */
  hasPowerGem(a: Pos, b: Pos): boolean {
    const ga = this.grid[a.r]?.[a.c];
    const gb = this.grid[b.r]?.[b.c];
    return (ga !== undefined && ga !== null && ga.power !== P.None) ||
      (gb !== undefined && gb !== null && gb.power !== P.None);
  }

  /** Mechanically remove gems at cells. Ice/chained gems lose one layer and survive. */
  private clearCells(
    cells: Pos[],
    collected: CollectDelta,
  ): { ids: number[]; ice: Pos[]; chains: number[] } {
    const ids: number[] = [];
    const ice: Pos[] = [];
    const chains: number[] = [];
    for (const p of cells) {
      if (!this.inPlay(p.r, p.c)) continue;
      const gem = this.grid[p.r]![p.c];
      if (!gem) continue;
      if (gem.ice > 0) {
        gem.ice -= 1;
        collected.ice += 1;
        this.obj.ice += 1;
        ice.push(p);
        continue;
      }
      if (gem.chain > 0) {
        gem.chain -= 1;
        chains.push(gem.id);
        continue;
      }
      this.collectGems([p], collected);
      ids.push(gem.id);
      this.grid[p.r]![p.c] = null;
    }
    return { ids, ice, chains };
  }

  private makeClearStep(
    cells: Pos[],
    acc: { ids: number[]; ice: Pos[]; chains: number[] },
    cascade: number,
    fx: FxSpec[] = [],
    bonusIds: number[] = [],
  ): Step {
    return { kind: 'clear', info: { cells, ids: acc.ids, ice: acc.ice, chains: acc.chains, bonusIds, fx, scoreGain: 0, cascade } };
  }

  // ============ Clearing / cascades ============

  private resolveGroups(
    groups: MatchGroup[],
    cascade: number,
    collected: CollectDelta,
    steps: Step[],
    prefer: Pos[] = [],
  ): ClearInfo {
    const allCells = new Map<string, Pos>();
    let score = 0;
    const spawnAt = new Map<string, { pos: Pos; power: Power; from: GemKind }>();

    for (const g of groups) {
      const power = powerForShape(g.shape);
      for (const p of g.cells) allCells.set(`${p.r},${p.c}`, p);
      if (power !== P.None) {
        // Бонус появляется в клетке, куда игрок передвинул гем, иначе — в середине группы.
        const preferred = prefer.find((p) => g.cells.some((q) => q.r === p.r && q.c === p.c));
        const mid = preferred ?? g.cells[Math.floor(g.cells.length / 2)]!;
        spawnAt.set(`${mid.r},${mid.c}`, { pos: mid, power, from: g.kind });
      }
    }

    const cells = [...allCells.values()];
    const acc = this.clearCells(cells, collected);

    score += acc.ice.length * iceScore();
    score += acc.chains.length * chainBreakScore();
    score += acc.ids.length * gemScore(cascade);

    const info: ClearInfo = { cells, ids: acc.ids, ice: acc.ice, chains: acc.chains, bonusIds: [], fx: [], scoreGain: score, cascade };
    steps.push({ kind: 'clear', info });
    if (acc.chains.length > 0) steps.push({ kind: 'chainBreak', ids: acc.chains });

    for (const s of spawnAt.values()) {
      const gem = makeGem(s.from, this.nextId++);
      gem.power = s.power;
      this.grid[s.pos.r]![s.pos.c] = gem;
      steps.push({ kind: 'powerSpawn', pos: s.pos, power: s.power, from: s.from, id: gem.id });
      score += powerSpawnBonus(s.power);
    }
    return info;
  }

  private collectGems(cells: Pos[], collected: CollectDelta): void {
    for (const p of cells) {
      const gem = this.grid[p.r]![p.c];
      if (!gem) continue;
      const goal = this.level.goals.find((g) => g.kind === 'collect' && g.gem === gem.kind);
      if (goal) {
        collected.gem = gem.kind;
        const k = gem.kind as number;
        (collected as unknown as Record<number, number>)[k] = ((collected as unknown as Record<number, number>)[k] ?? 0) + 1;
        this.obj.collected[gem.kind] = (this.obj.collected[gem.kind] ?? 0) + 1;
      }
    }
  }



  // ============ Gravity / refill ============

  private applyGravityAndRefill(steps: Step[]): void {
    const moves: Array<{ id: number; from: Pos; to: Pos; dist: number }> = [];
    const newGems: Array<{ id: number; to: Pos; dropCells: number; kind: GemKind; power: Power; ice: number; chain: number }> = [];
    const b = this.bounds;
    for (let c = 0; c < b.cols; c++) {
      // Нижняя граница падения — нижняя ИГРАБЕЛЬНАЯ клетка столбца: иначе гемы
      // оседают в заблокированных клетках, и фигура маски разрушается.
      let write = b.rows - 1;
      while (write >= 0 && !this.inPlay(write, c)) write--;
      for (let r = write; r >= 0; r--) {
        if (!this.inPlay(r, c)) continue;
        const gem = this.grid[r]![c];
        if (gem !== null) {
          if (write !== r) {
            moves.push({ id: gem.id, from: { r, c }, to: { r: write, c }, dist: write - r });
            this.grid[write]![c] = gem;
            this.grid[r]![c] = null;
          }
          write--;
          while (write >= 0 && !this.inPlay(write, c)) write--;
        }
      }
      // Дозаполняем ВСЕ пустые играбельные клетки: у масок столбец может
      // состоять из нескольких сегментов (крест, рамка).
      for (let r = b.rows - 1; r >= 0; r--) {
        if (!this.inPlay(r, c)) continue;
        if (this.grid[r]![c] !== null) continue;
        const kind = this.rng.int(0, this.level.colors - 1) as GemKind;
        const gem = makeGem(kind, this.nextId++);
        this.grid[r]![c] = gem;
        // Полный снимок: к проигрыванию шага поле уже изменилось, позиция в нём не совпадает.
        // dropCells = r + 1: все новые гемы стартуют ровно над верхним краем поля.
        newGems.push({ id: gem.id, to: { r, c }, dropCells: r + 1, kind: gem.kind, power: gem.power, ice: gem.ice, chain: gem.chain });
      }
    }
    if (moves.length > 0 || newGems.length > 0) steps.push({ kind: 'fall', moves, newGems });
  }

  // ============ Shuffle ============

  private shuffleBoard(): void {
    for (let attempt = 0; attempt < 60; attempt++) {
      const kinds: GemKind[] = [];
      const cells: Pos[] = [];
      for (let r = 0; r < this.bounds.rows; r++) {
        for (let c = 0; c < this.bounds.cols; c++) {
          const gem = this.grid[r]![c];
          if (gem && this.inPlay(r, c)) {
            kinds.push(gem.kind);
            cells.push({ r, c });
          }
        }
      }
      // Fisher-Yates with rng.
      for (let i = kinds.length - 1; i > 0; i--) {
        const j = this.rng.int(0, i);
        const tmp = kinds[i]!;
        kinds[i] = kinds[j]!;
        kinds[j] = tmp;
      }
      for (let i = 0; i < cells.length; i++) {
        const p = cells[i]!;
        const gem = this.grid[p.r]![p.c]!;
        gem.kind = kinds[i]!;
      }
      if (this.findAnyMatch().length === 0 && this.hasValidMove()) return;
    }
    // Give up: refill whole board.
    for (const row of this.grid) row.fill(null);
    this.fillInitial();
  }

  // ============ Goals ============

  checkGoals(): boolean {
    for (const g of this.level.goals) {
      if (g.kind === 'score' && this.obj.score < g.amount) return false;
      if (g.kind === 'ice' && this.obj.ice < g.amount) return false;
      if (g.kind === 'collect' && g.gem !== undefined) {
        if ((this.obj.collected[g.gem] ?? 0) < g.amount) return false;
      }
    }
    this.won = true;
    return true;
  }

  /** Is the level still achievable with remaining moves? Simple heuristic. */
  goalStillPossible(): boolean {
    if (this.movesLeft <= 0) return this.checkGoals();
    return true;
  }

  // ============ Суперспособности (за рекламу) ============

  /** Бомба по выбранной клетке: взрыв 3×3. Ход не тратится. */
  useSuperBomb(pos: Pos): MoveResult {
    const cells = this.mergeCells([this.areaCells(pos, 1), [pos]]);
    return this.fireSuperAt(cells, [{ kind: 'bomb', r: pos.r, c: pos.c }]);
  }

  /** Молния: убирает один любой кристалл. Ход не тратится. */
  useSuperLightning(pos: Pos): MoveResult {
    return this.fireSuperAt([pos], [{ kind: 'bolt', r: pos.r, c: pos.c }]);
  }

  /** +2 хода. Ход не тратится. */
  useExtraMoves(n = 2): MoveResult {
    this.movesLeft += n;
    return { steps: [], valid: true, score: 0, maxCascade: 0, collected: { ice: 0 }, won: this.checkGoals(), possible: true, movesLeft: this.movesLeft };
  }

  private fireSuperAt(cells: Pos[], fx: FxSpec[]): MoveResult {
    const steps: Step[] = [];
    this.lastObjScoreAtMoveStart = this.obj.score;
    const collected: CollectDelta = { ice: 0 };
    let maxCascade = 0;

    steps.push(...this.clearAndStep(cells, collected, fx));
    this.applyGravityAndRefill(steps);

    let cascade = 0;
    while (true) {
      const groups = this.findAnyMatch();
      if (groups.length === 0) break;
      cascade++;
      maxCascade = Math.max(maxCascade, cascade);
      this.obj.score += this.resolveGroups(groups, cascade, collected, steps).scoreGain;
      this.applyGravityAndRefill(steps);
    }

    if (!this.hasValidMove()) {
      this.shuffleBoard();
      steps.push({ kind: 'shuffle' });
    }
    const won = this.checkGoals();
    return {
      steps,
      valid: true,
      score: this.obj.score - this.lastObjScoreAtMoveStart,
      maxCascade,
      collected,
      won,
      possible: true,
      movesLeft: this.movesLeft,
    };
  }
}

export type CombinedPower = 'cross' | 'megabomb' | 'wiperow' | 'wipecol' | 'colorblasters' | 'wipe';

export function combinePowers(pa: Power, pb: Power): CombinedPower {
  const isBlast = (p: Power) => p === P.RowBlaster || p === P.ColBlaster;
  if (pa === P.Prism && pb === P.Prism) return 'wipe';
  if (pa === P.Prism || pb === P.Prism) return 'colorblasters';
  if (pa === P.Bomb && pb === P.Bomb) return 'megabomb';
  if (isBlast(pa) && isBlast(pb)) {
    const rowA = pa === P.RowBlaster;
    const rowB = pb === P.RowBlaster;
    if (rowA && rowB) return 'wiperow';
    if (!rowA && !rowB) return 'wipecol';
    return 'cross';
  }
  if (pa === P.Bomb || pb === P.Bomb) return 'megabomb';
  return 'cross';
}

export function findHint(engine: Engine): [Pos, Pos] | null {
  const swaps = engine.findAllValidSwaps();
  if (swaps.length === 0) return null;
  return swaps[0]!;
}

export function goalProgress(obj: ObjectiveState, goal: Goal): number {
  if (goal.kind === 'score') return Math.min(1, obj.score / goal.amount);
  if (goal.kind === 'ice') return Math.min(1, obj.ice / goal.amount);
  if (goal.gem !== undefined) {
    return Math.min(1, (obj.collected[goal.gem] ?? 0) / goal.amount);
  }
  return 1;
}
