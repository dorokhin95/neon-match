// Точка подмены для alias-резолва: в Yandex-сборке импорт '#platform'
// указывает на этот файл, и в бандл попадает только Yandex-код.
export { YandexPlatform as PlatformImpl } from './yandex-platform';
