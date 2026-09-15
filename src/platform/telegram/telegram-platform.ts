// Telegram Mini App: PlatformAdapter поверх window.Telegram.WebApp + AdsGram.

import type {
  PlatformAdapter,
  PlatformFeatures,
  RewardedPlacement,
  RewardedResult,
} from '../platform';
import type { SaveEnvelope } from '../storage/save-schema';
import { initTelegram, getTelegram, type TelegramAPI } from './telegram-api';
import { showAdsgramRewarded } from './adsgram';

const CLOUD_KEY = 'neon-match-save-v1';
/** Сколько ждём ответа CloudStorage, прежде чем работать без облака. */
const CLOUD_TIMEOUT_MS = 3000;

export class TelegramPlatform implements PlatformAdapter {
  readonly name = 'telegram' as const;
  readonly features: PlatformFeatures = {
    cloudSave: true,
    leaderboard: false,
    stats: false,
    rewardedAds: true,
    interstitialAds: false,
    energyGate: true,
    nativeHaptics: true,
  };

  private tg: TelegramAPI | null = null;
  private backCb: (() => void) | null = null;

  async init(): Promise<void> {
    this.tg = initTelegram();
    if (!this.tg) return;
    // Кнопка «Назад» в шапке Telegram: клик уходит текущему подписчику.
    this.tg.onEvent?.('backButtonClicked', () => this.backCb?.());
  }

  getLanguage(): string {
    return (
      this.tg?.initDataUnsafe?.user?.language_code ??
      (typeof navigator !== 'undefined' ? navigator.language : 'ru')
    );
  }

  loadingReady(): void {
    // В Telegram игра готова сразу после отрисовки меню.
  }

  gameplayStart(): void {
    // Lifecycle-API у Telegram нет; фоновая пауза обрабатывается
    // через visibilitychange в Game.
  }

  gameplayStop(): void {
    // см. gameplayStart
  }

  async showRewardedAd(_placement: RewardedPlacement): Promise<RewardedResult> {
    return showAdsgramRewarded();
  }

  async loadCloudSave(): Promise<SaveEnvelope | null> {
    const cloud = this.tg?.CloudStorage;
    if (!cloud) return null;
    const raw = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), CLOUD_TIMEOUT_MS);
      try {
        cloud.getItem(CLOUD_KEY, (err, value) => {
          clearTimeout(timer);
          resolve(err ? null : (value ?? null));
        });
      } catch (error) {
        clearTimeout(timer);
        console.error('[Save] CloudStorage.getItem failed', error);
        resolve(null);
      }
    });
    return raw ? (JSON.parse(raw) as SaveEnvelope) : null;
  }

  async saveCloudSave(save: SaveEnvelope): Promise<void> {
    const cloud = this.tg?.CloudStorage;
    if (!cloud) throw new Error('CloudStorage unavailable');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CloudStorage timeout')), CLOUD_TIMEOUT_MS);
      try {
        cloud.setItem(CLOUD_KEY, JSON.stringify(save), (err) => {
          clearTimeout(timer);
          if (err) reject(new Error('CloudStorage setItem failed'));
          else resolve();
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  isAuthorized(): boolean {
    return getTelegram() !== null;
  }

  async requestAuthorization(): Promise<boolean> {
    // В Telegram пользователь всегда «авторизован».
    return this.isAuthorized();
  }

  setBackButton(cb: (() => void) | null): void {
    this.backCb = cb;
    const bb = this.tg?.BackButton;
    if (!bb) return;
    try {
      if (cb) bb.show();
      else bb.hide();
    } catch {
      // старые клиенты
    }
  }

  haptic(type: 'light' | 'medium' | 'heavy'): void {
    try {
      this.tg?.Haptics?.impactOccurred(type);
    } catch {
      // ignore
    }
  }

  hapticNotify(type: 'error' | 'success' | 'warning'): void {
    try {
      this.tg?.Haptics?.notificationOccurred(type);
    } catch {
      // ignore
    }
  }
}
