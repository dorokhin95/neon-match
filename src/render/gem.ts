// Procedural neon gem rendering. Each gem kind has a distinct shape AND color
// (colorblind-friendly). Sprites are pre-rendered to offscreen canvases.

import type { Gem } from '../core/types';
import { Power } from '../core/types';

export interface GemPalette {
  base: string;
  light: string;
  dark: string;
  glow: string;
}

export const GEM_COLORS: GemPalette[] = [
  { base: '#22d3ee', light: '#a5f3fc', dark: '#0e7490', glow: 'rgba(34,211,238,0.9)' }, // cyan
  { base: '#f472b6', light: '#fbcfe8', dark: '#9d174d', glow: 'rgba(244,114,182,0.9)' }, // magenta
  { base: '#a78bfa', light: '#ddd6fe', dark: '#5b21b6', glow: 'rgba(167,139,250,0.9)' }, // violet
  { base: '#4ade80', light: '#bbf7d0', dark: '#166534', glow: 'rgba(74,222,128,0.9)' }, // lime
  { base: '#fbbf24', light: '#fde68a', dark: '#92400e', glow: 'rgba(251,191,36,0.9)' }, // amber
  { base: '#fb7185', light: '#fecdd3', dark: '#9f1239', glow: 'rgba(251,113,133,0.9)' }, // coral
];

/** Читаемые сигнальные цвета бонусов: горизонтальный бластер, вертикальный,
 *  бомба и призма. Иконка + цвет дают двойное кодирование. */
export const POWER_COLORS: Record<Power, string> = {
  [Power.None]: 'rgba(255,255,255,0.9)',
  [Power.RowBlaster]: '#facc15',
  [Power.ColBlaster]: '#22d3ee',
  [Power.Bomb]: '#fb7185',
  [Power.Prism]: '#e0e7ff',
};

type Shape = 'circle' | 'diamond' | 'hexagon' | 'triangle' | 'star' | 'teardrop';
const SHAPES: Shape[] = ['circle', 'diamond', 'hexagon', 'triangle', 'star', 'teardrop'];

function traceShape(ctx: CanvasRenderingContext2D, shape: Shape, s: number): void {
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(0, 0, s * 0.82, 0, Math.PI * 2);
      break;
    case 'diamond':
      ctx.moveTo(0, -s * 0.92);
      ctx.lineTo(s * 0.72, 0);
      ctx.lineTo(0, s * 0.92);
      ctx.lineTo(-s * 0.72, 0);
      ctx.closePath();
      break;
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = Math.cos(a) * s * 0.88;
        const y = Math.sin(a) * s * 0.88;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 'triangle':
      ctx.moveTo(0, -s * 0.9);
      ctx.lineTo(s * 0.85, s * 0.62);
      ctx.lineTo(-s * 0.85, s * 0.62);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rad = i % 2 === 0 ? s * 0.95 : s * 0.42;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 'teardrop':
      ctx.moveTo(0, -s * 0.95);
      ctx.bezierCurveTo(s * 0.75, -s * 0.15, s * 0.62, s * 0.7, 0, s * 0.78);
      ctx.bezierCurveTo(-s * 0.62, s * 0.7, -s * 0.75, -s * 0.15, 0, -s * 0.95);
      ctx.closePath();
      break;
  }
}

export function drawGemBody(
  ctx: CanvasRenderingContext2D,
  kind: number,
  s: number,
  alpha = 1,
): void {
  const pal = GEM_COLORS[kind % GEM_COLORS.length]!;
  const shape = SHAPES[kind % SHAPES.length]!;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Outer glow
  ctx.shadowColor = pal.glow;
  ctx.shadowBlur = s * 0.5;

  // Body gradient
  const grad = ctx.createRadialGradient(-s * 0.25, -s * 0.3, s * 0.1, 0, 0, s * 1.1);
  grad.addColorStop(0, pal.light);
  grad.addColorStop(0.55, pal.base);
  grad.addColorStop(1, pal.dark);
  ctx.fillStyle = grad;
  traceShape(ctx, shape, s);
  ctx.fill();

  ctx.shadowBlur = 0;

  // Glossy edge
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, s * 0.06);
  traceShape(ctx, shape, s);
  ctx.stroke();

  // Inner highlight
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-s * 0.22, -s * 0.3, s * 0.18, s * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Иконка бонуса: читаемая и контрастная поверх любого гема.
 *  row: двойная стрелка вправо-влево; col: вверх-вниз; bomb: череповидный
 *  взрыв с искрами; prism: сияющая гранёная «радуга». */
export function drawPowerOverlay(
  ctx: CanvasRenderingContext2D,
  power: Power,
  s: number,
  time = 0,
): void {
  const color = POWER_COLORS[power];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = s * 0.45;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const lw = Math.max(1.6, s * 0.14);
  /** Двойная стрелка: горизонтальная (vertical=false) или вертикальная. */
  const strokeArrows = (vertical: boolean): void => {
    ctx.beginPath();
    if (!vertical) {
      ctx.moveTo(-s * 0.52, 0);
      ctx.lineTo(s * 0.52, 0);
      for (const dir of [-1, 1]) {
        ctx.moveTo(dir * s * 0.52, 0);
        ctx.lineTo(dir * s * 0.3, -s * 0.18);
        ctx.moveTo(dir * s * 0.52, 0);
        ctx.lineTo(dir * s * 0.3, s * 0.18);
      }
    } else {
      ctx.moveTo(0, -s * 0.52);
      ctx.lineTo(0, s * 0.52);
      for (const dir of [-1, 1]) {
        ctx.moveTo(0, dir * s * 0.52);
        ctx.lineTo(-s * 0.18, dir * s * 0.3);
        ctx.moveTo(0, dir * s * 0.52);
        ctx.lineTo(s * 0.18, dir * s * 0.3);
      }
    }
    ctx.stroke();
  };
  switch (power) {
    case Power.RowBlaster: {
      // Тёмная подложка-контур: стрелки читаются даже на жёлтой звезде.
      ctx.lineJoin = 'round';
      ctx.lineWidth = lw * 2.1;
      ctx.strokeStyle = 'rgba(10, 12, 24, 0.85)';
      ctx.shadowBlur = 0;
      strokeArrows(false);
      // Яркий поверх: неоновая линия + белая сердцевина.
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = s * 0.45;
      strokeArrows(false);
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, lw * 0.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      strokeArrows(false);
      break;
    }
    case Power.ColBlaster: {
      ctx.lineWidth = lw * 2.1;
      ctx.strokeStyle = 'rgba(10, 12, 24, 0.85)';
      ctx.shadowBlur = 0;
      strokeArrows(true);
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = s * 0.45;
      strokeArrows(true);
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, lw * 0.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      strokeArrows(true);
      break;
    }
    case Power.Bomb: {
      // Классическая бомба: тёмный шар с бликом, фитиль с мерцающей искрой.
      ctx.save();
      // Фитиль (позади шара, вверх-вправо)
      ctx.strokeStyle = '#d4a373';
      ctx.lineWidth = Math.max(1.4, s * 0.1);
      ctx.beginPath();
      ctx.moveTo(s * 0.05, -s * 0.42);
      ctx.quadraticCurveTo(s * 0.3, -s * 0.7, s * 0.42, -s * 0.62);
      ctx.stroke();
      // Искра на конце фитиля (мерцает)
      const flicker = 0.75 + Math.sin(time * 9) * 0.25;
      ctx.fillStyle = '#ffd166';
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = s * 0.5 * flicker;
      ctx.beginPath();
      ctx.arc(s * 0.44, -s * 0.64, s * 0.11 * flicker, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
      // Корпус бомбы: тёмный шар со градиентом и бликом
      const body = ctx.createRadialGradient(-s * 0.2, -s * 0.25, s * 0.05, 0, 0, s * 0.55);
      body.addColorStop(0, '#5a6478');
      body.addColorStop(0.5, '#2c3242');
      body.addColorStop(1, '#141821');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2);
      ctx.fill();
      // Обводка и блик — читаемость на любом фоне
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = Math.max(1.2, s * 0.07);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.48, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.ellipse(-s * 0.17, -s * 0.2, s * 0.11, s * 0.07, -0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case Power.Prism: {
      // мерцающая гранёная призма
      const spin = time * 0.6;
      ctx.rotate(spin);
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const x = Math.cos(a) * s * 0.42;
        const y = Math.sin(a) * s * 0.42;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.fill();
      ctx.rotate(-spin * 2);
      // внутренняя звезда-блик
      ctx.globalAlpha = 1;
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (Math.PI / 2) * i;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3);
      }
      ctx.stroke();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Контурная молния (иконка суперспособности) в том же стиле, что и бомба:
 *  неоновый зигзаг с белой сердцевиной. */
export function drawLightningIcon(ctx: CanvasRenderingContext2D, s: number, time = 0): void {
  ctx.save();
  const pulse = 0.8 + Math.sin(time * 4) * 0.2;
  const drawBolt = (scale: number, color: string, lw: number, blur: number): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = blur;
    ctx.beginPath();
    ctx.moveTo(s * 0.12 * scale, -s * 0.62 * scale);
    ctx.lineTo(-s * 0.3 * scale, s * 0.06 * scale);
    ctx.lineTo(s * 0.02 * scale, s * 0.06 * scale);
    ctx.lineTo(-s * 0.14 * scale, s * 0.62 * scale);
    ctx.lineTo(s * 0.34 * scale, -s * 0.08 * scale);
    ctx.lineTo(s * 0.0 * scale, -s * 0.08 * scale);
    ctx.lineTo(s * 0.2 * scale, -s * 0.62 * scale);
    ctx.closePath();
    ctx.stroke();
  };
  // Внешнее неоновое свечение, затем белая сердцевина.
  drawBolt(1, '#facc15', Math.max(2, s * 0.13), s * 0.5 * pulse);
  drawBolt(1, 'rgba(255,255,255,0.85)', Math.max(1, s * 0.05), 0);
  ctx.restore();
}

/** Детерминированные трещины льда в единичных координатах (-1..1):
 *  все лучи расходятся из точки удара (0, -0.2). Масштабируются на s. */
const ICE_CRACKS: number[][] = [
  [0, -0.2, -0.14, 0.06, -0.06, 0.3, 0.08, 0.62],
  [0, -0.2, 0.2, -0.02, 0.46, 0.02, 0.64, -0.1],
  [0, -0.2, -0.24, -0.36, -0.5, -0.46],
  [0, -0.2, 0.12, -0.42, 0.06, -0.64],
];

function icePlatePath(ctx: CanvasRenderingContext2D, half: number, rad: number): void {
  ctx.beginPath();
  ctx.moveTo(-half + rad, -half);
  ctx.arcTo(half, -half, half, half, rad);
  ctx.arcTo(half, half, -half, half, rad);
  ctx.arcTo(-half, half, -half, -half, rad);
  ctx.arcTo(-half, -half, half, -half, rad);
  ctx.closePath();
}

/** Ледяная корка поверх гема: морозная плитка со скруглением, трещинами
 *  от точки удара и глянцевым бликом. Один слой — лёгкий иней, два —
 *  толстая плита с внутренней рамкой и мерцающей искрой. */
export function drawIceOverlay(ctx: CanvasRenderingContext2D, layers: number, s: number, time = 0): void {
  if (layers <= 0) return;
  const two = layers >= 2;
  const half = s * 0.92;
  const rad = s * 0.3;
  ctx.save();

  // Морозная плита: вертикальный градиент, полупрозрачный — гем виден подо льдом.
  const grad = ctx.createLinearGradient(0, -half, 0, half);
  if (two) {
    grad.addColorStop(0, 'rgba(219, 240, 255, 0.8)');
    grad.addColorStop(0.55, 'rgba(168, 205, 240, 0.62)');
    grad.addColorStop(1, 'rgba(128, 172, 216, 0.7)');
  } else {
    grad.addColorStop(0, 'rgba(219, 240, 255, 0.42)');
    grad.addColorStop(1, 'rgba(150, 193, 233, 0.3)');
  }
  ctx.fillStyle = grad;
  icePlatePath(ctx, half, rad);
  ctx.fill();

  // Чёткая светлая кромка — плитка не «плывёт» по фону.
  ctx.strokeStyle = two ? 'rgba(240, 250, 255, 0.95)' : 'rgba(240, 250, 255, 0.7)';
  ctx.lineWidth = two ? Math.max(1.6, s * 0.09) : Math.max(1.1, s * 0.06);
  icePlatePath(ctx, half, rad);
  ctx.stroke();

  // Трещины от точки удара: детерминированные, поэтому не мерцают.
  ctx.strokeStyle = two ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = Math.max(0.8, s * 0.04);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const cracks = two ? ICE_CRACKS.length : 2;
  for (let i = 0; i < cracks; i++) {
    const pts = ICE_CRACKS[i]!;
    ctx.beginPath();
    ctx.moveTo(pts[0]! * s, pts[1]! * s);
    for (let j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j]! * s, pts[j + 1]! * s);
    ctx.stroke();
  }

  // Двойной слой: внутренняя рамка — читается как «вторая корка».
  if (two) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(0.8, s * 0.035);
    icePlatePath(ctx, half * 0.76, rad * 0.8);
    ctx.stroke();
  }

  // Глянцевый блик сверху-слева.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.ellipse(-half * 0.42, -half * 0.52, half * 0.36, half * 0.15, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Мерцающая искра на двойном льде — намёк, что слоёв два.
  if (two) {
    const tw = 0.5 + Math.sin(time * 3.2) * 0.5;
    const sx = half * 0.52;
    const sy = -half * 0.52;
    const r = s * 0.09 * (0.7 + tw * 0.5);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 + tw * 0.5})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 2);
    ctx.quadraticCurveTo(sx + r * 0.35, sy - r * 0.35, sx + r * 2, sy);
    ctx.quadraticCurveTo(sx + r * 0.35, sy + r * 0.35, sx, sy + r * 2);
    ctx.quadraticCurveTo(sx - r * 0.35, sy + r * 0.35, sx - r * 2, sy);
    ctx.quadraticCurveTo(sx - r * 0.35, sy - r * 0.35, sx, sy - r * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawChainOverlay(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 200, 90, 0.95)';
  ctx.shadowColor = 'rgba(255, 200, 90, 0.8)';
  ctx.shadowBlur = s * 0.3;
  ctx.lineWidth = Math.max(2, s * 0.12);
  const w = s * 0.5;
  ctx.beginPath();
  for (let i = -1; i <= 1; i += 2) {
    ctx.moveTo(-w, i * w * 0.5);
    ctx.quadraticCurveTo(0, i * w * 0.95, w, i * w * 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export function gemStrokeColor(kind: number): string {
  return GEM_COLORS[kind % GEM_COLORS.length]!.glow;
}

export function gemOf(g: Gem | null): number {
  return g ? g.kind : -1;
}
