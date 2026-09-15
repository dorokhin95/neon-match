// SaveRepository: единая точка сохранений для игрового кода.
// Каждый save(): local — сразу, cloud — с debounce 1.5 с; critical=true — cloud
// отправляется немедленно (победа, rewarded, reset, уход со страницы).
// Игровой код никогда не ждёт сеть после игрового действия.

import { platformError, platformLog } from '../log';
import type { PlatformAdapter } from '../platform';
import { readLocalEnvelope, writeLocalEnvelope, clearLocalSave } from './local-storage';
import {
  defaultSave,
  makeEnvelope,
  mergeSaves,
  parseEnvelope,
  type SaveData,
} from './save-schema';

export interface SaveRepository {
  load(): Promise<SaveData>;
  save(save: SaveData, critical?: boolean): void;
  flush(): Promise<void>;
  reset(): Promise<SaveData>;
}

const DEFAULT_DEBOUNCE_MS = 1500;

export class RepoSaveRepository implements SaveRepository {
  private platform: PlatformAdapter;
  private debounceMs: number;
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: SaveData | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(platform: PlatformAdapter, debounceMs = DEFAULT_DEBOUNCE_MS) {
    this.platform = platform;
    this.debounceMs = debounceMs;
  }

  /** Local + cloud merge. Гарантирует, что merged записан в local. */
  async load(): Promise<SaveData> {
    const local = readLocalEnvelope();
    const cloud = this.platform.features.cloudSave ? await this.safeLoadCloud() : null;
    const { data, winner } = mergeSaves({ local, cloud });
    this.revision = Math.max(local?.revision ?? 0, cloud?.revision ?? 0) + 1;
    platformLog('Save', `merged: ${winner} (local=${local?.updatedAt ?? '—'}, cloud=${cloud?.updatedAt ?? '—'})`);
    // Мигрированный/выбранный сейв сразу приводим к envelope локально.
    writeLocalEnvelope(makeEnvelope(data, this.revision));
    // Локальный прогресс ещё не в облаке — отправляем (debounce).
    if (this.platform.features.cloudSave && local && !cloud) this.save(data);
    return data;
  }

  save(save: SaveData, critical = false): void {
    this.pending = save;
    writeLocalEnvelope(makeEnvelope(save, this.revision++));
    if (!this.platform.features.cloudSave) return;
    if (critical) {
      void this.flush();
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Немедленная отправка отложенного облачного сохранения. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) await this.inFlight.catch(() => undefined);
    const save = this.pending;
    if (!save || !this.platform.features.cloudSave) return;
    this.pending = null;
    const envelope = makeEnvelope(save, this.revision++);
    this.inFlight = this.platform.saveCloudSave(envelope);
    try {
      await this.inFlight;
      platformLog('Save', 'cloud flushed');
    } catch (error) {
      // Ошибка облака не критична: локальный сейв уже записан.
      platformError('Save', 'cloud flush failed', error);
      this.pending = save; // вернём в очередь — следующая попытка при новом save/flush
    } finally {
      this.inFlight = null;
    }
  }

  /** Полный сброс: local очищается и перезаписывается дефолтом, cloud перезаписывается. */
  async reset(): Promise<SaveData> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
    const fresh = defaultSave();
    clearLocalSave();
    this.revision++;
    writeLocalEnvelope(makeEnvelope(fresh, this.revision++));
    if (this.platform.features.cloudSave) {
      try {
        await this.platform.saveCloudSave(makeEnvelope(fresh, this.revision));
        platformLog('Save', 'cloud reset');
      } catch (error) {
        platformError('Save', 'cloud reset failed', error);
      }
    }
    return fresh;
  }

  private async safeLoadCloud() {
    try {
      const raw = await this.loadCloudRaw();
      return parseEnvelope(raw);
    } catch (error) {
      platformError('Save', 'cloud load failed', error);
      return null;
    }
  }

  private async loadCloudRaw(): Promise<string | null> {
    const data = await this.platform.loadCloudSave();
    return data ? JSON.stringify(data) : null;
  }
}
