// Обёртка над AdsGram SDK (rewarded-реклама) для Telegram Mini App.
// Документация: https://docs.adsgram.ai/publisher/reward-interstitial-integration
// SDK подключается скриптом в index.html (https://sad.adsgram.ai/js/sad.min.js)
// и работает только внутри Telegram; в обычном браузере реклама недоступна
// (isAdsAvailable() === false) и вызывающий код использует заглушку.

/** Результат промиса show(): done=true — досмотрено до конца. */
export interface ShowPromiseResult {
  done: boolean;
  description: string;
  state: 'load' | 'render' | 'playing' | 'destroy';
  error: boolean;
}

interface AdController {
  show(): Promise<ShowPromiseResult>;
}

interface AdsgramSDK {
  init(opts: { blockId: number }): AdController;
}

declare global {
  interface Window {
    Adsgram?: AdsgramSDK;
  }
}

/** ID рекламного блока из кабинета partner.adsgram.ai. */
const AD_BLOCK_ID = 47847;

let controller: AdController | null = null;

/** Загружен ли SDK (скрипт присутствует в window). */
export function isAdsAvailable(): boolean {
  return typeof window !== 'undefined' && window.Adsgram !== undefined;
}

function getController(): AdController | null {
  if (!isAdsAvailable()) return null;
  if (!controller) controller = window.Adsgram!.init({ blockId: AD_BLOCK_ID });
  return controller;
}

/**
 * Показывает rewarded-рекламу. Награду выдавать только при resolve(true) —
 * пользователь досмотрел ролик до конца. Пропуск и любая ошибка → false,
 * игра просто продолжает работу.
 */
export function showRewardedAd(): Promise<boolean> {
  const ad = getController();
  if (!ad) return Promise.resolve(false);
  return ad
    .show()
    .then((result) => result.done && !result.error)
    .catch(() => false);
}
