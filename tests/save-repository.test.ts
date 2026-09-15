// SaveRepository: debounce облачных сохранений, критические события, merge при старте.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoSaveRepository } from '../src/platform/storage/save-repository';
import { makeEnvelope, defaultSave, type SaveEnvelope } from '../src/platform/storage/save-schema';
import type { PlatformAdapter } from '../src/platform/platform';

class MemoryPlatform implements PlatformAdapter {
  readonly name = 'browser' as const;
  cloudEnabled: boolean;
  cloudData: SaveEnvelope | null = null;
  saved: SaveEnvelope[] = [];
  failCloud = false;

  constructor(cloudEnabled: boolean) {
    this.cloudEnabled = cloudEnabled;
  }

  get features() {
    return {
      cloudSave: this.cloudEnabled,
      leaderboard: false,
      stats: false,
      rewardedAds: false,
      interstitialAds: false,
      energyGate: true,
      nativeHaptics: false,
    };
  }

  async init(): Promise<void> {}

  getLanguage(): string {
    return 'ru';
  }

  loadingReady(): void {}

  gameplayStart(): void {}

  gameplayStop(): void {}

  showRewardedAd(): Promise<'rewarded' | 'closed' | 'unavailable' | 'error'> {
    return Promise.resolve('unavailable');
  }

  async loadCloudSave(): Promise<SaveEnvelope | null> {
    if (this.failCloud) throw new Error('network');
    return this.cloudData;
  }

  async saveCloudSave(save: SaveEnvelope): Promise<void> {
    if (this.failCloud) throw new Error('network');
    this.cloudData = save;
    this.saved.push(save);
  }

  isAuthorized(): boolean {
    return false;
  }

  async requestAuthorization(): Promise<boolean> {
    return false;
  }
}

// localStorage в node-окружении отсутствует — минимальная заглушка.
class LocalStorageMock {
  store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
}

describe('SaveRepository', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).localStorage = new LocalStorageMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('debounces cloud writes: many saves → one setData', async () => {
    const platform = new MemoryPlatform(true);
    const repo = new RepoSaveRepository(platform, 1500);
    const save = defaultSave();
    repo.save(save);
    repo.save(save);
    repo.save(save);
    expect(platform.saved.length).toBe(0); // облако ещё не трогали
    await vi.advanceTimersByTimeAsync(1600);
    expect(platform.saved.length).toBe(1); // ровно один сетевой запрос
  });

  it('critical save flushes cloud immediately', async () => {
    const platform = new MemoryPlatform(true);
    const repo = new RepoSaveRepository(platform, 1500);
    repo.save(defaultSave(), /* critical */ true);
    await vi.advanceTimersByTimeAsync(0);
    expect(platform.saved.length).toBe(1);
  });

  it('loads local save and pushes it to empty cloud', async () => {
    const save = defaultSave();
    save.unlocked = 11;
    localStorage.setItem('neon-match-save-v1', JSON.stringify(makeEnvelope(save, 1, 5000)));
    const platform = new MemoryPlatform(true);
    const repo = new RepoSaveRepository(platform, 1500);
    const loaded = await repo.load();
    expect(loaded.unlocked).toBe(11);
    await vi.advanceTimersByTimeAsync(1600);
    expect(platform.cloudData?.data.unlocked).toBe(11); // local продублирован в облако
  });

  it('cloud failure keeps local save intact (no white screen)', async () => {
    const save = defaultSave();
    save.unlocked = 3;
    localStorage.setItem('neon-match-save-v1', JSON.stringify(makeEnvelope(save, 1, 100)));
    const platform = new MemoryPlatform(true);
    platform.failCloud = true;
    const repo = new RepoSaveRepository(platform, 1500);
    const loaded = await repo.load(); // не бросает
    expect(loaded.unlocked).toBe(3);
  });

  it('reset clears local and overwrites cloud', async () => {
    const save = defaultSave();
    save.unlocked = 42;
    localStorage.setItem('neon-match-save-v1', JSON.stringify(makeEnvelope(save, 9, 100)));
    const platform = new MemoryPlatform(true);
    platform.cloudData = makeEnvelope(save, 9, 200);
    const repo = new RepoSaveRepository(platform, 1500);
    const fresh = await repo.reset();
    expect(fresh.unlocked).toBe(1);
    expect(platform.cloudData?.data.unlocked).toBe(1); // облако перезаписано дефолтом
    expect(localStorage.getItem('neon-match-save-v1')).not.toBeNull(); // дефолт записан локально
    const after = JSON.parse(localStorage.getItem('neon-match-save-v1')!) as SaveEnvelope;
    expect(after.data.unlocked).toBe(1);
    // После reset новый load не должен вернуть старый прогресс из облака.
    const reloaded = await repo.load();
    expect(reloaded.unlocked).toBe(1);
  });

  it('works without cloud feature (browser): load still succeeds', async () => {
    const platform = new MemoryPlatform(false);
    const repo = new RepoSaveRepository(platform, 1500);
    const loaded = await repo.load();
    expect(loaded.unlocked).toBe(1);
  });
});
