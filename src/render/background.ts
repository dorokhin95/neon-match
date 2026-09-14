// Animated cosmic background: layered starfield + drifting nebula blobs.
// Тема — тройка оттенков — зависит от номера уровня: техника отрисовки едина,
// но каждая страница уровней чуть другая. При смене темы оттенки плавно
// перетекают; в бесконечном режиме они медленно плывут по кругу («живой» космос).

import { hashSeed } from '../core/rng';

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  tw: number; // twinkle phase
}

interface Blob {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  /** Какой из оттенков темы красит эту туманность. */
  slot: 0 | 1 | 2;
}

export class Background {
  private stars: Star[] = [];
  private blobs: Blob[] = [];
  private t = 0;
  private w = 0;
  private h = 0;
  /** Текущие оттенки темы — плавно догоняют целевые. */
  private hues: [number, number, number] = [250, 190, 320];
  private targets: [number, number, number] = [250, 190, 320];
  private endless = false;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars = [];
    const count = Math.floor((w * h) / 9000);
    for (let i = 0; i < count; i++) {
      const layer = Math.random();
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 0.6 + layer * 1.6,
        speed: 4 + layer * 14,
        tw: Math.random() * Math.PI * 2,
      });
    }
    this.blobs = [
      { x: w * 0.2, y: h * 0.25, r: w * 0.5, dx: 6, dy: 4, slot: 0 },
      { x: w * 0.8, y: h * 0.6, r: w * 0.45, dx: -5, dy: -3, slot: 1 },
      { x: w * 0.5, y: h * 0.9, r: w * 0.4, dx: 4, dy: -5, slot: 2 },
    ];
  }

  /** Тема уровня: детерминированный базовый оттенок + два соседних по кругу. */
  setThemeForLevel(n: number): void {
    this.endless = false;
    const base = hashSeed(n, 77) % 360;
    this.targets = [base, (base + 45) % 360, (base + 315) % 360];
  }

  /** Бесконечный режим: оттенки медленно плывут — фон живёт. */
  setEndless(): void {
    this.endless = true;
  }

  /** Интерполяция оттенка по кратчайшей дуге цветового круга. */
  private static lerpHue(cur: number, target: number, k: number): number {
    const d = ((target - cur + 540) % 360) - 180;
    return (((cur + d * k) % 360) + 360) % 360;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.endless) {
      this.targets[0] = (this.targets[0] + dt * 4) % 360;
      this.targets[1] = (this.targets[0] + 45) % 360;
      this.targets[2] = (this.targets[0] + 315) % 360;
    }
    const k = 1 - Math.exp(-dt * 1.4);
    for (let i = 0; i < 3; i++) {
      this.hues[i] = Background.lerpHue(this.hues[i], this.targets[i], k);
    }
    for (const s of this.stars) {
      s.y += s.speed * dt;
      s.tw += dt * 2;
      if (s.y > this.h) {
        s.y = -2;
        s.x = Math.random() * this.w;
      }
    }
    for (const b of this.blobs) {
      b.x += b.dx * dt;
      b.y += b.dy * dt;
      if (b.x < -b.r || b.x > this.w + b.r) b.dx *= -1;
      if (b.y < -b.r || b.y > this.h + b.r) b.dy *= -1;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const { w, h } = this;
    const [hA, , hC] = this.hues;
    // База — тёмный градиент, подкрашенный темой уровня.
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, `hsl(${hA.toFixed(1)}, 45%, 5%)`);
    base.addColorStop(0.55, `hsl(${hA.toFixed(1)}, 50%, 7%)`);
    base.addColorStop(1, `hsl(${hC.toFixed(1)}, 45%, 8%)`);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Nebula blobs (soft radial gradients, additive)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blobs) {
      const hue = this.hues[b.slot];
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, `hsla(${hue.toFixed(1)}, 80%, 55%, 0.10)`);
      g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Stars
    for (const s of this.stars) {
      const tw = 0.55 + Math.sin(s.tw) * 0.45;
      ctx.globalAlpha = 0.35 + tw * 0.65;
      ctx.fillStyle = '#dfe8ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
