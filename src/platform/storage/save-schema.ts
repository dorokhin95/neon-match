// Схема сохранений: игровые данные + envelope для облачного хранения.
// envelope (schemaVersion/updatedAt/revision) нужен для безопасного
// merge локального и облачного сейвов и будущих миграций.

export interface Settings {
  music: number; // 0..1
  sfx: number; // 0..1
  haptics: boolean;
  lang: 'ru' | 'en';
  /** auto — язык берётся с платформы при каждом запуске; manual — выбор пользователя. */
  langMode: 'auto' | 'manual';
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
  /** Заряды суперспособностей, полученных за рекламу. */
  powers: { bomb: number; lightning: number; extraMoves: number };
  /** Энергия: неудача на уровне тратит 1 ⚡, восстановление по таймеру. */
  energy: EnergyState;
  /** Серия побед с первой попытки подряд (для бонуса). */
  streak: number;
  /** Провальные попытки подряд на уровне n — сбрасываются победой. */
  levelFails: Record<number, number>;
}

/** Обёртка облачного сохранения. schemaVersion — для будущих миграций. */
export interface SaveEnvelope {
  schemaVersion: 2;
  updatedAt: number;
  revision: number;
  data: SaveData;
}

export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  music: 0.45,
  sfx: 0.8,
  haptics: true,
  lang: 'ru',
  langMode: 'auto',
};

export function defaultSave(now = Date.now()): SaveData {
  return {
    unlocked: 1,
    levels: {},
    endlessBest: 0,
    endlessBestCombo: 0,
    settings: { ...DEFAULT_SETTINGS },
    powerTipShown: false,
    powers: { bomb: 1, lightning: 1, extraMoves: 1 },
    energy: { current: ENERGY_MAX, updatedAt: now },
    streak: 0,
    levelFails: {},
  };
}

export function makeEnvelope(data: SaveData, revision: number, now = Date.now()): SaveEnvelope {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: now, revision, data };
}

/**
 * Разбирает содержимое хранилища (local или cloud) в envelope.
 * Принимает и старый формат — голый SaveData без envelope (schema v1):
 * он считается самым свежим, т.к. был записан последним.
 * Возвращает null, если распарсить не удалось.
 */
export function parseEnvelope(raw: string | null | undefined, now = Date.now()): SaveEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveEnvelope> & Partial<SaveData>;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'data' in parsed &&
      typeof (parsed as Partial<SaveEnvelope>).schemaVersion === 'number'
    ) {
      const env = parsed as Partial<SaveEnvelope>;
      return {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: typeof env.updatedAt === 'number' ? env.updatedAt : 0,
        revision: typeof env.revision === 'number' ? Math.max(0, Math.floor(env.revision)) : 0,
        data: normalize(env.data ?? {}),
      };
    }
    // Голый SaveData (v1): заворачиваем в envelope, время — текущее.
    return makeEnvelope(normalize(parsed as Partial<SaveData>), 0, now);
  } catch {
    return null; // corrupted save
  }
}

/** Приводит частичное сохранение к валидному виду (миграция старых версий). */
export function normalize(p: Partial<SaveData>): SaveData {
  const d = defaultSave();
  const lang = p.settings?.lang === 'en' ? 'en' : p.settings?.lang === 'ru' ? 'ru' : d.settings.lang;
  const langMode = p.settings?.langMode === 'manual' ? 'manual' : 'auto';
  return {
    unlocked: typeof p.unlocked === 'number' && p.unlocked >= 1 ? p.unlocked : 1,
    levels: p.levels && typeof p.levels === 'object' ? p.levels : {},
    endlessBest: typeof p.endlessBest === 'number' ? p.endlessBest : 0,
    endlessBestCombo: typeof p.endlessBestCombo === 'number' ? p.endlessBestCombo : 0,
    settings: {
      music: clamp01(p.settings?.music ?? d.settings.music),
      sfx: clamp01(p.settings?.sfx ?? d.settings.sfx),
      haptics: p.settings?.haptics ?? d.settings.haptics,
      lang,
      langMode,
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

/** Игрок ещё ничего не сделал: прогресса нет ни в одном поле. */
export function isDefaultLike(d: SaveData): boolean {
  return (
    d.unlocked === 1 &&
    d.endlessBest === 0 &&
    d.endlessBestCombo === 0 &&
    Object.keys(d.levels).length === 0 &&
    Object.keys(d.levelFails).length === 0 &&
    d.streak === 0 &&
    d.powers.bomb <= 1 &&
    d.powers.lightning <= 1 &&
    d.powers.extraMoves <= 1
  );
}

export interface MergeInput {
  local: SaveEnvelope | null;
  cloud: SaveEnvelope | null;
}

export interface MergeResult {
  data: SaveData;
  /** Какой источник победил — для диагностики. */
  winner: 'local' | 'cloud' | 'none' | 'both-equal';
}

/**
 * Выбирает актуальное сохранение. Стратегия v1: новейший updatedAt побеждает,
 * при равенстве — cloud. Пустой сейв никогда не затирает непустой.
 */
export function mergeSaves({ local, cloud }: MergeInput, now = Date.now()): MergeResult {
  if (!local && !cloud) return { data: defaultSave(now), winner: 'none' };
  if (!local) return { data: cloud!.data, winner: 'cloud' };
  if (!cloud) return { data: local.data, winner: 'local' };
  // Защита: пустая сторона не побеждает непустую (нельзя терять прогресс,
  // когда после авторизации пришёл дефолтный облачный сейв или наоборот).
  const localEmpty = isDefaultLike(local.data);
  const cloudEmpty = isDefaultLike(cloud.data);
  if (localEmpty && !cloudEmpty) return { data: cloud.data, winner: 'cloud' };
  if (cloudEmpty && !localEmpty) return { data: local.data, winner: 'local' };
  if (cloud.updatedAt > local.updatedAt) return { data: cloud.data, winner: 'cloud' };
  if (local.updatedAt > cloud.updatedAt) return { data: local.data, winner: 'local' };
  return { data: cloud.data, winner: 'both-equal' }; // ничья — cloud приоритетнее
}

/** Язык платформы → поддерживаемая локаль: ru* → ru, всё остальное → en. */
export function mapLang(lang: string | undefined | null): 'ru' | 'en' {
  return (lang ?? '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
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
