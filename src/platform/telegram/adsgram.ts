// Обёртка над AdsGram SDK (rewarded-реклама) для Telegram Mini App.
// Документация: https://docs.adsgram.ai/publisher/reward-interstitial-integration
// SDK подключается скриптом в index.html (https://sad.adsgram.ai/js/sad.min.js)
// и работает только внутри Telegram.

import { platformError, platformLog, platformWarn } from '../log';
import type { RewardedResult } from '../platform';

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
    platformError('Ads', 'AdsGram SDK is not loaded (sad.adsgram.ai/js/sad.min.js)');
    return null;
  }
  try {
    if (!controller) controller = window.Adsgram!.init({ blockId: AD_BLOCK_ID });
    return controller;
  } catch (error) {
    platformError('Ads', 'init error', error);
    return null;
  }
}

/**
 * Показывает rewarded-рекламу. 'rewarded' — только если ролик досмотрен
 * до конца. Пропуск/закрытие → 'closed', ошибка → 'error'.
 */
export function showAdsgramRewarded(): Promise<RewardedResult> {
  const ad = getController();
  if (!ad) return Promise.resolve('unavailable');
  return ad
    .show()
    .then((result) => {
      if (result.error) {
        platformWarn('Ads', 'show error result:', result);
        return 'error' as const;
      }
      if (!result.done) {
        platformLog('Ads', 'closed before the end:', result);
        return 'closed' as const;
      }
      platformLog('Ads', 'rewarded:', result);
      return 'rewarded' as const;
    })
    .catch((error) => {
      platformError('Ads', 'show error', error);
      return 'error' as const;
    });
}
