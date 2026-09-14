// Thin typed wrapper over window.Telegram.WebApp. Everything degrades
// gracefully when running as a plain web page.

export interface TgUser {
  first_name?: string;
  language_code?: string;
}

export interface TelegramAPI {
  ready(): void;
  expand(): void;
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
  return tg ?? null;
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

export function tgHaptic(tg: TelegramAPI | null, style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    tg?.Haptics?.impactOccurred(style);
  } catch {
    // ignore
  }
}

export function tgHapticNotify(tg: TelegramAPI | null, type: 'error' | 'success' | 'warning'): void {
  try {
    tg?.Haptics?.notificationOccurred(type);
  } catch {
    // ignore
  }
}

export function tgVibrate(enabled: boolean): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(15);
  } catch {
    // ignore
  }
}

/** Unified haptics: Telegram Haptics inside Telegram, vibration API on web. */
export function haptic(tg: TelegramAPI | null, enabled: boolean, style: 'light' | 'medium' | 'heavy' = 'light'): void {
  if (!enabled) return;
  if (isTelegram() && tg) {
    tgHaptic(tg, style);
  } else {
    tgVibrate(true);
  }
}

export function hapticNotify(tg: TelegramAPI | null, enabled: boolean, type: 'error' | 'success' | 'warning'): void {
  if (!enabled) return;
  if (isTelegram() && tg) {
    tgHapticNotify(tg, type);
  } else {
    try {
      navigator.vibrate?.(type === 'error' ? [30, 40, 30] : 25);
    } catch {
      // ignore
    }
  }
}
