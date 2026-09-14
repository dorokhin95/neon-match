// Board view: keeps animated visuals for every gem, plays engine Step lists,
// and converts pointer input into swap requests.

import type { Cell, ClearInfo, Pos, Power, Step } from '../core/types';
import { Power as P } from '../core/types';
import type { Engine } from '../core/engine';
import { drawChainOverlay, drawGemBody, drawIceOverlay, drawPowerOverlay, GEM_COLORS, POWER_COLORS } from './gem';
import { Particles } from './particles';
import { Ease, TweenPool, type EaseFn, type Tween } from './tweens';

interface VisualGem {
  id: number;
  kind: number;
  power: Power;
  ice: number;
  chain: number;
  r: number;
  c: number;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  bob: number;
  /** Active movement tween, so it can be cancelled when the gem is re-targeted. */
  moveTween: Tween | null;
}

interface DyingGem {
  x: number;
  y: number;
  kind: number;
  t: number;
  dur: number;
}

export interface BoardMetrics {
  x: number;
  y: number;
  cell: number;
}

export class Board {
  engine: Engine;
  particles: Particles;
  tweens = new TweenPool();
  metrics: BoardMetrics = { x: 0, y: 0, cell: 40 };
  onSwap?: (a: Pos, b: Pos) => void;
  /** Активная суперспособность, ожидающая выбор клетки (бомба/молния). */
  armedSuper: 'bomb' | 'lightning' | null = null;
  onSuper?: (kind: 'bomb' | 'lightning', pos: Pos) => void;
  /** Вызывается при срабатывании бонуса: 'rows' | 'cols' | 'bomb' | 'prism' | 'wipe'… */
  onPowerFx?: (fx: string) => void;
  busy = false;
  hintPair: [Pos, Pos] | null = null;

  private visuals = new Map<number, VisualGem>();
  private visualList: VisualGem[] = [];
  private dying: DyingGem[] = [];
  private selected: Pos | null = null;
  private t = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private pressPos: { x: number; y: number } | null = null;
  private wobble = 0;

  constructor(engine: Engine, particles: Particles) {
    this.engine = engine;
    this.particles = particles;
    this.syncAll();
  }

  setMetrics(m: BoardMetrics): void {
    const oldCell = this.metrics.cell;
    this.metrics = m;
    if (oldCell !== m.cell) {
      for (const v of this.visuals.values()) {
        v.x = this.cellX(v.c);
        v.y = this.cellY(v.r);
      }
    }
  }

  private cellX(c: number): number {
    return this.metrics.x + c * this.metrics.cell + this.metrics.cell / 2;
  }

  private cellY(r: number): number {
    return this.metrics.y + r * this.metrics.cell + this.metrics.cell / 2;
  }

  cellAt(px: number, py: number): Pos | null {
    const c = Math.floor((px - this.metrics.x) / this.metrics.cell);
    const r = Math.floor((py - this.metrics.y) / this.metrics.cell);
    const rows = this.engine.bounds.rows;
    const cols = this.engine.bounds.cols;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    if (this.engine.mask && !this.engine.mask[r]![c]) return null;
    return { r, c };
  }

  // ============ Sync ============

  syncAll(): void {
    this.tweens.clear();
    this.visuals.clear();
    this.visualList.length = 0;
    this.dying.length = 0;
    const g = this.engine.grid;
    for (let r = 0; r < this.engine.bounds.rows; r++) {
      for (let c = 0; c < this.engine.bounds.cols; c++) {
        const gem = g[r]?.[c];
        if (gem) this.addVisual(this.makeVisual(gem, r, c));
      }
    }
  }

  /** Realign all visuals with the engine grid without killing running tweens. */
  resnap(): void {
    for (let r = 0; r < this.engine.bounds.rows; r++) {
      for (let c = 0; c < this.engine.bounds.cols; c++) {
        const gem = this.engine.grid[r]?.[c];
        if (!gem) continue;
        const v = this.visuals.get(gem.id);
        if (!v) {
          this.addVisual(this.makeVisual(gem, r, c));
          continue;
        }
        v.kind = gem.kind;
        v.power = gem.power;
        v.ice = gem.ice;
        v.chain = gem.chain;
        v.r = r;
        v.c = c;
        this.killTweensFor(v);
        v.x = this.cellX(c);
        v.y = this.cellY(r);
        v.scale = 1;
        v.alpha = 1;
      }
    }
    for (const v of [...this.visualList]) {
      if (!this.visuals.has(v.id)) continue;
      if (!this.engine.grid[v.r]?.[v.c] || this.engine.grid[v.r]![v.c]!.id !== v.id) {
        this.removeVisual(v.id);
      }
  }
  }

  private addVisual(v: VisualGem): void {
    this.visuals.set(v.id, v);
    this.visualList.push(v);
  }

  private removeVisual(id: number): void {
    this.visuals.delete(id);
    const i = this.visualList.findIndex((v) => v.id === id);
    if (i >= 0) this.visualList.splice(i, 1);
  }

  private makeVisual(gem: Cell, r: number, c: number): VisualGem {
    return {
      id: gem!.id,
      kind: gem!.kind,
      power: gem!.power,
      ice: gem!.ice,
      chain: gem!.chain,
      r,
      c,
      x: this.cellX(c),
      y: this.cellY(r),
      scale: 1,
      alpha: 1,
      bob: Math.random() * Math.PI * 2,
      moveTween: null,
    };
  }

  // ============ Step playback ============

  async playSteps(steps: Step[]): Promise<void> {
    this.busy = true;
    for (const s of steps) {
      await this.playStep(s);
    }
    this.syncAll();
    this.busy = false;
  }

  private wait(sec: number): Promise<void> {
    return new Promise((res) => {
      let t = 0;
      const id = window.setInterval(() => {
        t += 0.016;
        if (t >= sec || !this.busy) {
          window.clearInterval(id);
          res();
        }
      }, 16);
    });
  }

  private async playStep(s: Step): Promise<void> {
    switch (s.kind) {
      case 'swap': {
        const va = this.visuals.get(s.idA);
        const vb = this.visuals.get(s.idB);
        if (va && vb) {
          this.animateMove(va, s.b, 0.22, Ease.outCubic);
          this.animateMove(vb, s.a, 0.22, Ease.outCubic);
        }
        await this.wait(0.24);
        break;
      }
      case 'swapBack': {
        const va = this.visuals.get(s.idA);
        const vb = this.visuals.get(s.idB);
        if (va && vb) {
          this.animateMove(va, s.a, 0.2, Ease.outCubic);
          this.animateMove(vb, s.b, 0.2, Ease.outCubic);
        }
        await this.wait(0.22);
        break;
      }
      case 'clear': {
        this.playClear(s.info);
        await this.wait(0.3);
        break;
      }
      case 'powerSpawn': {
        let v = this.visuals.get(s.id);
        if (v) {
          v.kind = s.from;
          v.power = s.power;
          v.ice = 0;
          v.chain = 0;
        } else {
          v = this.makeVisual(
            { kind: s.from, power: s.power, ice: 0, chain: 0, id: s.id },
            s.pos.r,
            s.pos.c,
          );
          this.addVisual(v);
        }
        this.killTweensFor(v);
        v.x = this.cellX(s.pos.c);
        v.y = this.cellY(s.pos.r);
        v.r = s.pos.r;
        v.c = s.pos.c;
        v.scale = 0.2;
        this.tweens.add((t) => {
          v!.scale = 0.2 + 0.8 * t;
        }, 0.28, Ease.outBack);
        await this.wait(0.3);
        break;
      }
      case 'fall': {
        let maxDur = 0;
        for (const m of s.moves) {
          const v = this.visuals.get(m.id);
          if (!v) continue;
          this.killTweensFor(v);
          v.r = m.to.r;
          v.c = m.to.c;
          const dur = 0.14 + m.dist * 0.05;
          maxDur = Math.max(maxDur, dur);
          this.animateMove(v, m.to, dur, Ease.inQuad);
        }
        // Свежесозданные гемы появляются стопкой над полем и падают на места.
        for (const ng of s.newGems) {
          if (this.visuals.has(ng.id)) continue; // уже анимируется из прошлого каскада
          const v = this.makeVisual(
            { kind: ng.kind, power: ng.power, ice: ng.ice, chain: ng.chain, id: ng.id },
            ng.to.r,
            ng.to.c,
          );
          v.y = this.cellY(ng.to.r) - ng.dropCells * this.metrics.cell;
          this.addVisual(v);
          const dur = 0.16 + ng.dropCells * 0.05;
          maxDur = Math.max(maxDur, dur);
          this.animateMove(v, ng.to, dur, Ease.inQuad);
        }
        if (maxDur > 0) await this.wait(maxDur + 0.05);
        break;
      }
      case 'shuffle': {
        this.syncAll();
        this.wobble = 1;
        this.tweens.add((t) => {
          this.wobble = 1 - t;
        }, 0.5);
        await this.wait(0.55);
        break;
      }
      case 'prismZap': {
        const src = s.srcId >= 0 ? this.visuals.get(s.srcId) : undefined;
        const cx = src ? src.x : this.cellX(s.srcPos.c);
        const cy = src ? src.y : this.cellY(s.srcPos.r);
        this.particles.ring(cx, cy, 130, '#ffffff', 0.5);
        await this.wait(0.15);
        break;
      }
      case 'chainBreak': {
        for (const id of s.ids) {
          const v = this.visuals.get(id);
          if (v) this.particles.burst(v.x, v.y, '#ffd166', 8, 0.7);
        }
        await this.wait(0.2);
        break;
      }
    }
  }

  /** Cancel tweens that move this visual so a new animation starts cleanly. */
  private killTweensFor(v: VisualGem): void {
    if (v.moveTween) {
      v.moveTween.cancel();
      v.moveTween = null;
    }
  }

  private playClear(info: ClearInfo): void {
    this.playClearFx(info);
    const power = 1 + info.cascade * 0.18;
    for (const p of info.cells) {
      const kind = this.kindAtPosition(p, info.ids);
      const x = this.cellX(p.c);
      const y = this.cellY(p.r);
      const color = GEM_COLORS[kind % GEM_COLORS.length]!.glow;
      this.particles.burst(x, y, color, 10 + info.cascade * 2, power);
      this.particles.ring(x, y, this.metrics.cell * 0.9 * power, color, 0.4);
      if (info.cascade >= 2) {
        this.particles.popup(x, y - 8, `+${Math.round(60 * info.cascade)}`, GEM_COLORS[kind % GEM_COLORS.length]!.light, 15);
      }
    }
    for (const id of info.ids) {
      const v = this.visuals.get(id);
      if (v) {
        this.dying.push({ x: v.x, y: v.y, kind: v.kind, t: 0, dur: 0.26 });
        this.killTweensFor(v);
        this.removeVisual(id);
      }
    }
    // Потраченные бонус-фигурки исчезают вместе с очисткой (без очков за них).
    for (const id of info.bonusIds ?? []) {
      const v = this.visuals.get(id);
      if (v) {
        this.dying.push({ x: v.x, y: v.y, kind: v.kind, t: 0, dur: 0.3 });
        this.killTweensFor(v);
        this.removeVisual(id);
      }
    }
    for (const p of info.ice) {
      const v = this.visualAt(p);
      if (v) {
        v.ice = Math.max(0, v.ice - 1);
        this.particles.burst(v.x, v.y, 'rgba(190, 225, 255, 0.9)', 6, 0.6);
      }
    }
    for (const id of info.chains) {
      const v = this.visuals.get(id);
      if (v) v.chain = Math.max(0, v.chain - 1);
    }
  }

  /** Gem kind for particle color: from a surviving visual at the cell, else dying-list color. */
  private kindAtPosition(p: Pos, _ids: number[]): number {
    const v = this.visualAt(p);
    if (v) return v.kind;
    const gem = this.engine.grid[p.r]?.[p.c];
    return gem ? gem.kind : 0;
  }

  /** Киношные эффекты бонусов: лучи, ударные волны, молнии — строго в месте срабатывания. */
  private playClearFx(info: ClearInfo): void {
    const m = this.metrics;
    const w = this.engine.bounds.cols * m.cell;
    const h = this.engine.bounds.rows * m.cell;
    for (const fx of info.fx ?? []) {
      this.onPowerFx?.(fx.kind);
      const cx = this.cellX(fx.c ?? 0);
      const cy = this.cellY(fx.r ?? 0);
      switch (fx.kind) {
        case 'rows':
        case 'rows2':
          this.particles.beam(m.x, cy, m.x + w, cy, POWER_COLORS[1]!, 10, 0.4);
          this.particles.wave(this.cellX(fx.c ?? 0), cy, m.cell * 1.2, '#ffffff', 0.3);
          break;
        case 'cols':
        case 'cols2':
          this.particles.beam(cx, m.y, cx, m.y + h, POWER_COLORS[2]!, 10, 0.4);
          this.particles.wave(cx, this.cellY(fx.r ?? 0), m.cell * 1.2, '#ffffff', 0.3);
          break;
        case 'bomb':
          this.particles.wave(cx, cy, m.cell * 2.6, POWER_COLORS[3]!, 0.5);
          break;
        case 'bolt':
          // Молния бьёт сверху в выбранную клетку + вспышка в точке удара.
          this.particles.lightning(cx, m.y - m.cell * 0.8, cx, cy, '#facc15', 0.35);
          this.particles.wave(cx, cy, m.cell * 1.4, '#facc15', 0.35);
          break;
        case 'wipe':
          this.particles.wave(m.x + w / 2, m.y + h / 2, Math.max(w, h) * 0.75, '#ffffff', 0.7);
          break;
        default:
          break;
      }
    }
    // Призма: молнии летят из точки прицела к гемам-целям.
    const prismFx = (info.fx ?? []).find((f) => f.kind === 'prism');
    if (prismFx) {
      const sx = this.cellX(prismFx.c ?? 0);
      const sy = this.cellY(prismFx.r ?? 0);
      for (let i = 0; i < Math.min(info.cells.length, 12); i++) {
        const p = info.cells[i]!;
        this.particles.lightning(sx, sy, this.cellX(p.c), this.cellY(p.r), '#e0e7ff', 0.32);
      }
    }
  }

  private visualAt(p: Pos): VisualGem | undefined {
    return this.visualList.find((v) => v.r === p.r && v.c === p.c);
  }

  private animateMove(v: VisualGem, to: Pos, dur: number, ease: EaseFn = Ease.outQuad): void {
    if (v.moveTween) v.moveTween.cancel();
    const fromX = v.x;
    const fromY = v.y;
    const toX = this.cellX(to.c);
    const toY = this.cellY(to.r);
    v.moveTween = this.tweens.add((t) => {
      v.x = fromX + (toX - fromX) * t;
      v.y = fromY + (toY - fromY) * t;
    }, dur, ease);
  }

  shake(amp: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = 0.35;
  }

  select(p: Pos | null): void {
    this.selected = p;
  }

  getSelected(): Pos | null {
    return this.selected;
  }

  // ============ Input ============

  pointerDown(px: number, py: number): void {
    if (this.busy) return;
    const cell = this.cellAt(px, py);
    if (!cell) return;
    // Режим суперспособности: тап по клетке применяет бомбу/молнию, свапы отключены.
    if (this.armedSuper) {
      const kind = this.armedSuper;
      this.armedSuper = null;
      this.selected = null;
      this.pressPos = null;
      this.onSuper?.(kind, cell);
      return;
    }
    this.pressPos = { x: px, y: py };
    const sel = this.selected;
    if (sel && Math.abs(sel.r - cell.r) + Math.abs(sel.c - cell.c) === 1) {
      this.onSwap?.(sel, cell);
      this.selected = null;
      this.pressPos = null;
      return;
    }
    this.selected = cell;
  }

  pointerMove(px: number, py: number): void {
    if (this.busy || !this.pressPos || !this.selected) return;
    const dx = px - this.pressPos.x;
    const dy = py - this.pressPos.y;
    const thresh = this.metrics.cell * 0.35;
    if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;
    const cell = this.cellAt(px, py);
    if (!cell) return;
    let target: Pos | null = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      target = { r: this.selected.r, c: this.selected.c + (dx > 0 ? 1 : -1) };
    } else {
      target = { r: this.selected.r + (dy > 0 ? 1 : -1), c: this.selected.c };
    }
    if (target) {
      const t = this.cellAt(this.cellX(target.c), this.cellY(target.r));
      if (t) {
        this.onSwap?.(this.selected, t);
      }
      this.selected = null;
      this.pressPos = null;
    }
  }

  pointerUp(): void {
    this.pressPos = null;
  }

  // ============ Update / draw ============

  update(dt: number): void {
    this.t += dt;
    this.tweens.update(dt);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt * 2);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i]!;
      d.t += dt;
      if (d.t >= d.dur) this.dying.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const m = this.metrics;
    const rows = this.engine.bounds.rows;
    const cols = this.engine.bounds.cols;
    const w = cols * m.cell;
    const h = rows * m.cell;

    ctx.save();
    if (this.shakeAmp > 0) {
      const s = this.shakeAmp * (this.shakeT / 0.35);
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    if (this.wobble > 0) {
      ctx.translate(w / 2 + m.x, h / 2 + m.y);
      ctx.rotate(Math.sin(this.t * 30) * 0.015 * this.wobble);
      ctx.translate(-(w / 2 + m.x), -(h / 2 + m.y));
    }

    // Board panel + sockets
    ctx.save();
    roundRect(ctx, m.x - 8, m.y - 8, w + 16, h + 16, 20);
    ctx.fillStyle = 'rgba(10, 14, 32, 0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(130, 170, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.engine.mask && !this.engine.mask[r]![c]) continue;
        const x = m.x + c * m.cell;
        const y = m.y + r * m.cell;
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.015)';
        roundRect(ctx, x + 2, y + 2, m.cell - 4, m.cell - 4, 8);
        ctx.fill();
      }
    }

    // Hint pulse
    if (this.hintPair) {
      const pulse = 0.5 + Math.sin(this.t * 6) * 0.5;
      for (const p of this.hintPair) {
        const x = m.x + p.c * m.cell;
        const y = m.y + p.r * m.cell;
        ctx.strokeStyle = `rgba(255, 230, 120, ${0.35 + pulse * 0.5})`;
        ctx.lineWidth = 2.5;
        roundRect(ctx, x + 3, y + 3, m.cell - 6, m.cell - 6, 9);
        ctx.stroke();
      }
    }

    // Dying gems (shrink + fade)
    for (const d of this.dying) {
      const t = d.t / d.dur;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.globalAlpha = 1 - t;
      const s = m.cell * 0.5 * (1 - t * 0.6);
      drawGemBody(ctx, d.kind, s, 1 - t);
      ctx.restore();
    }

    // Gems
    for (const v of this.visualList) {
      const idleBob = Math.sin(this.t * 2 + v.bob) * 1.2;
      ctx.save();
      ctx.translate(v.x, v.y + idleBob);
      ctx.globalAlpha = v.alpha;
      const s = (m.cell * 0.5) * v.scale;
      drawGemBody(ctx, v.kind, s, v.alpha);
      if (v.power !== P.None) drawPowerOverlay(ctx, v.power, s, this.t);
      if (v.ice > 0) drawIceOverlay(ctx, v.ice, s, this.t);
      if (v.chain > 0) drawChainOverlay(ctx, s);
      ctx.restore();
    }

    // Selection ring
    if (this.selected) {
      const pulse = 0.6 + Math.sin(this.t * 8) * 0.4;
      const x = m.x + this.selected.c * m.cell;
      const y = m.y + this.selected.r * m.cell;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.5})`;
      ctx.shadowColor = 'rgba(103, 232, 249, 0.9)';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.5;
      roundRect(ctx, x + 3, y + 3, m.cell - 6, m.cell - 6, 9);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Частицы рисуются внутри трансформации поля: тряска и покачивание двигают и их,
    // иначе взрывы «уезжают» относительно гемов при каскадах.
    this.particles.draw(ctx, window.innerWidth);

    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
