/// <reference types="vite/client" />

/** Версия игры, инжектируется из package.json через define в vite.config.ts. */
declare const __APP_VERSION__: string;

/** Целевая платформа сборки: 'telegram' | 'yandex' | 'browser'.
 *  Инжектируется через define по --mode запуска vite. */
declare const __PLATFORM__: 'telegram' | 'yandex' | 'browser';
