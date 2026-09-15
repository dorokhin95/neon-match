// Быстрый локальный слой сохранений (localStorage) — пишется синхронно
// при каждом изменении, на всех платформах.

import { parseEnvelope, type SaveEnvelope } from './save-schema';

/** Ключ сохранён со времён v1 — прогресс существующих игроков не теряется. */
const KEY = 'neon-match-save-v1';

export function readLocalEnvelope(): SaveEnvelope | null {
  try {
    return parseEnvelope(localStorage.getItem(KEY));
  } catch {
    return null; // private mode и т.п.
  }
}

export function writeLocalEnvelope(envelope: SaveEnvelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    // storage может быть недоступен (private mode) — игра продолжается в памяти
  }
}

export function clearLocalSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
