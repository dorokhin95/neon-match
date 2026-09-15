// Точка подмены для alias-резолва: в Telegram-сборке импорт '#platform'
// указывает на этот файл, и в бандл попадает только Telegram-код.
export { TelegramPlatform as PlatformImpl } from './telegram-platform';
