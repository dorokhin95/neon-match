// Particle system: match bursts, glow rings, floating score text.

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  glow: boolean;
  gravity: number;
}

interface Ring {
  active: boolean;
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Popup {
  active: number;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

interface ShootingStar {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

/** Луч линейного бластера через всё поле. */
interface Beam {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

/** Расходящаяся ударная волна бомбы. */
interface Wave {
  active: boolean;
  x: number;
  y: number;
  maxR: number;
  life: number;
  maxLife: number;
  color: string;
}

/** Зигзаг-молния призмы к гему-цели. */
interface Bolt {
  active: boolean;
  pts: number[];
  life: number;
  maxLife: number;
  color: string;
}

export class Particles {
  private parts: Particle[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  private shooting: ShootingStar[] = [];
  private beams: Beam[] = [];
  private waves: Wave[] = [];
  private bolts: Bolt[] = [];
  private nextPopup = 0;

  constructor(maxParticles = 320) {
    for (let i = 0; i < maxParticles; i++) {
      this.parts.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 3, color: '#fff', glow: true, gravity: 400 });
    }
    for (let i = 0; i < 24; i++) {
      this.rings.push({ active: false, x: 0, y: 0, r: 0, maxR: 60, life: 0, maxLife: 0.5, color: '#fff' });
    }
    for (let i = 0; i < 12; i++) {
      this.popups.push({ active: 0, x: 0, y: 0, vy: -50, life: 0, maxLife: 0.9, text: '', color: '#fff', size: 18 });
    }
    for (let i = 0; i < 3; i++) {
      this.shooting.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1.2 });
    }
    for (let i = 0; i < 6; i++) {
      this.beams.push({ active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 0.4, color: '#fff', width: 6 });
    }
    for (let i = 0; i < 4; i++) {
      this.waves.push({ active: false, x: 0, y: 0, maxR: 80, life: 0, maxLife: 0.5, color: '#fff' });
    }
    for (let i = 0; i < 24; i++) {
      this.bolts.push({ active: false, pts: [], life: 0, maxLife: 0.3, color: '#fff' });
    }
  }

  /** Горизонтальный/вертикальный луч бластера. */
  beam(x1: number, y1: number, x2: number, y2: number, color: string, width = 6, life = 0.4): void {
    for (const b of this.beams) {
      if (b.active) continue;
      b.active = true;
      b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
      b.color = color;
      b.width = width;
      b.life = 0;
      b.maxLife = life;
      return;
    }
  }

  /** Ударная волна: расширяющееся кольцо с жирной обводкой. */
  wave(x: number, y: number, maxR: number, color: string, life = 0.5): void {
    for (const w of this.waves) {
      if (w.active) continue;
      w.active = true;
      w.x = x; w.y = y;
      w.maxR = maxR;
      w.color = color;
      w.life = 0;
      w.maxLife = life;
      return;
    }
  }

  /** Зигзаг-молния от призмы к цели. */
  lightning(x1: number, y1: number, x2: number, y2: number, color: string, life = 0.3): void {
    for (const b of this.bolts) {
      if (b.active) continue;
      b.active = true;
      b.color = color;
      b.life = 0;
      b.maxLife = life;
      const segs = 8;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const pts: number[] = [x1, y1];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const off = (Math.random() * 2 - 1) * Math.min(16, len * 0.12);
        pts.push(x1 + dx * t + nx * off, y1 + dy * t + ny * off);
      }
      pts.push(x2, y2);
      b.pts = pts;
      return;
    }
  }

  /** Spawn a burst at board cell center (canvas coords). */
  burst(x: number, y: number, color: string, count = 12, power = 1): void {
    let spawned = 0;
    for (let i = 0; i < this.parts.length && spawned < count; i++) {
      const p = this.parts[i]!;
      if (p.active) continue;
      p.active = true;
      const ang = Math.random() * Math.PI * 2;
      const speed = (60 + Math.random() * 160) * power;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed - 40;
      p.life = 0;
      p.maxLife = 0.5 + Math.random() * 0.4;
      p.size = 2 + Math.random() * 3.5 * power;
      p.color = color;
      p.glow = true;
      p.gravity = 420;
      spawned++;
    }
  }

  ring(x: number, y: number, maxR: number, color: string, life = 0.45): void {
    for (const r of this.rings) {
      if (r.active) continue;
      r.active = true;
      r.x = x;
      r.y = y;
      r.r = 6;
      r.maxR = maxR;
      r.life = 0;
      r.maxLife = life;
      r.color = color;
      return;
    }
  }

  popup(x: number, y: number, text: string, color = '#ffe9a3', size = 18): void {
    // Round-robin so rapid popups reuse the oldest slot.
    const p = this.popups[this.nextPopup % this.popups.length]!;
    this.nextPopup++;
    p.active = 1;
    p.x = x;
    p.y = y;
    p.vy = -55;
    p.life = 0;
    p.maxLife = 0.9;
    p.text = text;
    p.color = color;
    p.size = size;
  }

  shootingStar(w: number, _h: number): void {
    for (const s of this.shooting) {
      if (s.active) continue;
      s.active = true;
      s.x = Math.random() * w * 0.7 + w * 0.15;
      s.y = -20;
      s.vx = 60 + Math.random() * 120;
      s.vy = 160 + Math.random() * 140;
      s.life = 0;
      s.maxLife = 1.4;
      return;
    }
  }

  update(dt: number): void {
    for (const p of this.parts) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = false; continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life += dt;
      if (r.life >= r.maxLife) { r.active = false; continue; }
      const t = r.life / r.maxLife;
      r.r = 6 + (r.maxR - 6) * t;
    }
    for (const p of this.popups) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) { p.active = 0; continue; }
      p.y += p.vy * dt;
      p.vy *= (1 - dt * 1.8);
    }
    for (const s of this.shooting) {
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.maxLife) { s.active = false; continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    for (const b of this.beams) {
      if (!b.active) continue;
      b.life += dt;
      if (b.life >= b.maxLife) b.active = false;
    }
    for (const w of this.waves) {
      if (!w.active) continue;
      w.life += dt;
      if (w.life >= w.maxLife) w.active = false;
    }
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life += dt;
      if (b.life >= b.maxLife) b.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, _w: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (!p.active) continue;
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      const t = r.life / r.maxLife;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Лучи бластеров
    for (const b of this.beams) {
      if (!b.active) continue;
      const t = b.life / b.maxLife;
      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * (1 - t * 0.6);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      // белая сердцевина
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, b.width * 0.25 * (1 - t));
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
    // Ударные волны бомб
    for (const w of this.waves) {
      if (!w.active) continue;
      const t = w.life / w.maxLife;
      const ease = 1 - Math.pow(1 - t, 3);
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 6 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, Math.max(1, w.maxR * ease), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Молнии призмы
    for (const b of this.bolts) {
      if (!b.active || b.pts.length < 4) continue;
      const t = b.life / b.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.6 * (1 - t) + 0.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(b.pts[0]!, b.pts[1]!);
      for (let i = 2; i < b.pts.length; i += 2) {
        ctx.lineTo(b.pts[i]!, b.pts[i + 1]!);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Popups (normal blending for readability)
    ctx.save();
    for (const p of this.popups) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `800 ${p.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  drawShootingStars(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.shooting) {
      if (!s.active) continue;
      const t = 1 - s.life / s.maxLife;
      ctx.globalAlpha = t * 0.8;
      const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12);
      ctx.stroke();
    }
    ctx.restore();
  }

  clear(): void {
    for (const p of this.parts) p.active = false;
    for (const r of this.rings) r.active = false;
    for (const p of this.popups) p.active = 0;
    for (const s of this.shooting) s.active = false;
    for (const b of this.beams) b.active = false;
    for (const w of this.waves) w.active = false;
    for (const b of this.bolts) b.active = false;
  }
}
