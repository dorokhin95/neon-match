// Yandex Games: PlatformAdapter поверх YaGames SDK.
// SDK может не инициализироваться (dev вне площадки, оффлайн) — тогда все
// онлайн-возможности деградируют, игра работает на локальном сохранении.

import type { Player, SDK } from 'ysdk';
import { platformError, platformLog, platformWarn } from '../log';
import type {
  PlatformAdapter,
  PlatformFeatures,
  RewardedPlacement,
  RewardedResult,
} from '../platform';
import type { SaveEnvelope } from '../storage/save-schema';
import { loadYandexSdk } from './yandex-sdk';
import { rewardedFromCallbacks } from './yandex-ads';

const CLOUD_KEY = 'neon_match_save';

export class YandexPlatform implements PlatformAdapter {
  readonly name = 'yandex' as const;
  readonly features: PlatformFeatures = {
    cloudSave: true,
    leaderboard: true,
    stats: true,
    rewardedAds: true,
    interstitialAds: true,
    // Требование Яндекс Игр: rewarded — бонус, а не способ продолжения игры.
    energyGate: false,
    nativeHaptics: false,
  };

  private sdk: SDK | null = null;
  private player: Player | null = null;
  private adInProgress = false;
  private pauseCb: (() => void) | null = null;
  private resumeCb: (() => void) | null = null;

  async init(): Promise<void> {
    this.sdk = await loadYandexSdk();
    if (!this.sdk) return;
    // Пауза/возобновление со стороны платформы (свернуть, реклама, экран блокировки).
    try {
      this.sdk.on('game_api_pause', () => this.pauseCb?.());
      this.sdk.on('game_api_resume', () => this.resumeCb?.());
    } catch (error) {
      platformWarn('SDK', 'game_api_pause/resume subscription failed', error);
    }
    try {
      // scopes: false — минимальные разрешения; данные сохраняются и у неавторизованных.
      this.player = await this.sdk.getPlayer({ signed: false });
      platformLog('SDK', `player ready (authorized: ${this.player.isAuthorized()})`);
    } catch (error) {
      platformWarn('SDK', 'getPlayer failed — cloud save disabled', error);
      this.player = null;
    }
  }

  getLanguage(): string {
    try {
      return this.sdk?.environment.i18n.lang ?? 'en';
    } catch {
      return 'en';
    }
  }

  loadingReady(): void {
    // Обязательное требование модерации: вызывать, когда UI готов к вводу.
    try {
      this.sdk?.features.LoadingAPI?.ready();
      platformLog('SDK', 'LoadingAPI.ready');
    } catch (error) {
      platformWarn('SDK', 'LoadingAPI.ready failed', error);
    }
  }

  gameplayStart(): void {
    try {
      this.sdk?.features.GameplayAPI?.start();
    } catch (error) {
      platformWarn('SDK', 'GameplayAPI.start failed', error);
    }
  }

  gameplayStop(): void {
    try {
      this.sdk?.features.GameplayAPI?.stop();
    } catch (error) {
      platformWarn('SDK', 'GameplayAPI.stop failed', error);
    }
  }

  async showRewardedAd(_placement: RewardedPlacement): Promise<RewardedResult> {
    if (!this.sdk || this.adInProgress) return 'unavailable';
    this.adInProgress = true;
    try {
      return await rewardedFromCallbacks((cb) => {
        this.sdk!.adv.showRewardedVideo({ callbacks: cb });
      });
    } catch (error) {
      platformError('Ads', 'showRewardedVideo failed', error);
      return 'error';
    } finally {
      this.adInProgress = false;
    }
  }

  async loadCloudSave(): Promise<SaveEnvelope | null> {
    if (!this.player) return null;
    const data = await this.player.getData([CLOUD_KEY]);
    const envelope = data[CLOUD_KEY];
    return (envelope as SaveEnvelope | undefined) ?? null;
  }

  async saveCloudSave(save: SaveEnvelope): Promise<void> {
    if (!this.player) throw new Error('player unavailable');
    await this.player.setData({ [CLOUD_KEY]: save });
  }

  isAuthorized(): boolean {
    try {
      return this.player?.isAuthorized() ?? false;
    } catch {
      return false;
    }
  }

  /** Только по явному действию пользователя (кнопка в меню). */
  async requestAuthorization(): Promise<boolean> {
    if (!this.sdk) return false;
    try {
      await this.sdk.auth.openAuthDialog();
      this.player = await this.sdk.getPlayer({ signed: false });
      return this.player.isAuthorized();
    } catch (error) {
      // Пользователь закрыл окно входа — не критично, гостевой режим продолжается.
      platformLog('Auth', 'authorization cancelled or failed', error);
      return false;
    }
  }

  async setLeaderboardScore(board: string, score: number): Promise<void> {
    if (!this.sdk) throw new Error('SDK unavailable');
    const lb = await this.sdk.getLeaderboards();
    await lb.setLeaderboardScore(board, score);
  }

  /** Полноэкранный режим — техтребование Яндекс для мобильных устройств. */
  requestFullscreen(): void {
    try {
      const fs = this.sdk?.screen?.fullscreen;
      if (fs && fs.status === 'off') void fs.request().catch(() => undefined);
    } catch {
      // Браузер отклонил — не критично.
    }
  }

  onPause(cb: () => void): void {
    this.pauseCb = cb;
  }

  onResume(cb: () => void): void {
    this.resumeCb = cb;
  }

  haptic(type: 'light' | 'medium' | 'heavy'): void {
    try {
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
