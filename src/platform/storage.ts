// Persistent save data. localStorage by default; Telegram CloudStorage used
// as a write-through backup when available.

import type { TelegramAPI } from './telegram';

export interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1
  haptics: boolean;
  lang: 'ru' | 'en';
}

export interface LevelRecord {
  stars: number;
  best: number;
}

export interface EnergyState {
  current: number;
  /** Момент (мс), от которого тикает восстановление следующей единицы. */
  updatedAt: number;
}

export const ENERGY_MAX = 5;
/** Сколько времени восстанавливается 1 единица энергии. */
export const ENERGY_REFILL_MS = 3 * 60 * 60 * 1000;

export interface SaveData {
  unlocked: number; // highest unlocked level (1-based)
  levels: Record<number, LevelRecord>;
  endlessBest: number;
  endlessBestCombo: number;
  settings: Settings;
  /** Показана ли уже подсказка про первый бонус. */
  powerTipShown?: boolean;
  /** Заряды суперспособностей, полученных за рекламу (заглушка). */
  powers: { bomb: number; lightning: number; extraMoves: number };
  /** Энергия: неудача на уровне тратит 1 ⚡, восстановление по таймеру. */
  energy: EnergyState;
  /** Серия побед с первой попытки подряд (для бонуса). */
  streak: number;
  /** Провальные попытки подряд на уровне n — сбрасываются победой. */
  levelFails: Record<number, number>;
}

const KEY = 'neon-match-save-v1';

export const DEFAULT_SETTINGS: Settings = {
  music: 0.45,
  sfx: 0.8,
  haptics: true,
  lang: 'ru',
};

export function defaultSave(): SaveData {
  return {
    unlocked: 1,
    levels: {},
    endlessBest: 0,
    endlessBestCombo: 0,
    settings: { ...DEFAULT_SETTINGS },
    powerTipShown: false,
    powers: { bomb: 1, lightning: 1, extraMoves: 1 },
    energy: { current: ENERGY_MAX, updatedAt: Date.now() },
    streak: 0,
    levelFails: {},
  };
}

export function loadSave(_tg?: TelegramAPI | null): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return normalize(parsed);
    }
  } catch {
    // corrupted save — fall through
  }
  // CloudStorage backup is pulled asynchronously by the caller at startup;
  // here we fall back to defaults.
  return defaultSave();
}

export function saveSave(data: SaveData, tg?: TelegramAPI | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage may be unavailable (private mode) — ignore
  }
  const cloud = tg?.CloudStorage;
  if (cloud) {
    try {
      cloud.setItem(KEY, JSON.stringify(data));
    } catch {
      // cloud storage errors are non-fatal
    }
  }
}

export function resetSave(): SaveData {
  const fresh = defaultSave();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  return fresh;
}

// ============ Энергия ============

/** Доводит энергию до актуального состояния по прошедшему времени.
 *  Возвращает число единиц, реально добавленных этим вызовом. */
export function syncEnergy(save: SaveData, now = Date.now()): number {
  const e = save.energy;
  const before = e.current;
  if (before >= ENERGY_MAX) {
    e.updatedAt = now;
    return 0;
  }
  const intervals = Math.floor((now - e.updatedAt) / ENERGY_REFILL_MS);
  if (intervals <= 0) return 0;
  e.current = Math.min(ENERGY_MAX, before + intervals);
  e.updatedAt = e.current >= ENERGY_MAX ? now : e.updatedAt + intervals * ENERGY_REFILL_MS;
  return e.current - before;
}

/** Сколько мс до следующей единицы (0 — энергия полная). */
export function msToNextEnergy(save: SaveData, now = Date.now()): number {
  if (save.energy.current >= ENERGY_MAX) return 0;
  return Math.max(0, save.energy.updatedAt + ENERGY_REFILL_MS - now);
}

/** Списывает энергию; запускает таймер восстановления, если он ещё не идёт. */
export function loseEnergy(save: SaveData, n = 1, now = Date.now()): void {
  syncEnergy(save, now);
  const was = save.energy.current;
  save.energy.current = Math.max(0, was - n);
  if (was >= ENERGY_MAX && save.energy.current < ENERGY_MAX) save.energy.updatedAt = now;
}

/** Начисляет энергию (реклама, бонус за победу с первой попытки). */
export function gainEnergy(save: SaveData, n = 1, now = Date.now()): void {
  save.energy.current = Math.min(ENERGY_MAX, save.energy.current + n);
  if (save.energy.current >= ENERGY_MAX) save.energy.updatedAt = now;
}

/** Ключи способностей для UI и сохранения. */
export type PowerKey = 'bomb' | 'lightning' | 'extraMoves';

/** Приводит частичное сохранение к валидному виду (миграция старых версий). */
export function normalize(p: Partial<SaveData>): SaveData {
  const d = defaultSave();
  return {
    unlocked: typeof p.unlocked === 'number' && p.unlocked >= 1 ? p.unlocked : 1,
    levels: p.levels && typeof p.levels === 'object' ? p.levels : {},
    endlessBest: typeof p.endlessBest === 'number' ? p.endlessBest : 0,
    endlessBestCombo: typeof p.endlessBestCombo === 'number' ? p.endlessBestCombo : 0,
    settings: {
      music: clamp01(p.settings?.music ?? d.settings.music),
      sfx: clamp01(p.settings?.sfx ?? d.settings.sfx),
      haptics: p.settings?.haptics ?? d.settings.haptics,
      lang: p.settings?.lang === 'en' ? 'en' : p.settings?.lang === 'ru' ? 'ru' : d.settings.lang,
    },
    powers: {
      bomb: Math.max(0, Math.floor(p.powers?.bomb ?? d.powers.bomb)),
      lightning: Math.max(0, Math.floor(p.powers?.lightning ?? d.powers.lightning)),
      extraMoves: Math.max(0, Math.floor(p.powers?.extraMoves ?? d.powers.extraMoves)),
    },
    energy: {
      current: Math.max(0, Math.min(ENERGY_MAX, Math.floor(p.energy?.current ?? ENERGY_MAX))),
      updatedAt: typeof p.energy?.updatedAt === 'number' ? p.energy.updatedAt : Date.now(),
    },
    streak: typeof p.streak === 'number' ? Math.max(0, Math.floor(p.streak)) : 0,
    levelFails: p.levelFails && typeof p.levelFails === 'object' ? p.levelFails : {},
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Default language detection used on first launch.
export function detectLang(tgLangCode?: string): 'ru' | 'en' {
  if (tgLangCode) return tgLangCode.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'ru';
  return nav.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}
