// Платформенный контракт: общий интерфейс для Telegram / Yandex / browser.
// Игровой код (src/ui) знает только этот интерфейс — никаких прямых
// импортов AdsGram, Telegram.WebApp или YaGames.

import type { SaveEnvelope } from './storage/save-schema';

export type PlatformName = 'telegram' | 'yandex' | 'browser';

/** Итог показа rewarded-рекламы. */
export type RewardedResult =
  | 'rewarded' // досмотрено до конца — выдать награду
  | 'closed' // пользователь закрыл/пропустил — награды нет
  | 'unavailable' // реклама недоступна (нет SDK/нет оффера) — награды нет
  | 'error'; // ошибка показа — награды нет

/** Точки показа rewarded — по ним платформа может маппить свои blockId/placement. */
export type RewardedPlacement =
  | 'super_bomb'
  | 'super_lightning'
  | 'super_extra_moves'
  | 'rescue_5_moves'
  | 'energy_refill';

/** Возможности платформы — UI адаптируется без проверок имени платформы. */
export interface PlatformFeatures {
  cloudSave: boolean;
  leaderboard: boolean;
  stats: boolean;
  rewardedAds: boolean;
  interstitialAds: boolean;
  /** Hard gate энергии: true (Telegram) — энергия ограничивает запуск уровня;
   *  false (Yandex) — энергия скрыта, рекламные награды не блокируют игру. */
  energyGate: boolean;
  nativeHaptics: boolean;
}

export interface PlatformAdapter {
  readonly name: PlatformName;
  readonly features: PlatformFeatures;

  /** Инициализация SDK платформы. Не должен бросать: ошибки логируются,
   *  игра продолжает работать на локальных сохранениях. */
  init(): Promise<void>;

  /** Язык платформы ('ru', 'en-US', …) — по нему выбирается локаль. */
  getLanguage(): string;

  /** Игра полностью загружена и отвечает на ввод (требование Yandex Game Ready). */
  loadingReady(): void;

  /** Начало/возобновление активного геймплея. */
  gameplayStart(): void;
  /** Остановка активного геймплея (пауза, реклама, конец партии). */
  gameplayStop(): void;

  showRewardedAd(placement: RewardedPlacement): Promise<RewardedResult>;

  /** Облачное сохранение (Telegram CloudStorage / Yandex Player). */
  loadCloudSave(): Promise<SaveEnvelope | null>;
  saveCloudSave(save: SaveEnvelope): Promise<void>;

  isAuthorized(): boolean;
  /** Добровольный вход (вызывается только по действию пользователя). */
  requestAuthorization(): Promise<boolean>;

  /** Сброс endless-рекорда в таблицу лидеров; ошибка не критична. */
  setLeaderboardScore?(board: string, score: number): Promise<void>;

  /** Полноэкранный режим (мобильные сборки Yandex). */
  requestFullscreen?(): void;

  /** Кнопка «Назад» (Telegram); null — скрыть. */
  setBackButton?(cb: (() => void) | null): void;

  /** Вибрация: Telegram Haptics / navigator.vibrate при наличии. */
  haptic?(type: 'light' | 'medium' | 'heavy'): void;
  hapticNotify?(type: 'error' | 'success' | 'warning'): void;

  /** Подписка на платформенную паузу/возобновление. */
  onPause?(cb: () => void): void;
  onResume?(cb: () => void): void;
}
