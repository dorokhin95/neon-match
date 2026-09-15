// Диагностическое логирование платформенного слоя.
// В production вывод сокращён: только предупреждения и ошибки.

type Category = 'SDK' | 'Ads' | 'Save' | 'Stats' | 'Leaderboard' | 'Auth' | 'Platform';

export function platformLog(category: Category, message: string, ...rest: unknown[]): void {
  if (import.meta.env.DEV) console.log(`[${category}] ${message}`, ...rest);
}

export function platformWarn(category: Category, message: string, ...rest: unknown[]): void {
  console.warn(`[${category}] ${message}`, ...rest);
}

export function platformError(category: Category, message: string, error?: unknown): void {
  console.error(`[${category}] ${message}`, error ?? '');
}
