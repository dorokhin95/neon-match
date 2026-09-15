// Обычный браузер (GitHub Pages / локальная разработка): без SDK.
// Реклама недоступна (features.rewardedAds=false) — игровой код показывает
// dev-заглушку; облако недоступно — только localStorage.

import type {
  PlatformAdapter,
  PlatformFeatures,
  RewardedPlacement,
  RewardedResult,
} from '../platform';
import type { SaveEnvelope } from '../storage/save-schema';
import { mapLang } from '../storage/save-schema';

export class BrowserPlatform implements PlatformAdapter {
  readonly name = 'browser' as const;
  readonly features: PlatformFeatures = {
    cloudSave: false,
    leaderboard: false,
    stats: false,
    rewardedAds: false,
    interstitialAds: false,
    // Веб-версия наследует поведение Telegram: энергия активна.
    energyGate: true,
    nativeHaptics: false,
  };

  async init(): Promise<void> {
    // SDK нет — инициализация не требуется.
  }

  getLanguage(): string {
    return typeof navigator !== 'undefined' ? navigator.language : mapLang('ru');
  }

  loadingReady(): void {}

  gameplayStart(): void {}

  gameplayStop(): void {}

  async showRewardedAd(_placement: RewardedPlacement): Promise<RewardedResult> {
    return 'unavailable';
  }

  async loadCloudSave(): Promise<SaveEnvelope | null> {
    return null;
  }

  async saveCloudSave(_save: SaveEnvelope): Promise<void> {
    throw new Error('cloud save unavailable in browser');
  }

  isAuthorized(): boolean {
    return false;
  }

  async requestAuthorization(): Promise<boolean> {
    return false;
  }

  haptic(type: 'light' | 'medium' | 'heavy'): void {
    try {
      // navigator.vibrate принимает только длительность.
      const ms = type === 'heavy' ? 30 : type === 'medium' ? 20 : 10;
      navigator.vibrate?.(ms);
    } catch {
      // нет поддержки — no-op
    }
  }

  hapticNotify(type: 'error' | 'success' | 'warning'): void {
    try {
      const pattern = type === 'error' ? [30, 40, 30] : type === 'success' ? [15, 30, 15] : 25;
      navigator.vibrate?.(pattern);
    } catch {
      // нет поддержки — no-op
    }
  }
}
