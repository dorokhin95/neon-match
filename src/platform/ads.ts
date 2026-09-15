// Обёртка над AdsGram SDK (rewarded-реклама) для Telegram Mini App.
// Документация: https://docs.adsgram.ai/publisher/reward-interstitial-integration
// SDK подключается скриптами в index.html (telegram-web-app.js + sad.min.js)
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
  init(opts: { blockId: string }): AdController;
}

declare global {
  interface Window {
    Adsgram?: AdsgramSDK;
  }
}

/** ID рекламного блока из кабинета partner.adsgram.ai. */
const AD_BLOCK_ID = '47847';

let controller: AdController | null = null;

/** Загружен ли SDK (скрипт присутствует в window). */
export function isAdsAvailable(): boolean {
  return typeof window !== 'undefined' && window.Adsgram !== undefined;
}

function getController(): AdController | null {
  if (!isAdsAvailable()) {
    console.error('[AdsGram] SDK is not loaded (sad.adsgram.ai/js/sad.min.js)');
    return null;
  }
  try {
    if (!controller) controller = window.Adsgram!.init({ blockId: AD_BLOCK_ID });
    return controller;
  } catch (error) {
    console.error('[AdsGram] init error:', error);
    return null;
  }
}

/**
 * Показывает rewarded-рекламу. Награду выдавать только при resolve(true) —
 * пользователь досмотрел ролик до конца. Пропуск и любая ошибка → false,
 * игра просто продолжает работу. Причина ошибки — в console (F12 / vConsole).
 */
export function showRewardedAd(): Promise<boolean> {
  const ad = getController();
  if (!ad) return Promise.resolve(false);
  return ad
    .show()
    .then((result) => {
      if (result.error || !result.done) {
        console.warn('[AdsGram] not completed:', result);
        return false;
      }
      console.log('[AdsGram] watched:', result);
      return true;
    })
    .catch((error) => {
      console.error('[AdsGram] show error:', error);
      return false;
    });
}
