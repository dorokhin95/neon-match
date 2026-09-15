// Фабрика платформ. Платформа выбирается на этапе сборки: импорт '#platform'
// резолвится alias'ом в vite.config.ts в impl-файл конкретной платформы.
// В production-бандл попадает только код выбранной платформы: AdsGram не
// попадает в Yandex-сборку, YaGames — в Telegram-сборку.

import type { PlatformAdapter } from './platform';
import { PlatformImpl } from '#platform';

export function createPlatform(): PlatformAdapter {
  return new PlatformImpl();
}
