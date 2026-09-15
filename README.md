# ⚡ Neon Match

Космическая головоломка «три в ряд» — веб-приложение и Telegram Mini App.
**100 уровней + бесконечный режим**, полностью процедурная графика и звук
(ни одного бинарного ассета в репозитории).

## Игровые механики

- Поле 8×8, 5–6 цветов кристаллов, вертикальная ориентация
- Бонусы: линейный бластер (4 в ряд), призма (5 в ряд), бомба 3×3 (L/T-форма)
- Комбо-свапы бонусов: крест, мега-бомба, цветные бластеры, очистка всего поля
- Лёд (1–2 слоя), цепи, каскады с множителем до x5
- 100 уровней: очки / сбор кристаллов / лёд, маски поля (крест, ромб, рамка, полосы)
- Звёзды: на уровнях с целью по очкам — за экономию ходов (запас на момент победы),
  на остальных — за очки; минимум ★1 даётся за любое прохождение
- Бесконечный режим: рекорд + серии каскадов дают +2 хода
- Энергия ⚡: неудача на уровне тратит 1 единицу (максимум 5), восстановление —
  1 за 3 часа или сразу за рекламу; победа с первой попытки возвращает +1,
  каждая серия из 3 таких побед — заряд суперспособности
- Спасение за рекламу на экране проигрыша: +5 ходов, партия продолжается
- Фон: у каждого уровня свой оттенок космоса (плавно перетекает между уровнями),
  в бесконечном режиме — медленно плывущий

## Запуск и сборка

```bash
npm install

npm run dev              # локальная разработка (browser-платформа)
npm run dev:telegram     # локальная разработка (telegram-платформа)
npm run dev:yandex       # локальная разработка (yandex-платформа)

npm test                 # модульные тесты (vitest)
npm run typecheck

npm run build:telegram   # production-сборка → dist-telegram/
npm run build:yandex     # production-сборка → dist-yandex/
npm run pack:yandex      # dist-yandex → neon-match-yandex.zip (для Консоли Яндекса)
npm run check:builds     # проверка: в каждой сборке только своя платформа
```

Один исходный код — две независимые сборки:

| | Telegram build | Yandex build |
|---|---|---|
| Папка | `dist-telegram/` | `dist-yandex/` |
| Реклама | AdsGram (rewarded) | Yandex Ads (`showRewardedVideo`) |
| Сохранения | Telegram CloudStorage + localStorage | Yandex Player (`getData/setData`) + localStorage |
| Лидерборды | — | `endless_best` |
| Энергия | активна (hard gate) | отключена (требование модерации) |

Платформа выбирается **на этапе сборки** (`vite --mode …`, alias `#platform`),
поэтому в Yandex-бандл не попадает AdsGram, а в Telegram-бандл — Yandex SDK.

## Публикация на Яндекс Играх

1. `npm run build:yandex && npm run pack:yandex` → `neon-match-yandex.zip`
   (index.html в корне архива, латиница без пробелов, лимит 100 МБ).
2. Загрузите ZIP в [Консоль разработчика Яндекс Игр](https://games.yandex.ru/console/).
3. Создайте лидерборд с техническим именем `endless_best` (Игра → Лидерборды).
4. Проверьте в черновике через Debug Panel: SDK init, Game Ready, i18n,
   пауза при потере фокуса, rewarded, облачные сохранения.

Сборка соответствует требованиям модерации: SDK подключается (`/sdk.js`),
`LoadingAPI.ready()` вызывается после готовности UI, язык берётся из
`environment.i18n.lang`, звук и геймплей ставятся на паузу во время рекламы
и при `game_api_pause`, rewarded — добровольный бонус (энергия отключена,
рядом со спасением всегда есть обычный «Повторить»).

## Публикация на GitHub Pages (Telegram Mini App)

1. **Settings → Pages → Source: GitHub Actions**
2. Запушьте ветку `main` — workflow соберёт `build:telegram`, прогонит тесты,
   проверит сборку и выложит игру автоматически.
3. Игра будет доступна по адресу `https://<username>.github.io/<repo>/`

`vite.config.ts` использует `base: './'`, поэтому сборка работает из любой папки.

## Подключение как Telegram Mini App

1. Соберите и выложите игру (см. выше) — нужен HTTPS, GitHub Pages подходит.
2. Откройте [@BotFather](https://t.me/BotFather) → `/newbot` (или существующий бот).
3. `/newapp` → выберите бота → укажите имя, описание, фото → в поле Web App URL вставьте адрес GitHub Pages.
4. Готово: кнопка меню бота и прямая ссылка `https://t.me/<bot>/<app>` открывают игру.

Интеграция уже включена: `ready()/expand()`, цвет шапки, отключение вертикальных
свайпов, кнопка «Назад», вибрация через `Haptics`, прогресс синхронизируется
через `CloudStorage` (в браузере — localStorage). Rewarded-реклама — AdsGram
(blockId в `src/platform/telegram/adsgram.ts`).

## Структура

```
index.html               HTML-каркас (canvas + оверлеи)
public/                  favicon, manifest (PWA)
src/core/                движок: поле, матчи, бонусы, 100 уровней, RNG
src/render/              canvas-графика: фон, гемы, частицы, анимации
src/audio/               WebAudio: синтезированные SFX и эмбиент-музыка
src/ui/                  экраны: меню, уровни, настройки, пауза, HUD, i18n RU/EN
src/platform/
  platform.ts            контракт PlatformAdapter (+PlatformFeatures)
  create-platform.ts     фабрика (alias '#platform' → impl выбранной платформы)
  browser/               браузерная платформа (GitHub Pages / dev)
  telegram/              Telegram WebApp + AdsGram + CloudStorage
  yandex/                Yandex Games SDK: реклама, Player, лидерборды, пауза
  storage/               save-schema (envelope v2), localStorage, SaveRepository
scripts/                 pack:yandex (ZIP), check:builds (проверка сборок)
tests/                   модульные тесты движка и платформенного слоя
```

Сохранения: `SaveData` в envelope `{schemaVersion, updatedAt, revision, data}`;
local — сразу, cloud — с debounce 1.5 c (критические события — сразу);
merge при старте по `updatedAt` с защитой «пустой сейв не затирает прогресс».
Добавление новой платформы (VK Play, CrazyGames…) = ещё один
`PlatformAdapter`, без изменения игрового кода.

## Технологии

Vite + TypeScript (strict), ноль рантайм-зависимостей (типы `@types/ysdk` —
только для разработки). Графика — Canvas 2D, звук — WebAudio (синтез).
Тесты — Vitest.
