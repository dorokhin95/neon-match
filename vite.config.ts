import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the build works on any GitHub Pages project URL
// (https://user.github.io/repo/) as well as Telegram Mini App hosting.
// Yandex build: archive is unpacked to the game root, so './' works there too.

export default defineConfig(({ mode }) => {
  const platform: 'telegram' | 'yandex' | 'browser' =
    mode === 'yandex' ? 'yandex' : mode === 'telegram' ? 'telegram' : 'browser';

  return {
    base: './',
    // Импорт '#platform' резолвится в impl-файл выбранной платформы —
    // гарантированный compile-time выбор без чужого кода в бандле.
    resolve: {
      alias: [
        {
          find: /^#platform$/,
          replacement: resolve(__dirname, `src/platform/${platform}/impl.ts`),
        },
      ],
    },
    build: {
      target: 'es2020',
      assetsInlineLimit: 8192,
      // Отдельные папки сборок: dist-telegram (GitHub Pages/Telegram),
      // dist-yandex (архив в Консоль Яндекс Игр).
      outDir: platform === 'yandex' ? 'dist-yandex' : platform === 'telegram' ? 'dist-telegram' : 'dist',
      emptyOutDir: true,
    },
    // Yandex: Telegram/AdsGram SDK не должны попадать в сборку — наоборот,
    // подключается локальный /sdk.js (копия не нужна: на площадке Яндекса
    // путь /sdk.js резолвится сам; в dev загрузчик сам пробует CDN).
    plugins:
      platform === 'yandex'
        ? [
            {
              name: 'yandex-replace-platform-sdks',
              transformIndexHtml(html: string): string {
                return html
                  .replace(/<script src="https:\/\/telegram\.org\/js\/telegram-web-app\.js[^"]*"><\/script>\s*/g, '')
                  .replace(/<script src="https:\/\/sad\.adsgram\.ai\/js\/sad\.min\.js"><\/script>\s*/g, '')
                  .replace('</title>', `</title>\n  <script src="/sdk.js"></script>`);
              },
            },
          ]
        : [],
    define: {
      // Версия игры из package.json — показывается в главном меню.
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
      // Платформа выбирается на этапе сборки (vite --mode), а не в рантайме.
      __PLATFORM__: JSON.stringify(platform),
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  } as ReturnType<typeof defineConfig>;
});
