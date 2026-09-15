// Загрузчик Yandex Games SDK. Для архива, загружаемого в Консоль Яндекс Игр,
// скрипт подключается как /sdk.js (см. index.html в Yandex-сборке).
// В dev-окружении (локальный сервер) /sdk.js отсутствует — пробуем официальный
// CDN; если и он недоступен, init возвращает null и игра работает без SDK.

import { platformError, platformLog } from '../log';
import type { SDK } from 'ysdk';

const CDN_SDK = 'https://yandex.ru/games/sdk/v2';

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`failed to load ${src}`)));
      if ((window as unknown as { YaGames?: unknown }).YaGames) resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Инициализирует YaGames. null — SDK недоступен (не на площадке Яндекса,
 * оффлайн и т.п.): игра обязана продолжать работу (local save, без рекламы).
 */
export async function loadYandexSdk(): Promise<SDK | null> {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { YaGames?: { init(opts?: { signed?: boolean }): Promise<SDK> } };
  try {
    if (!w.YaGames) {
      try {
        await injectScript('/sdk.js');
      } catch {
        await injectScript(CDN_SDK); // локальная разработка
      }
    }
    if (!w.YaGames) {
      platformError('SDK', 'YaGames is not available');
      return null;
    }
    const sdk = await w.YaGames.init();
    platformLog('SDK', 'initialized');
    return sdk;
  } catch (error) {
    platformError('SDK', 'init failed — running without platform services', error);
    return null;
  }
}
