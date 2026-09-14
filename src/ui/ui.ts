// UI layer: all screens are HTML overlays over the canvas.

import { TOTAL_LEVELS } from '../core/levels';
import type { LevelDef, WinStats } from '../core/types';
import { drawGemBody, drawIceOverlay, drawPowerOverlay, drawLightningIcon, GEM_COLORS } from '../render/gem';
import { t } from './i18n';

/** Версия игры — берётся из package.json на этапе сборки. */
const APP_VERSION = __APP_VERSION__;

export type ScreenName = 'menu' | 'levels' | 'settings' | 'howto' | 'game';

export type SuperKind = 'bomb' | 'lightning' | 'extraMoves';

/** Источник состояния энергии для виджета (владелец — Game). */
export interface EnergyOpts {
  get: () => { current: number; max: number; nextInMs: number };
  onAd: () => void;
}

/** Компактный «2:59:12» — сколько ждать следующей единицы энергии. */
function formatHMS(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', `btn ${cls}`, text);
  b.addEventListener('click', onClick);
  return b;
}

export class UI {
  root: HTMLElement;
  current: HTMLElement | null = null;
  /** Живые виджеты энергии текущего экрана — тикают раз в секунду. */
  private energyWidgets: Array<() => void> = [];

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /** Раз в секунду обновляет таймеры энергии на активном экране. */
  tickEnergy(): void {
    for (const refresh of this.energyWidgets) refresh();
  }

  /** Replace the active screen with a fade transition. */
  show(build: (container: HTMLElement) => void): HTMLElement {
    this.energyWidgets = [];
    if (this.current) {
      this.current.classList.remove('active');
      const old = this.current;
      window.setTimeout(() => old.remove(), 300);
    }
    const screen = el('div', 'screen');
    const inner = el('div', 'screen-scroll');
    screen.appendChild(inner);
    build(inner);
    this.root.appendChild(screen);
    requestAnimationFrame(() => requestAnimationFrame(() => screen.classList.add('active')));
    this.current = screen;
    return screen;
  }

  // ============ Main menu ============

  mainMenu(opts: {
    best: number;
    bestCombo: number;
    nextLevel: number;
    energy?: EnergyOpts;
    onPlay: () => void;
    onContinue: () => void;
    onEndless: () => void;
    onSettings: () => void;
    onHowto: () => void;
  }): void {
    this.show((c) => {
      const logo = el('div', 'title-xl', 'NEON MATCH');
      const sub = el('div', 'subtitle', t('menu.subtitle'));
      c.appendChild(logo);
      c.appendChild(sub);
      c.appendChild(el('div', undefined, ' '));

      const best = el('div', 'hint', `${t('menu.best', { n: opts.best })} · ${t('menu.bestCombo', { n: opts.bestCombo })}`);
      c.appendChild(best);
      if (opts.energy) c.appendChild(this.buildEnergyChip(opts.energy).root);
      c.appendChild(el('div', undefined, ' '));

      // «Продолжить» — сразу в первый непройденный уровень (если игра начата).
      if (opts.nextLevel > 1) {
        c.appendChild(btn('btn-primary', `▶ ${t('menu.continue', { n: opts.nextLevel })}`, opts.onContinue));
        c.appendChild(btn('btn', t('menu.play'), opts.onPlay));
      } else {
        c.appendChild(btn('btn-primary', `▶ ${t('menu.play')}`, opts.onPlay));
      }
      c.appendChild(btn('btn', `∞ ${t('menu.endless')}`, opts.onEndless));
      c.appendChild(btn('btn-ghost', `⚙ ${t('menu.settings')}`, opts.onSettings));
      c.appendChild(btn('btn-ghost', `? ${t('menu.howto')}`, opts.onHowto));
      c.appendChild(el('div', 'footer-note', `v${APP_VERSION}`));
    });
  }

  // ============ Level select ============

  levelSelect(opts: {
    unlocked: number;
    starsOf: (n: number) => number;
    energy?: EnergyOpts;
    onBack: () => void;
    onPick: (n: number) => void;
  }): void {
    this.show((c) => {
      const head = el('div', 'levels-head');
      head.appendChild(el('div', 'h2', t('levels.title')));
      if (opts.energy) head.appendChild(this.buildEnergyChip(opts.energy).root);
      c.appendChild(head);

      const pages = Math.ceil(TOTAL_LEVELS / 25);
      let page = Math.min(pages - 1, Math.floor((opts.unlocked - 1) / 25));
      const grid = el('div', 'levels-grid');
      const pager = el('div', 'seg seg-wide');
      const hint = el('div', 'hint', t('levels.locked'));

      // Пейджер строится один раз: при смене страницы лишь плавно переезжает
      // подсветка (CSS-transition), а кнопки не пересоздаются.
      const pagerBtns: HTMLButtonElement[] = [];
      for (let p = 0; p < pages; p++) {
        const pb = el('button', undefined, `${p * 25 + 1}–${Math.min((p + 1) * 25, TOTAL_LEVELS)}`);
        pb.addEventListener('click', () => {
          if (p === page) return;
          render(p, p > page ? 1 : -1);
        });
        pager.appendChild(pb);
        pagerBtns.push(pb);
      }

      /** dir: 1 — вперёд (новая страница выезжает справа), -1 — назад, 0 — первый показ. */
      const render = (target: number, dir: 0 | 1 | -1 = 0): void => {
        page = target;
        grid.innerHTML = '';
        for (let i = 1; i <= 25; i++) {
          const n = page * 25 + i;
          if (n > TOTAL_LEVELS) break;
          const cell = el('button', 'level-cell');
          cell.style.setProperty('--i', String(i - 1));
          const locked = n > opts.unlocked;
          if (locked) {
            cell.classList.add('locked');
            cell.textContent = '🔒';
          } else {
            const stars = opts.starsOf(n);
            cell.innerHTML = `${n}<span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
            if (n === opts.unlocked) cell.classList.add('current');
            cell.addEventListener('click', () => opts.onPick(n));
          }
          grid.appendChild(cell);
        }
        if (dir !== 0) {
          // Направленный слайд страницы; reflow перезапускает анимацию.
          grid.style.setProperty('--page-dx', `${dir * 28}px`);
          grid.classList.remove('paged', 'wave');
          void grid.offsetWidth;
          grid.classList.add('paged');
        } else {
          grid.classList.add('wave');
        }
        pagerBtns.forEach((pb, i) => pb.classList.toggle('on', i === page));
      };
      render(page);
      c.appendChild(grid);
      c.appendChild(pager);
      c.appendChild(hint);
      c.appendChild(btn('btn-ghost', `← ${t('settings.back')}`, opts.onBack));
    });
  }

  // ============ Settings ============

  settings(opts: {
    get: () => { music: number; sfx: number; haptics: boolean; lang: 'ru' | 'en' };
    set: (s: { music?: number; sfx?: number; haptics?: boolean; lang?: 'ru' | 'en' }) => void;
    onBack: () => void;
    onReset: () => void;
  }): void {
    this.show((c) => {
      c.appendChild(el('div', 'h2', t('settings.title')));
      const panel = el('div', 'panel');
      const list = el('div', 'settings-list');

      // Music volume
      const musicRow = el('div', 'setting-row');
      musicRow.appendChild(el('label', undefined, t('settings.music')));
      const musicR = el('input') as HTMLInputElement;
      musicR.type = 'range';
      musicR.min = '0';
      musicR.max = '100';
      musicR.value = String(Math.round(opts.get().music * 100));
      musicR.addEventListener('input', () => opts.set({ music: Number(musicR.value) / 100 }));
      musicRow.appendChild(musicR);
      list.appendChild(musicRow);

      // SFX volume
      const sfxRow = el('div', 'setting-row');
      sfxRow.appendChild(el('label', undefined, t('settings.sfx')));
      const sfxR = el('input') as HTMLInputElement;
      sfxR.type = 'range';
      sfxR.min = '0';
      sfxR.max = '100';
      sfxR.value = String(Math.round(opts.get().sfx * 100));
      sfxR.addEventListener('input', () => opts.set({ sfx: Number(sfxR.value) / 100 }));
      sfxRow.appendChild(sfxR);
      list.appendChild(sfxRow);

      // Haptics toggle
      const hapRow = el('div', 'setting-row');
      hapRow.appendChild(el('label', undefined, t('settings.haptics')));
      const tog = el('div', `toggle${opts.get().haptics ? ' on' : ''}`);
      tog.addEventListener('click', () => {
        const on = !tog.classList.contains('on');
        tog.classList.toggle('on', on);
        opts.set({ haptics: on });
      });
      hapRow.appendChild(tog);
      list.appendChild(hapRow);

      // Language
      const langRow = el('div', 'setting-row');
      langRow.appendChild(el('label', undefined, t('settings.language')));
      const seg = el('div', 'seg');
      const ru = el('button', opts.get().lang === 'ru' ? 'on' : undefined, 'RU');
      const en = el('button', opts.get().lang === 'en' ? 'on' : undefined, 'EN');
      ru.addEventListener('click', () => {
        opts.set({ lang: 'ru' });
        ru.classList.add('on');
        en.classList.remove('on');
      });
      en.addEventListener('click', () => {
        opts.set({ lang: 'en' });
        en.classList.add('on');
        ru.classList.remove('on');
      });
      seg.appendChild(ru);
      seg.appendChild(en);
      langRow.appendChild(seg);
      list.appendChild(langRow);

      panel.appendChild(list);
      c.appendChild(panel);

      c.appendChild(btn('btn-danger', t('settings.reset'), opts.onReset));
      c.appendChild(btn('btn-primary', t('settings.back'), opts.onBack));
    });
  }

  // ============ How to play ============

  howto(onBack: () => void): void {
    this.show((c) => {
      c.appendChild(el('div', 'h2', t('howto.title')));
      const panel = el('div', 'panel');
      for (let i = 1; i <= 2; i++) {
        const p = el('p', 'hint', t(`howto.p${i}`));
        p.style.marginBottom = '10px';
        panel.appendChild(p);
      }
      // Таблица бонусов с canvas-иконками, как в игре.
      const table = el('div', 'howto-powers');
      const powers: Array<{ power: number; label: string; draw: (ctx: CanvasRenderingContext2D, size: number) => void }> = [
        {
          power: 1,
          label: t('howto.powerRow'),
          draw: (ctx, s) => {
            drawGemBody(ctx, 0, s * 0.5, 1);
            drawPowerOverlay(ctx, 1, s * 0.5, 1);
          },
        },
        {
          power: 2,
          label: t('howto.powerCol'),
          draw: (ctx, s) => {
            drawGemBody(ctx, 2, s * 0.5, 1);
            drawPowerOverlay(ctx, 2, s * 0.5, 1);
          },
        },
        {
          power: 3,
          label: t('howto.powerBomb'),
          draw: (ctx, s) => {
            drawGemBody(ctx, 4, s * 0.5, 1);
            drawPowerOverlay(ctx, 3, s * 0.5, 1);
          },
        },
        {
          power: 4,
          label: t('howto.powerPrism'),
          draw: (ctx, s) => {
            drawGemBody(ctx, 1, s * 0.5, 1);
            drawPowerOverlay(ctx, 4, s * 0.5, 1);
          },
        },
      ];
      for (const { label, draw } of powers) {
        const row = el('div', 'howto-power-row');
        const cv = document.createElement('canvas');
        cv.width = 56;
        cv.height = 56;
        cv.className = 'howto-power-icon';
        const cx2 = cv.getContext('2d')!;
        cx2.translate(28, 28);
        draw(cx2, 44);
        row.appendChild(cv);
        row.appendChild(el('div', 'howto-power-label', label));
        table.appendChild(row);
  }
      panel.appendChild(table);
      const p3 = el('p', 'hint', t('howto.p3'));
      p3.style.marginBottom = '10px';
      panel.appendChild(p3);
      const p4 = el('p', 'hint', t('howto.p4'));
      p4.style.marginBottom = '10px';
      panel.appendChild(p4);
      const p5 = el('p', 'hint', t('howto.p5'));
      panel.appendChild(p5);
      c.appendChild(panel);
      c.appendChild(btn('btn-primary', t('settings.back'), onBack));
    });
  }

  // ============ Confirm dialog ============

  confirm(text: string, yesLabel: string, noLabel: string, onYes: () => void): void {
    const backdrop = el('div', 'modal-backdrop');
    const modal = el('div', 'modal');
    modal.appendChild(el('div', 'h2', text));
    modal.appendChild(btn('btn-danger', yesLabel, () => {
      backdrop.classList.remove('active');
      window.setTimeout(() => backdrop.remove(), 250);
      onYes();
    }));
    modal.appendChild(btn('btn-ghost', noLabel, () => {
      backdrop.classList.remove('active');
      window.setTimeout(() => backdrop.remove(), 250);
    }));
    backdrop.appendChild(modal);
    this.root.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('active'));
  }

  // ============ HUD ============

  buildHud(level: LevelDef): {
    root: HTMLElement;
    moves: HTMLElement;
    score: HTMLElement;
    goals: HTMLElement[];
    goalTexts: string[];
    updateGoal: (i: number, cur: number, target: number) => void;
  } {
    const root = el('div');
    root.id = 'hud';
    const row = el('div', 'hud-row');

    const movesChip = el('div', 'hud-chip accent');
    movesChip.appendChild(el('div', 'hud-label', t('game.moves')));
    const movesVal = el('div', 'hud-value', String(level.moves));
    movesChip.appendChild(movesVal);
    row.appendChild(movesChip);

    const scoreChip = el('div', 'hud-chip');
    scoreChip.appendChild(el('div', 'hud-label', t('game.score')));
    const scoreVal = el('div', 'hud-value', '0');
    scoreChip.appendChild(scoreVal);
    row.appendChild(scoreChip);

    // Цель — абсолютно по центру верхней строки (независимо от чипов слева).
    const goalRow = el('div', 'hud-goal');
    const goals: HTMLElement[] = [];
    const goalTexts: string[] = [];
    for (const g of level.n === 0 ? [] : level.goals) {
      const chip = el('div', 'goal-chip');
      if (g.kind === 'collect' && g.gem !== undefined) {
        // Мини-версия формы гема: цвет + шейдонакальный блик, как на поле.
        const dot = el('span', 'goal-gem');
        const pal = GEM_COLORS[g.gem]!;
        dot.style.cssText = `background:${pal.base};box-shadow:0 0 10px ${pal.glow}, inset 0 -2px 4px rgba(0,0,0,0.35), inset 0 2px 3px rgba(255,255,255,0.5);`;
        chip.appendChild(dot);
        chip.title = t('game.hudCollect');
      } else if (g.kind === 'ice') {
        // Иконка льда ровно как на поле: гем под полупрозрачной ледяной коркой.
        const cv = document.createElement('canvas');
        cv.width = 30;
        cv.height = 30;
        cv.className = 'goal-ice-icon';
        const c2 = cv.getContext('2d')!;
        c2.translate(15, 15);
        drawGemBody(c2, 0, 11, 1);
        drawIceOverlay(c2, 1, 11);
        chip.appendChild(cv);
        chip.title = t('game.hudIce');
      } else {
        chip.appendChild(el('span', 'goal-trophy', '🏆'));
        chip.classList.add('goal-score');
        chip.title = t('game.hudScore');
      }
      goalTexts.push(String(g.amount));
      // Прогресс-бар с числами.
      const bar = el('div', 'goal-bar');
      const fill = el('div', 'goal-fill');
      bar.appendChild(fill);
      chip.appendChild(bar);
      const count = el('span', 'goal-count', `0/${g.amount}`);
      chip.appendChild(count);
      goalRow.appendChild(chip);
      goals.push(chip);
    }
    // Цель центрируется абсолютно внутри строки HUD, пауза — справа.
    row.appendChild(goalRow);

    const pauseBtn = el('button', 'btn btn-ghost', '⏸');
    pauseBtn.id = 'btn-pause';
    row.appendChild(pauseBtn);
    root.appendChild(row);

    return {
      root,
      moves: movesVal,
      score: scoreVal,
      goals,
      goalTexts,
      updateGoal: (i, cur, target) => {
        const chip = goals[i];
        if (!chip) return;
        const done = cur >= target;
        const fill = chip.querySelector('.goal-fill') as HTMLElement | null;
        if (fill) fill.style.width = `${Math.min(100, (cur / Math.max(1, target)) * 100)}%`;
        const count = chip.querySelector('.goal-count');
        if (count) count.textContent = `${Math.min(cur, target)}/${target}`;
        chip.classList.toggle('done', done);
      },
      // pause click handled by caller via root.querySelector('#btn-pause')
    };
  }

  // ============ Виджет энергии ============

  /** Чип «⚡ 4/5 · +1 через 2:59» с кнопкой рекламы, пока энергия не полная. */
  buildEnergyChip(opts: EnergyOpts): { root: HTMLElement; refresh: () => void } {
    const root = el('div', 'energy-chip');
    root.appendChild(el('span', 'energy-icon', '⚡'));
    const val = el('span', 'energy-val');
    const next = el('span', 'energy-next');
    const ad = el('button', 'energy-ad', '+');
    ad.type = 'button';
    ad.title = t('energy.adName');
    ad.addEventListener('click', opts.onAd);
    root.appendChild(val);
    root.appendChild(next);
    root.appendChild(ad);
    const refresh = (): void => {
      const s = opts.get();
      val.textContent = `${s.current}/${s.max}`;
      next.textContent = s.current >= s.max ? '' : t('energy.next', { t: formatHMS(s.nextInMs) });
      ad.style.display = s.current >= s.max ? 'none' : '';
    };
    refresh();
    this.energyWidgets.push(refresh);
    return { root, refresh };
  }

  // ============ Панель суперспособностей (за рекламу — заглушка) ============

  /** Панель внизу экрана: бомба / молния / +2 хода. Счётчики — из сейва. */
  buildPowerBar(opts: {
    counts: { bomb: number; lightning: number; extraMoves: number };
    onUse: (kind: SuperKind) => void;
    onGet: (kind: SuperKind) => void;
  }): { root: HTMLElement; refresh: (counts: { bomb: number; lightning: number; extraMoves: number }) => void } {
    const root = el('div');
    root.id = 'power-bar';
    const kinds: SuperKind[] = ['bomb', 'lightning', 'extraMoves'];
    const btns: Partial<Record<SuperKind, HTMLButtonElement>> = {};
    const refresh = (counts: { bomb: number; lightning: number; extraMoves: number }): void => {
      for (const k of kinds) {
        const b = btns[k];
        if (!b) continue;
        const n = counts[k];
        b.classList.toggle('empty', n <= 0);
        b.classList.toggle('armed', b.dataset.armed === '1');
        const cnt = b.querySelector('.pb-count');
        if (cnt) cnt.textContent = n > 0 ? String(n) : '+';
      }
    };
    for (const k of kinds) {
      const b = el('button', 'pb-btn') as HTMLButtonElement;
      b.dataset.kind = k;
      b.type = 'button';
      const icon = el('span', 'pb-icon');
      const cv = document.createElement('canvas');
      cv.width = 34;
      cv.height = 34;
      cv.className = 'pb-canvas';
      const c2 = cv.getContext('2d')!;
      c2.translate(17, 17);
      if (k === 'bomb') drawPowerOverlay(c2, 3, 13, 0);
      else if (k === 'lightning') drawLightningIcon(c2, 13);
      else {
        // +2 хода: двойная стрелка вверх с неоновым свечением.
        c2.strokeStyle = '#7dd3fc';
        c2.lineWidth = 3;
        c2.lineCap = 'round';
        c2.lineJoin = 'round';
        c2.shadowColor = '#7dd3fc';
        c2.shadowBlur = 8;
        for (const off of [-3.5, 3.5]) {
          c2.beginPath();
          c2.moveTo(off, 8);
          c2.lineTo(off, -8);
          c2.moveTo(off - 4.5, -3.5);
          c2.lineTo(off, -8);
          c2.lineTo(off + 4.5, -3.5);
          c2.stroke();
        }
      }
      icon.appendChild(cv);
      b.appendChild(icon);
      b.appendChild(el('span', 'pb-count', '0'));
      b.title = k === 'bomb' ? t('super.bomb') : k === 'lightning' ? t('super.lightning') : t('super.extraMoves');
      b.addEventListener('click', () => {
        if (btns[k]!.dataset.armed === '1') {
          btns[k]!.dataset.armed = '0';
          refresh(opts.counts);
          return;
        }
        opts.onUse(k);
      });
      btns[k] = b;
      root.appendChild(b);
    }
    refresh(opts.counts);
    return { root, refresh };
  }

  // ============ Панель суперспособностей (за рекламу — заглушка) ============

  /** Модалка заглушки рекламы: после «просмотра» выдаёт заявленную награду. */
  adStubModal(
    rewardName: string,
    onGranted: () => void,
    onCancel: () => void,
    title?: string,
    subtitle?: string,
  ): HTMLElement {
    const backdrop = el('div', 'modal-backdrop');
    const modal = el('div', 'modal');
    modal.appendChild(el('div', 'h2', title ?? t('super.adTitle')));
    if (subtitle) modal.appendChild(el('div', 'modal-text', subtitle));
    modal.appendChild(el('div', 'modal-text', t('super.adText', { name: rewardName })));
    modal.appendChild(btn('btn-primary', t('super.adWatch'), () => onGranted()));
    modal.appendChild(btn('btn-ghost', t('super.adCancel'), onCancel));
    backdrop.appendChild(modal);
    this.root.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('active'));
    return backdrop;
  }

  goalText(g: LevelDef['goals'][number]): string {
    if (g.kind === 'score') return (g.amount / 1000).toFixed(g.amount % 1000 === 0 ? 0 : 1) + 'k';
    return String(g.amount);
  }

  // ============ Pause modal ============

  pause(opts: { onResume: () => void; onRestart: () => void; onSettings: () => void; onQuit: () => void }): HTMLElement {
    const backdrop = el('div', 'modal-backdrop');
    const modal = el('div', 'modal');
    modal.appendChild(el('div', 'h2', t('pause.title')));
    modal.appendChild(btn('btn-primary', t('pause.resume'), opts.onResume));
    modal.appendChild(btn('btn', t('pause.restart'), opts.onRestart));
    modal.appendChild(btn('btn-ghost', t('pause.settings'), opts.onSettings));
    modal.appendChild(btn('btn-ghost', t('pause.quit'), opts.onQuit));
    backdrop.appendChild(modal);
    this.root.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('active'));
    return backdrop;
  }

  closeModal(backdrop: HTMLElement): void {
    backdrop.classList.remove('active');
    window.setTimeout(() => backdrop.remove(), 250);
  }

  /** Close every open modal (win/lose/pause). */
  clearModals(): void {
    this.root.querySelectorAll('.modal-backdrop').forEach((n) => n.remove());
  }

  // ============ Win / Lose ============

  win(stats: WinStats, opts: { onNext: () => void; onRetry: () => void; onMenu: () => void; hasNext: boolean }): void {
    const backdrop = el('div', 'modal-backdrop');
    const modal = el('div', 'modal');
    modal.appendChild(el('div', 'h2', t('win.title')));
    const stars = el('div', 'win-stars');
    for (let i = 0; i < 3; i++) {
      const s = el('span', i < stats.stars ? 'gold' : undefined, '★');
      stars.appendChild(s);
      if (i < stats.stars) {
        window.setTimeout(() => s.classList.add('earned'), 400 + i * 250);
      }
    }
    modal.appendChild(stars);
    // Расшифровка звёзд: пороги и сколько не хватило до следующей звезды.
    if (stats.starMoves && stats.movesLeft !== undefined) {
      // Уровень с целью по очкам: звёзды дают за экономию ходов.
      modal.appendChild(el('div', 'win-thresholds', t('win.thresholdsMoves', { s2: String(stats.starMoves[1]), s3: String(stats.starMoves[2]) })));
      const next = stats.stars < 3 ? stats.starMoves[stats.stars] : undefined;
      if (next !== undefined) {
        const miss = Math.max(0, next - stats.movesLeft);
        modal.appendChild(el('div', 'win-next-star', miss > 0 ? t('win.nextStarMoves', { n: String(miss), m: String(stats.stars + 1) }) : t('win.nextStarDone')));
      }
    } else if (stats.starThresholds) {
      const [s1, s2, s3] = stats.starThresholds;
      modal.appendChild(el('div', 'win-thresholds', t('win.thresholds', { s1: String(s1 ?? 0), s2: String(s2 ?? 0), s3: String(s3 ?? 0) })));
      const next = stats.stars < 3 ? stats.starThresholds[stats.stars] : undefined;
      if (next !== undefined) {
        const miss = Math.max(0, next - stats.score);
        modal.appendChild(el('div', 'win-next-star', miss > 0 ? t('win.nextStar', { n: String(miss) }) : t('win.nextStarDone')));
      }
    }
    const scoreRow = el('div', 'stat-row');
    scoreRow.appendChild(el('span', undefined, t('win.score')));
    scoreRow.appendChild(el('span', 'stat-val', String(stats.score)));
    modal.appendChild(scoreRow);
    modal.appendChild(btn('btn-primary', opts.hasNext ? t('win.next') : t('win.menu'), opts.hasNext ? opts.onNext : opts.onMenu));
    modal.appendChild(btn('btn', t('win.retry'), opts.onRetry));
    modal.appendChild(btn('btn-ghost', t('win.menu'), opts.onMenu));
    backdrop.appendChild(modal);
    this.root.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('active'));
  }

  lose(score: number, opts: { onRetry: () => void; onMenu: () => void; energy?: string; onRescue?: () => void }): void {
    const backdrop = el('div', 'modal-backdrop');
    const modal = el('div', 'modal');
    modal.appendChild(el('div', 'h2', t('lose.title')));
    if (opts.energy) modal.appendChild(el('div', 'lose-energy', opts.energy));
    const scoreRow = el('div', 'stat-row');
    scoreRow.appendChild(el('span', undefined, t('win.score')));
    scoreRow.appendChild(el('span', 'stat-val', String(score)));
    modal.appendChild(scoreRow);
    // Спасение за рекламу — главная кнопка: продолжает текущую партию.
    if (opts.onRescue) modal.appendChild(btn('btn-primary', t('lose.rescue'), opts.onRescue));
    modal.appendChild(btn(opts.onRescue ? 'btn' : 'btn-primary', t('lose.retry'), opts.onRetry));
    modal.appendChild(btn('btn-ghost', t('lose.menu'), opts.onMenu));
    backdrop.appendChild(modal);
    this.root.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('active'));
  }

  // ============ Effects ============

  /** Краткий бриф целей в начале уровня (полупрозрачная плашка сверху). */
  goalBrief(title: string, subtitle: string): void {
    const b = el('div', 'goal-brief');
    b.appendChild(el('div', 'goal-brief-title', title));
    b.appendChild(el('div', 'goal-brief-sub', subtitle));
    this.root.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));
    window.setTimeout(() => {
      b.classList.remove('show');
      window.setTimeout(() => b.remove(), 400);
    }, 2200);
  }

  comboBanner(text: string): void {
    const b = el('div', 'combo-banner', text);
    this.root.appendChild(b);
    requestAnimationFrame(() => b.classList.add('show'));
    window.setTimeout(() => b.remove(), 950);
  }

  toast(text: string): void {
    const toasts = document.getElementById('toasts');
    if (!toasts) return;
    const tEl = el('div', 'toast', text);
    toasts.appendChild(tEl);
    window.setTimeout(() => tEl.classList.add('out'), 1800);
    window.setTimeout(() => tEl.remove(), 2200);
  }

  clearAll(): void {
    this.root.querySelectorAll('.screen, .modal-backdrop, .combo-banner').forEach((n) => n.remove());
    document.getElementById('hud')?.remove();
    document.getElementById('power-bar')?.remove();
    this.current = null;
  }
}
