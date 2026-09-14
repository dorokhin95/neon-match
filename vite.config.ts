import { defineConfig } from 'vite';

// Relative base so the build works on any GitHub Pages project URL
// (https://user.github.io/repo/) as well as Telegram Mini App hosting.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 8192,
  },
  define: {
    // Версия игры из package.json — показывается в главном меню.
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0'),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as ReturnType<typeof defineConfig>);
