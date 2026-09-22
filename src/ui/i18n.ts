// RU/EN localization. Auto-detected on first launch, switchable in settings.

export type Lang = 'ru' | 'en';

type Dict = Record<string, string>;

const RU: Dict = {
  'menu.play': 'Играть',
  'menu.continue': 'Продолжить — уровень {n}',
  'menu.endless': 'Бесконечный режим',
  'menu.settings': 'Настройки',
  'menu.howto': 'Как играть',
  'menu.best': 'Рекорд: {n}',
  'menu.bestCombo': 'Лучшая серия: x{n}',
  'menu.subtitle': 'Головоломка «три в ряд»',

  'levels.title': 'Уровни',
  'levels.locked': 'Пройдите предыдущие уровни, чтобы открыть',

  'game.moves': 'Ходы',
  'game.score': 'Счёт',
  'game.goal': 'Цель уровня',
  'game.goalScore': 'Набрать {n} очков',
  'game.goalIce': 'Разбей лёд: {n}',
  'game.goalCollect': 'Собери: {n}',
  'game.hudIce': 'Лёд — собирай фишки рядом с ледяными плитками',
  'game.hudCollect': 'Собери эти фишки',
  'game.hudScore': 'Набери очки',
  'game.powerFirst': 'Бонус! Свапните его с любым соседним кристаллом — он сработает.',
  'game.combo': 'Серия x{n}',
  'game.attempt': 'Попытка {n}',
  'game.lowMoves': 'Ходов мало — время способностей!',
  'game.combo1': 'Отлично!',
  'game.combo2': 'Здорово!',
  'game.combo3': 'Потрясающе!',
  'game.combo4': 'Невероятно!',
  'game.combo5': 'КОСМОС!',

  'pause.title': 'Пауза',
  'pause.resume': 'Продолжить',
  'pause.restart': 'Заново',
  'pause.settings': 'Настройки',
  'pause.quit': 'Выйти в меню',

  'win.title': 'Уровень пройден!',
  'win.next': 'Следующий уровень',
  'win.retry': 'Переиграть',
  'win.menu': 'В меню',
  'win.score': 'Счёт',
  'win.best': 'Рекорд',
  'win.thresholds': '★ 1 — {s1}   ★ 2 — {s2}   ★ 3 — {s3}',
  'win.nextStar': 'До следующей звезды: ещё {n} очков',
  'win.nextStarDone': 'Все звёзды собраны!',
  'win.thresholdsMoves': '★ 1 — пройти уровень · ★ 2 — запас ≥ {s2} ходов · ★ 3 — запас ≥ {s3} ходов',
  'win.nextStarMoves': 'Для ★{m} нужно закончить с запасом ≥ {n} ходов',
  'win.perfect': 'С первой попытки! +1 ⚡',
  'win.streakReward': 'Серия {n} побед! Награда: {name}',

  'lose.rescue': '▶ Продолжить: +5 ходов',
  'lose.energy': '⚡ Энергия: {n}/{max}',

  'energy.adName': '+1 ⚡',
  'energy.next': '+1 через {t}',
  'energy.empty.title': 'Энергия кончилась',
  'energy.hint': 'Неудача на уровне тратит 1 ⚡. Восстановление: 1 единица за 3 часа или сразу за рекламу.',
  'energy.got': '+1 ⚡ получено!',
  'rescue.adName': '+5 ходов',
  'rescue.got': '+5 ходов — продолжаем!',

  'lose.title': 'Ходы закончились',
  'lose.retry': 'Попробовать снова',
  'lose.menu': 'В меню',

  'settings.title': 'Настройки',
  'settings.music': 'Музыка',
  'settings.sfx': 'Звуки',
  'settings.haptics': 'Вибрация',
  'settings.language': 'Язык',
  'settings.reset': 'Сбросить прогресс',
  'settings.resetConfirm': 'Точно сбросить весь прогресс?',
  'settings.yes': 'Да, сбросить',
  'settings.no': 'Отмена',
  'settings.done': 'Готово',
  'settings.back': 'Назад',

  'howto.title': 'Как играть',
  'howto.p1': 'Меняйте местами соседние кристаллы, чтобы собрать линию из 3 и более одинаковых. Цель уровня показывается сверху — выполните её до конца ходов.',
  'howto.p2': 'Соберите 4 и больше кристаллов — появится бонус. Свапните его с любым соседним кристаллом, и он сработает!',
  'howto.p3': 'Комбинируйте бонусы, свапая их друг с другом: крест, мега-бомба, цветные бластеры или очистка всего поля!',
  'howto.p4': 'Лёд разбивается совпадениями рядом с ним. Цепи снимаются первым совпадением с кристаллом.',
  'howto.p5': 'Каскады дают всё больший множитель очков — до x5. Держите серию!',
  'howto.powerRow': 'Ряд — 4 в линию: сметает всю строку',
  'howto.powerCol': 'Столбец — 4 в столбец: сметает всю колонку',
  'howto.powerBomb': 'Бомба — L/T-форма: взрыв 3×3',
  'howto.powerPrism': 'Призма — 5 в линию: убирает все кристаллы одного цвета',
  'howto.iceTitle': 'Лёд',
  'howto.iceText': 'Ледяные плитки: разбей их, собирая фишки в соседних клетках. Двойной лёд требует двух ударов.',

  'endless.newRecord': 'Новый рекорд!',
  'endless.title': 'Бесконечный режим',
  'endless.movesAdded': '+{n} ходов за серию!',

  'toast.movesLeft': 'Осталось ходов: {n}',
  'toast.noMoves': 'Нет доступных ходов — перемешиваем…',

  'stars.how': '★1 — выполнить цель: {s1} очков · ★2 — {s2} · ★3 — {s3}',
  'stars.next': 'Ещё {n} очков до ★{m}',

  'super.title': 'Способности',
  'super.bomb': 'Бомба — взрыв 3×3: выберите место',
  'super.lightning': 'Молния — убирает один любой кристалл',
  'super.extraMoves': '+2 хода',
  'super.empty': 'Нет зарядов — получите за рекламу',
  'super.adTitle': 'Получить способность?',
  'super.adText': 'После короткой рекламы вы получите «{name}».',
  'super.adWatch': 'Смотреть',
  'super.adCancel': 'Позже',
  'ad.skipped': 'Реклама не досмотрена — награда не начислена',
  'ad.unavailable': 'Реклама сейчас недоступна',
  'super.got': '{name} получена!',
  'super.selectCell': 'Выберите клетку для {name}',
  'super.cancelSelect': 'Отменено',
  'super.usedBomb': 'Бум! Бомба сработала',
  'super.usedLightning': 'Молния ударила!',
  'super.usedMoves': '+2 хода',
  'common.stars': 'Звёзды',
  'common.level': 'Уровень {n}',
  'common.loading': 'Загрузка…',
  'common.loadError': 'Не удалось запустить игру. Обновите страницу.',
  'common.on': 'Вкл',
  'common.off': 'Выкл',
};

const EN: Dict = {
  'menu.play': 'Play',
  'menu.continue': 'Continue — level {n}',
  'menu.endless': 'Endless mode',
  'menu.settings': 'Settings',
  'menu.howto': 'How to play',
  'menu.best': 'Best: {n}',
  'menu.bestCombo': 'Best combo: x{n}',
  'menu.subtitle': 'Match-3 puzzle',

  'levels.title': 'Levels',
  'levels.locked': 'Clear previous levels to unlock',

  'game.moves': 'Moves',
  'game.score': 'Score',
  'game.goal': 'Level goal',
  'game.goalScore': 'Score {n} points',
  'game.goalIce': 'Break the ice: {n}',
  'game.goalCollect': 'Collect: {n}',
  'game.hudIce': 'Ice — match gems next to ice tiles',
  'game.hudCollect': 'Collect these gems',
  'game.hudScore': 'Reach the score',
  'game.powerFirst': 'Power gem! Swap it with any neighbor to trigger it.',
  'game.combo': 'Combo x{n}',
  'game.attempt': 'Attempt {n}',
  'game.lowMoves': 'Low on moves — power-up time!',
  'game.combo1': 'Great!',
  'game.combo2': 'Nice!',
  'game.combo3': 'Amazing!',
  'game.combo4': 'Incredible!',
  'game.combo5': 'COSMIC!',

  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart',
  'pause.settings': 'Settings',
  'pause.quit': 'Quit to menu',

  'win.title': 'Level complete!',
  'win.next': 'Next level',
  'win.retry': 'Replay',
  'win.menu': 'Menu',
  'win.score': 'Score',
  'win.best': 'Best',
  'win.thresholds': '★ 1 — {s1}   ★ 2 — {s2}   ★ 3 — {s3}',
  'win.nextStar': '{n} more points for the next star',
  'win.nextStarDone': 'All stars collected!',
  'win.thresholdsMoves': '★ 1 — clear the level · ★ 2 — ≥ {s2} moves to spare · ★ 3 — ≥ {s3} moves to spare',
  'win.nextStarMoves': 'Finish with ≥ {n} moves to spare for ★{m}',
  'win.perfect': 'First try! +1 ⚡',
  'win.streakReward': 'Streak of {n} wins! Reward: {name}',

  'lose.rescue': '▶ Continue: +5 moves',
  'lose.energy': '⚡ Energy: {n}/{max}',

  'energy.adName': '+1 ⚡',
  'energy.next': '+1 in {t}',
  'energy.empty.title': 'Out of energy',
  'energy.hint': 'Failing a level costs 1 ⚡. Refill: 1 unit every 3 hours, or instantly for an ad.',
  'energy.got': '+1 ⚡ received!',
  'rescue.adName': '+5 moves',
  'rescue.got': '+5 moves — keep going!',

  'lose.title': 'Out of moves',
  'lose.retry': 'Try again',
  'lose.menu': 'Menu',

  'settings.title': 'Settings',
  'settings.music': 'Music',
  'settings.sfx': 'Sounds',
  'settings.haptics': 'Haptics',
  'settings.language': 'Language',
  'settings.reset': 'Reset progress',
  'settings.resetConfirm': 'Reset all progress?',
  'settings.yes': 'Yes, reset',
  'settings.no': 'Cancel',
  'settings.done': 'Done',
  'settings.back': 'Back',

  'howto.p1': 'Swap adjacent gems to line up 3 or more of the same kind.',
  'howto.p2': 'Match 4+ gems to create a power gem. Swap it with any neighbor to set it off!',
  'howto.p3': 'Combine power gems by swapping them together: cross blast, mega bomb, color blasters or a full-board wipe!',
  'howto.p4': 'Ice breaks when you match next to it. Chains come off with the first match involving the gem.',
  'howto.p5': 'Cascades multiply your score up to x5. Keep the chain going!',
  'howto.powerRow': 'Row — 4 in a line: clears the whole row',
  'howto.powerCol': 'Column — 4 in a column: clears the whole column',
  'howto.powerBomb': 'Bomb — L/T shape: 3×3 blast',
  'howto.powerPrism': 'Prism — 5 in a line: removes all gems of one color',
  'howto.iceTitle': 'Ice',
  'howto.iceText': 'Ice tiles: break them by matching gems in adjacent cells. Double ice takes two hits.',

  'endless.newRecord': 'New record!',
  'endless.title': 'Endless mode',
  'endless.movesAdded': '+{n} moves for combo!',

  'toast.movesLeft': 'Moves left: {n}',
  'toast.noMoves': 'No moves left — shuffling…',

  'stars.how': '★1 — complete the goal: {s1} points · ★2 — {s2} · ★3 — {s3}',
  'stars.next': '{n} more points to ★{m}',

  'super.title': 'Power-ups',
  'super.bomb': 'Bomb — 3×3 blast: pick a spot',
  'super.lightning': 'Lightning — removes any single gem',
  'super.extraMoves': '+2 moves',
  'super.empty': 'No charges — get them for an ad',
  'super.adTitle': 'Get a power-up?',
  'super.adText': 'After a short ad you will get “{name}”.',
  'super.adWatch': 'Watch',
  'super.adCancel': 'Later',
  'ad.skipped': 'The ad was not watched to the end — no reward',
  'ad.unavailable': 'Ads are unavailable right now',
  'super.got': '{name} received!',
  'super.selectCell': 'Pick a cell for {name}',
  'super.cancelSelect': 'Cancelled',
  'super.usedBomb': 'Boom! Bomb went off',
  'super.usedLightning': 'Lightning struck!',
  'super.usedMoves': '+2 moves',
  'common.stars': 'Stars',
  'common.level': 'Level {n}',
  'common.loading': 'Loading…',
  'common.loadError': 'Could not start the game. Please reload the page.',
  'common.on': 'On',
  'common.off': 'Off',
};

const DICTS: Record<Lang, Dict> = { ru: RU, en: EN };

let current: Lang = 'ru';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[current] ?? RU;
  let s = dict[key] ?? RU[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}
