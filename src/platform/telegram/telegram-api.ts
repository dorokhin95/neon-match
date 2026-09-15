// Thin typed wrapper over window.Telegram.WebApp. Everything degrades
// gracefully when running as a plain web page.

export interface TgUser {
  first_name?: string;
  language_code?: string;
}

export interface TelegramAPI {
  ready(): void;
  expand(): void;
  /** Платформа клиента ('ios', 'android', 'web', …); 'unknown' вне Mini App. */
  platform?: string;
  version?: string;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  enableClosingConfirmation?(): void;
  disableVerticalSwipes?(): void;
  Haptics?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  CloudStorage?: {
    setItem(key: string, value: string, cb?: (err: unknown, ok: boolean) => void): void;
    getItem(key: string, cb: (err: unknown, value: string) => void): void;
  };
  initDataUnsafe?: { user?: TgUser };
  initData?: string;
  viewportStableHeight?: number;
  onEvent?(event: string, cb: () => void): void;
  offEvent?(event: string, cb: () => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramAPI };
  }
}

export function getTelegram(): TelegramAPI | null {
  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
  if (!tg) return null;
  // telegram-web-app.js создаёт window.Telegram.WebApp даже при открытии
  // страницы как обычного сайта — это не Mini App.
  if (!tg.platform || tg.platform === 'unknown') return null;
  return tg;
}

export function isTelegram(): boolean {
  return getTelegram() !== null;
}

export function initTelegram(): TelegramAPI | null {
  const tg = getTelegram();
  if (!tg) return null;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.('#070a18');
    tg.setBackgroundColor?.('#070a18');
    tg.disableVerticalSwipes?.();
  } catch {
    // older clients may lack some APIs
  }
  return tg;
}

