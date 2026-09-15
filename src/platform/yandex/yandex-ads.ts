// Чистая логика rewarded Yandex: превращает callback-API
// ysdk.adv.showRewardedVideo в однократно разрешающийся промис.
// Защита от двойной награды: onRewarded → onClose не выдаёт награду второй раз,
// любой колбек разрешает промис ровно один раз.

import type { RewardedResult } from '../platform';

export interface RewardedCallbacks {
  onOpen?(): void;
  onRewarded?(): void;
  onClose?(): void;
  onError?(error: unknown): void;
}

/** Регистрирует колбеки и возвращает итог показа. */
export function rewardedFromCallbacks(register: (cb: RewardedCallbacks) => void): Promise<RewardedResult> {
  return new Promise((resolve) => {
    let rewarded = false;
    let finished = false;
    const finish = (result: RewardedResult): void => {
      if (finished) return;
      finished = true;
      resolve(result);
    };
    try {
      register({
        onOpen: () => {
          // Показ начался: награда выдаётся только в onRewarded.
        },
        onRewarded: () => {
          rewarded = true;
        },
        onClose: () => {
          finish(rewarded ? 'rewarded' : 'closed');
        },
        onError: (error) => {
          // onRewarded уже пришёл — ролик досмотрен, награда заслужена,
          // даже если после этого SDK упал с ошибкой до onClose.
          finish(rewarded ? 'rewarded' : 'error');
          if (error) console.error('[Ads] showRewardedVideo error:', error);
        },
      });
    } catch (error) {
      finish('error');
    }
  });
}
