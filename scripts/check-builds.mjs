// Автоматическая проверка production-сборок (раздел 68 ТЗ).
// Yandex: не должно быть AdsGram/Telegram/t.me, должен быть /sdk.js.
// Telegram: не должно быть Yandex SDK.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const FORBIDDEN_YANDEX = ['adsgram', 'sad.adsgram.ai', 'telegram-web-app.js', 'telegram.webapp', 't.me/'];
const FORBIDDEN_TELEGRAM = ['sdk.js', 'yandex.ru/games/sdk', 'yagames'];

async function collect(dir, base = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...(await collect(join(dir, entry.name), rel)));
    else files.push(rel);
  }
  return files;
}

async function scan(dir, forbidden, label) {
  const files = await collect(dir);
  if (files.length === 0) {
    console.error(`✗ ${label}: ${dir} is empty or missing`);
    return false;
  }
  let ok = true;
  for (const rel of files) {
    const content = await readFile(join(dir, rel), 'utf8').catch(() => '');
    for (const needle of forbidden) {
      if (content.toLowerCase().includes(needle)) {
        console.error(`✗ ${label}: "${needle}" found in ${rel}`);
        ok = false;
      }
    }
  }
  return ok;
}

const yandexOk = await scan('dist-yandex', FORBIDDEN_YANDEX, 'Yandex build');
if (yandexOk) {
  const html = await readFile('dist-yandex/index.html', 'utf8').catch(() => '');
  if (!html.includes('/sdk.js')) {
    console.error('✗ Yandex build: /sdk.js loader is missing from index.html');
    process.exit(1);
  }
  console.log('✓ Yandex build: no Telegram/AdsGram traces, /sdk.js present');
}

const telegramOk = await scan('dist-telegram', FORBIDDEN_TELEGRAM, 'Telegram build');
if (telegramOk) {
  const html = await readFile('dist-telegram/index.html', 'utf8').catch(() => '');
  if (!html.includes('telegram-web-app.js') || !html.includes('sad.adsgram.ai')) {
    console.error('✗ Telegram build: Telegram/AdsGram SDK missing from index.html');
    process.exit(1);
  }
  console.log('✓ Telegram build: no Yandex SDK traces, Telegram SDK present');
}

if (!yandexOk || !telegramOk) process.exit(1);
console.log('✓ Build checks passed');
