// App entry point. Owns the state machine and glues engine/renderer/audio/UI.

import './style-import';
import { Rng, hashSeed } from '../core/rng';
import { Engine, findHint } from '../core/engine';
import { getLevel, TOTAL_LEVELS } from '../core/levels';
import type { LevelDef, Pos } from '../core/types';
import { Power as P } from '../core/types';
import { Background } from '../render/background';
import { Board } from '../render/board';
import { Particles } from '../render/particles';
import { getAudio, resumeAudio, suspendAudio } from '../audio/ctx';
import { Sfx } from '../audio/sfx';
import { Music } from '../audio/music';
import { initTelegram, haptic, hapticNotify, isTelegram, type TelegramAPI } from '../platform/telegram';
import { isAdsAvailable, showRewardedAd } from '../platform/ads';
import {
  defaultSave,
  detectLang,
  loadSave,
  saveSave,
  syncEnergy,
  gainEnergy,
  loseEnergy,
  msToNextEnergy,
  ENERGY_MAX,
  type SaveData,
} from '../platform/storage';
import { starsFor, starsForMoves } from '../core/scoring';
import { UI, type EnergyOpts, type SuperKind } from './ui';
import { setLang, t } from './i18n';

type Mode = { kind: 'levels'; n: number } | { kind: 'endless' };

/** Сколько секунд игрок должен бездействовать, прежде чем появится подсказка. */
const HINT_DELAY_S = 5;

/** Каждая N-я победа подряд с первой попытки даёт заряд суперспособности. */
const STREAK_REWARD_EVERY = 3;

class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg = new Background();
  private particles = new Particles();
  private board: Board | null = null;
  private ui: UI;
  private tg: TelegramAPI | null;
  private save: SaveData;
  private sfx: Sfx | null = null;
  private music: Music | null = null;
  private engine: Engine | null = null;
  private level: LevelDef | null = null;
  private mode: Mode | null = null;
  private hudHandles: ReturnType<UI['buildHud']> | null = null;
  private powerBar: ReturnType<UI['buildPowerBar']> | null = null;
  /** Активированная суперспособность, ожидающая выбора клетки на поле. */
  private armedSuper: Exclude<SuperKind, 'extraMoves'> | null = null;
  private pauseModal: HTMLElement | null = null;
  private endlessCombo = 0;
  private endlessRecordShown = false;
  /** Было ли в этой партии спасение за рекламу (лишает бонуса «с первой попытки»). */
  private rescueUsed = false;
  /** Показана ли подсказка «мало ходов» в этой партии. */
  private nudgeShown = false;
  /** Аккумулятор секундного тика таймера энергии. */
  private energyClock = 0;
  private lastFrame = performance.now();
  private running = true;
  private backBtnCb: (() => void) | null = null;
  /** Секунды бездействия игрока с момента последнего хода/касания. */
  private idleTime = 0;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    // Dev-доступ к состоянию партии из консоли/тестов.
    (this.canvas as unknown as Record<string, unknown>)['__game'] = this;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.ui = new UI(document.getElementById('overlays')!);
    this.tg = initTelegram();
    this.save = loadSave(this.tg);
    syncEnergy(this.save); // офлайн-восстановление энергии по таймстампу
    if (!localStorage.getItem('neon-match-initialized')) {
      this.save.settings.lang = detectLang(this.tg?.initDataUnsafe?.user?.language_code);
      localStorage.setItem('neon-match-initialized', '1');
      this.persist();
    }
    setLang(this.save.settings.lang);
    this.initAudio();
    this.bindPointer();
    this.lockGestures();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.running = !document.hidden;
      this.lastFrame = performance.now();
      if (document.hidden) suspendAudio();
      else resumeAudio();
    });
    if (isTelegram() && this.tg?.onEvent) {
      this.tg.onEvent('backButtonClicked', () => this.backBtnCb?.());
    }
    // Dev-хук: превращение гема в бонус из консоли/тестов.
    window.addEventListener('neon-set-power', ((e: Event) => {
      const { r, c, power } = (e as CustomEvent<{ r: number; c: number; power: number }>).detail;
      const gem = this.engine?.grid[r]?.[c];
      if (gem && this.board) {
        gem.power = power;
        const v = this.board['visuals']?.get(gem.id);
        if (v) v.power = power;
      }
    }) as EventListener);
    this.resize();
    this.showMenu();
    requestAnimationFrame((ts) => this.frame(ts));
  }

  // ============ Audio ============

  private initAudio(): void {
    const a = getAudio();
    if (!a) return;
    this.sfx = new Sfx(a.ctx, a.sfx);
    this.music = new Music(a.ctx, a.music);
    this.applyVolumes();
    const kick = () => {
      resumeAudio();
      if (this.music) this.music.start();
      window.removeEventListener('pointerdown', kick);
    };
    window.addEventListener('pointerdown', kick, { once: false });
    window.addEventListener('keydown', kick);
  }

  private applyVolumes(): void {
    const a = getAudio();
    if (!a) return;
    a.music.gain.value = this.save.settings.music;
    a.sfx.gain.value = this.save.settings.sfx;
    this.sfx?.setEnabled(this.save.settings.sfx > 0);
  }

  private persist(): void {
    saveSave(this.save, this.tg);
  }

  // ============ Layout ============

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bg.resize(w, h);
    this.layoutBoard();
  }

  private layoutBoard(): void {
    if (!this.board || !this.level) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rows = this.level.rows;
    const cols = this.level.cols;
    const availW = Math.min(w, 430) - 32;
    const availH = h - 190;
    const cell = Math.floor(Math.min(availW / cols, availH / rows));
    const bw = cell * cols;
    const x = (w - bw) / 2;
    const y = Math.min(h - 24 - cell * rows, 150 + Math.max(0, (h - cell * rows - 220) / 3));
    this.board.setMetrics({ x, y, cell });
  }

  // ============ Input ============

  private bindPointer(): void {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (e) => {
      this.resetIdle();
      this.board?.pointerDown(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e) => {
      this.board?.pointerMove(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', () => this.board?.pointerUp());
    // Страховка для старых вебвью: жест по канвасу не должен превращаться
    // в прокрутку или pull-to-refresh (основная защита — touch-action: none).
    canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /** Свайпы не должны уводить из игры. Горизонтальный «назад» ловим буферной
   *  записью истории: popstate тут же восстанавливает её, страница не выгружается. */
  private lockGestures(): void {
    try {
      history.pushState({ neon: true }, '');
      window.addEventListener('popstate', () => history.pushState({ neon: true }, ''));
    } catch {
      // sandboxed iframe и т.п. — жесты остаются на совести контейнера
    }
    // Запрет pinch-zoom на iOS (страховка к user-scalable=no).
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  // ============ Screens ============

  private showMenu(): void {
    this.engine = null;
    this.level = null;
    this.board = null;
    this.hudHandles = null;
    this.ui.clearAll();
    this.ui.mainMenu({
      best: this.save.endlessBest,
      bestCombo: this.save.endlessBestCombo,
      nextLevel: Math.min(this.save.unlocked, TOTAL_LEVELS),
      energy: this.energyView(),
      onPlay: () => {
        this.playUi();
        this.showLevels();
      },
      onContinue: () => {
        this.playUi();
        this.startLevel(Math.min(this.save.unlocked, TOTAL_LEVELS));
      },
      onEndless: () => {
        this.playUi();
        this.startEndless();
      },
      onSettings: () => this.showSettings(() => this.showMenu()),
      onHowto: () => this.ui.howto(() => this.showMenu()),
    });
  }

  private showLevels(): void {
    this.ui.levelSelect({
      unlocked: this.save.unlocked,
      starsOf: (n) => this.save.levels[n]?.stars ?? 0,
      energy: this.energyView(),
      onBack: () => this.showMenu(),
      onPick: (n) => {
        this.playUi();
        this.startLevel(n);
      },
    });
  }

  private showSettings(onBack: () => void): void {
    const hud = document.getElementById('hud');
    hud?.classList.add('hidden');
    this.ui.settings({
      get: () => this.save.settings,
      set: (s) => {
        if (s.music !== undefined) this.save.settings.music = s.music;
        if (s.sfx !== undefined) this.save.settings.sfx = s.sfx;
        if (s.haptics !== undefined) this.save.settings.haptics = s.haptics;
        if (s.lang !== undefined) {
          this.save.settings.lang = s.lang;
          setLang(s.lang);
          this.refreshScreen();
        }
        this.applyVolumes();
        this.persist();
      },
      onBack: () => {
        hud?.classList.remove('hidden');
        onBack();
      },
      onReset: () => {
        this.ui.confirm(t('settings.resetConfirm'), t('settings.yes'), t('settings.no'), () => {
          this.save = defaultSave();
          this.persist();
          setLang(this.save.settings.lang);
          this.showMenu();
        });
      },
    });
  }

  private refreshScreen(): void {
    // Rebuild the current screen in place when language changes.
    const hasHud = document.getElementById('hud') !== null;
    if (this.mode && hasHud) {
      const m = this.mode;
      if (m.kind === 'endless') this.startEndless();
      else this.startLevel(m.n);
    } else {
      this.showMenu();
    }
  }

  // ============ Game flow ============

  /**
   * Показ rewarded-рекламы с наградой. В Telegram показывает ролик AdsGram
   * (награда — только если досмотрено до конца); в обычном браузере SDK
   * недоступен, поэтому остаётся прежняя модалка-заглушка.
   */
  private runAdFlow(
    rewardName: string,
    onGranted: () => void,
    title?: string,
    subtitle?: string,
  ): void {
    if (isTelegram() && isAdsAvailable()) {
      void showRewardedAd().then((watched) => {
        if (watched) onGranted();
        else this.ui.toast(t('ad.skipped'));
      });
      return;
    }
    const backdrop = this.ui.adStubModal(
      rewardName,
      () => {
        this.ui.closeModal(backdrop);
        onGranted();
      },
      () => this.ui.closeModal(backdrop),
      title,
      subtitle,
    );
  }

  /** Состояние энергии для виджетов; синхронизирует офлайн-восстановление. */
  private energyView(): EnergyOpts {
    return {
      get: () => {
        syncEnergy(this.save);
        return { current: this.save.energy.current, max: ENERGY_MAX, nextInMs: msToNextEnergy(this.save) };
      },
      onAd: () => this.offerEnergyAd(),
    };
  }

  /** Проверка энергии перед запуском уровня. false — показана модалка
   *  «энергия кончилась» с предложением рекламы; после просмотра
   *  действие повторяется автоматически. */
  private gateEnergy(retry: () => void): boolean {
    syncEnergy(this.save);
    if (this.save.energy.current > 0) return true;
    this.runAdFlow(
      t('energy.adName'),
      () => {
        gainEnergy(this.save, 1);
        this.persist();
        this.ui.tickEnergy();
        this.ui.toast(t('energy.got'));
        this.sfx?.chain();
        retry();
      },
      t('energy.empty.title'),
      t('energy.hint'),
    );
    return false;
  }

  /** Реклама прямо из чипа энергии: +1 ⚡. */
  private offerEnergyAd(): void {
    this.playUi();
    this.runAdFlow(t('energy.adName'), () => {
      gainEnergy(this.save, 1);
      this.persist();
      this.ui.tickEnergy();
      this.ui.toast(t('energy.got'));
      this.sfx?.chain();
    });
  }

  /** Спасение на экране проигрыша: +5 ходов за рекламу, партия продолжается. */
  private offerRescue(n: number): void {
    this.playUi();
    this.runAdFlow(t('rescue.adName'), () => {
      this.ui.clearModals(); // убрать экран проигрыша
      this.rescueUsed = true;
      gainEnergy(this.save, 1); // спасение возвращает только что списанную энергию
      const fails = this.save.levelFails[n];
      if (fails !== undefined && fails > 0) this.save.levelFails[n] = fails - 1;
      this.engine?.useExtraMoves(5);
      this.updateMovesHud();
      this.persist();
      this.ui.tickEnergy();
      this.ui.toast(t('rescue.got'));
      this.sfx?.chain();
    });
  }

  private startLevel(n: number): void {
    this.endlessCombo = 0;
    if (!this.gateEnergy(() => this.startLevel(n))) return;
    const level = getLevel(n);
    this.beginRound({ kind: 'levels', n }, level);
  }

  private startEndless(): void {
    this.endlessCombo = 0;
    this.endlessRecordShown = false;
    const level = this.makeEndlessLevel();
    this.beginRound({ kind: 'endless' }, level);
  }

  private makeEndlessLevel(): LevelDef {
    return {
      n: 0,
      rows: 8,
      cols: 8,
      colors: 6,
      moves: 30,
      goals: [{ kind: 'score', amount: 1e9 }],
      stars: [1, 2, 3],
    };
  }

  private beginRound(mode: Mode, level: LevelDef): void {
    this.mode = mode;
    this.level = level;
    this.rescueUsed = false;
    this.nudgeShown = false;
    // Фон: у каждого уровня своя тема, бесконечный режим — «живой» космос.
    if (mode.kind === 'endless') this.bg.setEndless();
    else this.bg.setThemeForLevel(level.n);
    this.ui.clearAll();
    this.engine = new Engine(level, new Rng(hashSeed(level.n, mode.kind === 'endless' ? Date.now() & 0xffff : 0)));
    this.board = new Board(this.engine, this.particles);
    this.board.onSwap = (a, b) => this.trySwap(a, b);
    this.board.onSuper = (kind, pos) => this.fireSuper(kind, pos);
    this.board.onPowerFx = (fx) => {
      if (fx === 'bomb' || fx === 'wipe') this.sfx?.boom();
      else if (fx === 'rows' || fx === 'cols' || fx === 'rows2' || fx === 'cols2') this.sfx?.blast();
      else if (fx === 'prism') this.sfx?.prism();
      else if (fx === 'chainBreak') this.sfx?.chain();
    };
    this.layoutBoard();
    this.resetIdle();
    this.hudHandles = this.ui.buildHud(level);
    this.hudHandles.root.querySelector('#btn-pause')?.addEventListener('click', () => this.pause());
    document.getElementById('overlays')!.appendChild(this.hudHandles.root);
    // Панель суперспособностей внизу: работает и в уровнях, и в бесконечном режиме.
    document.getElementById('power-bar')?.remove();
    this.armedSuper = null;
    this.powerBar = this.ui.buildPowerBar({
      counts: this.save.powers,
      onUse: (kind) => this.onSuperTap(kind),
      onGet: (kind) => this.offerSuperAd(kind),
    });
    document.getElementById('overlays')!.appendChild(this.powerBar.root);
    this.updateMovesHud();
    if (isTelegram()) this.setBack(() => this.quitToMenu());
    // Первая подсказка про бонус: один раз, при первом появлении бонуса на поле.
    if (!this.save.powerTipShown && this.engine.grid.flat().some((g) => g && g.power !== P.None)) {
      this.save.powerTipShown = true;
      this.persist();
      window.setTimeout(() => this.ui.toast(t('game.powerFirst')), 900);
    }
    // Краткий бриф целей в начале уровня.
    if (mode.kind === 'levels') {
      const brief = level.goals.map((g) => this.goalBrief(g)).join('   ·   ');
      const fails = this.save.levelFails[level.n] ?? 0;
      const attempt = fails > 0 ? ` · ${t('game.attempt', { n: fails + 1 })}` : '';
      this.ui.goalBrief(t('game.goal'), `${t('common.level', { n: level.n })} — ${brief}${attempt}`);
      // Сразу показать стартовый прогресс (обычно 0, но цели могут начинаться не с нуля).
      level.goals.forEach((g, i) => this.hudHandles!.updateGoal(i, 0, g.amount));
    }
  }

  /** Человекочитаемое описание цели для брифа. */
  private goalBrief(g: LevelDef['goals'][number]): string {
    if (g.kind === 'score') return `🏆 ${t('game.goalScore', { n: (g.amount / 1000).toFixed(g.amount % 1000 === 0 ? 0 : 1) + 'k' })}`;
    if (g.kind === 'ice') return `❄ ${t('game.goalIce', { n: g.amount })}`;
    if (g.gem !== undefined) return `● ${t('game.goalCollect', { n: g.amount })}`;
    return '';
  }



  /** Любая активность игрока прячет подсказку и сбрасывает таймер простоя. */
  private resetIdle(): void {
    this.idleTime = 0;
    if (this.board) this.board.hintPair = null;
  }

  trySwap(a: Pos, b: Pos): void {
    this.resetIdle();
    const eng = this.engine;
    const board = this.board;
    if (!eng || !board || board.busy) return;
    const result = eng.tryMove(a, b);
    if (!result.valid) {
      this.sfx?.invalid();
      haptic(this.tg, this.save.settings.haptics, 'light');
      void board.playSteps(result.steps);
      return;
    }
    this.sfx?.swap();
    void this.runRound(result);
  }

  private async runRound(result: ReturnType<Engine['tryMove']>): Promise<void> {
    const eng = this.engine;
    const board = this.board;
    const level = this.level;
    const hud = this.hudHandles;
    if (!eng || !board || !level || !hud) return;

    await board.playSteps(result.steps);

    // Audio/haptics driven by what happened
    if (result.maxCascade >= 2) {
      this.sfx?.combo(result.maxCascade);
      haptic(this.tg, this.save.settings.haptics, 'medium');
      const key = `game.combo${Math.min(5, result.maxCascade - 1)}`;
      this.ui.comboBanner(t(key));
    }
    if (result.maxCascade >= 3) board.shake(6);

    hud.score.textContent = String(eng.obj.score);
    this.updateMovesHud();
    if (this.mode?.kind !== 'endless') {
      level.goals.forEach((g, i) => {
        hud.updateGoal(i, this.goalCurrent(g), g.amount);
      });
    }

    if (this.mode?.kind === 'endless') {
      this.endlessCombo = Math.max(this.endlessCombo, result.maxCascade);
      // Серия каскадов продлевает партию: +2 хода.
      if (result.maxCascade >= 2) {
        eng.useExtraMoves(2);
        this.ui.toast(t('endless.movesAdded', { n: 2 }));
      }
      this.updateMovesHud();
      const newBest = eng.obj.score > this.save.endlessBest;
      const newCombo = this.endlessCombo > this.save.endlessBestCombo;
      if (newBest) {
        this.save.endlessBest = eng.obj.score;
        if (!this.endlessRecordShown) {
          this.endlessRecordShown = true;
          this.ui.toast(t('endless.newRecord'));
        }
      }
      if (newCombo) this.save.endlessBestCombo = this.endlessCombo;
      if (newBest || newCombo) this.persist();
      if (eng.movesLeft <= 0) {
        this.sfx?.lose();
        hapticNotify(this.tg, this.save.settings.haptics, 'error');
        this.ui.lose(eng.obj.score, {
          onRetry: () => {
            this.ui.clearModals();
            this.startEndless();
          },
          onMenu: () => {
            this.ui.clearModals();
            this.quitToMenu();
          },
        });
      }
      return;
    }

    // Level mode
    if (eng.checkGoals()) {
      this.onWin();
      return;
    }
    if (eng.movesLeft <= 0) {
      this.sfx?.lose();
      hapticNotify(this.tg, this.save.settings.haptics, 'error');
      const n = (this.mode as { kind: 'levels'; n: number }).n;
      // Неудача тратит энергию и ломает серию; спасение может всё вернуть.
      loseEnergy(this.save, 1);
      this.save.levelFails[n] = (this.save.levelFails[n] ?? 0) + 1;
      this.save.streak = 0;
      this.persist();
      this.ui.tickEnergy();
      this.ui.lose(eng.obj.score, {
        energy: t('lose.energy', { n: this.save.energy.current, max: ENERGY_MAX }),
        onRescue: this.rescueUsed ? undefined : () => this.offerRescue(n),
        onRetry: () => {
          this.ui.clearModals();
          this.startLevel(n);
        },
        onMenu: () => {
          this.ui.clearModals();
          this.quitToMenu();
        },
      });
    } else {
      this.sfx?.tick();
      // Подсказка: ходов мало — пора тратить накопленные способности.
      if (eng.movesLeft <= 3 && !this.nudgeShown) {
        const p = this.save.powers;
        if (p.bomb > 0 || p.lightning > 0 || p.extraMoves > 0) {
          this.nudgeShown = true;
          this.ui.toast(t('game.lowMoves'));
        }
      }
    }
  }

  /** Текущее значение прогресса цели (без форматирования — это делает HUD). */
  private goalCurrent(g: LevelDef['goals'][number]): number {
    const eng = this.engine!;
    if (g.kind === 'score') return Math.min(eng.obj.score, g.amount);
    if (g.kind === 'ice') return eng.obj.ice;
    if (g.gem !== undefined) return eng.obj.collected[g.gem] ?? 0;
    return 0;
  }

  // ============ Суперспособности (заряды за рекламу) ============

  private refreshPowers(): void {
    this.powerBar?.refresh(this.save.powers);
  }

  private onSuperTap(kind: SuperKind): void {
    const eng = this.engine;
    const board = this.board;
    if (!eng || !board || board.busy || this.pauseModal) return;
    this.playUi();
    if (kind === 'extraMoves') {
      // Мгновенный эффект, выбор клетки не нужен.
      if (this.save.powers.extraMoves <= 0) return this.offerSuperAd('extraMoves');
      this.save.powers.extraMoves--;
      this.persist();
      const res = eng.useExtraMoves(2);
      this.updateMovesHud();
      this.ui.toast(t('super.usedMoves'));
      this.sfx?.chain();
      haptic(this.tg, this.save.settings.haptics, 'light');
      void res;
      return;
    }
    if (this.save.powers[kind] <= 0) return this.offerSuperAd(kind);
    // Вкл/выкл режима выбора клетки.
    if (this.armedSuper === kind) {
      this.armedSuper = null;
      board.armedSuper = null;
      this.powerBar?.refresh(this.save.powers);
      return;
    }
    this.armedSuper = kind;
    board.armedSuper = kind;
    this.ui.toast(t('super.selectCell', { name: kind === 'bomb' ? '💥' : '⚡' }));
    this.powerBar?.refresh(this.save.powers);
  }

  private offerSuperAd(kind: SuperKind): void {
    this.playUi();
    const names: Record<SuperKind, string> = {
      bomb: t('super.bomb'),
      lightning: t('super.lightning'),
      extraMoves: t('super.extraMoves'),
    };
    this.runAdFlow(names[kind], () => {
      this.save.powers[kind]++;
      this.persist();
      this.refreshPowers();
      this.ui.toast(t('super.got', { name: kind === 'bomb' ? '💥' : kind === 'lightning' ? '⚡' : '+2' }));
      this.sfx?.chain();
    });
  }

  /** Применение суперспособности к выбранной клетке (вызывается доской). */
  private fireSuper(kind: Exclude<SuperKind, 'extraMoves'>, pos: Pos): void {
    const eng = this.engine;
    const board = this.board;
    if (!eng || !board || board.busy) return;
    if (this.save.powers[kind] <= 0) {
      this.armedSuper = null;
      board.armedSuper = null;
      return;
    }
    this.save.powers[kind]--;
    this.persist();
    this.armedSuper = null;
    board.armedSuper = null;
    this.refreshPowers();
    this.resetIdle();
    const result = kind === 'bomb' ? eng.useSuperBomb(pos) : eng.useSuperLightning(pos);
    this.sfx?.blast();
    haptic(this.tg, this.save.settings.haptics, 'medium');
    void this.runRound(result);
  }

  private updateMovesHud(): void {
    const hud = this.hudHandles;
    if (!hud) return;
    hud.moves.textContent = String(this.engine?.movesLeft ?? 0);
  }

  private onWin(): void {
    const eng = this.engine!;
    const mode = this.mode;
    if (!mode || mode.kind !== 'levels') return;
    // Уровни с целью по очкам оцениваются экономией ходов: звёзды за очки
    // дублировали бы условие победы. На остальных минимум ★1 за прохождение.
    // Запас считается от исходного лимита: «+2 хода» звёзды не накручивают.
    const spare = eng.level.moves - eng.movesSpent;
    const stars = eng.level.starsMoves
      ? starsForMoves(spare, eng.level.starsMoves)
      : Math.max(1, starsFor(eng.obj.score, eng.level.stars));
    const rec = this.save.levels[mode.n];
    const best = Math.max(rec?.best ?? 0, eng.obj.score);
    this.save.levels[mode.n] = { stars: Math.max(rec?.stars ?? 0, stars), best };
    if (mode.n >= this.save.unlocked && mode.n < TOTAL_LEVELS) {
      this.save.unlocked = mode.n + 1;
    }
    // Победа с первой попытки (без провалов и спасений): +1 ⚡ и серия.
    const fails = this.save.levelFails[mode.n] ?? 0;
    if (fails === 0 && !this.rescueUsed) {
      gainEnergy(this.save, 1);
      this.save.streak++;
      if (this.save.streak % STREAK_REWARD_EVERY === 0) {
        const kind: SuperKind = this.save.streak % 2 === 0 ? 'lightning' : 'bomb';
        this.save.powers[kind]++;
        this.ui.toast(t('win.streakReward', { n: this.save.streak, name: kind === 'bomb' ? '💥' : '⚡' }));
      }
      this.ui.toast(t('win.perfect'));
    }
    delete this.save.levelFails[mode.n]; // попытки сбрасываются победой
    this.persist();
    this.sfx?.win();
    hapticNotify(this.tg, this.save.settings.haptics, 'success');
    const hasNext = mode.n < TOTAL_LEVELS;
    this.ui.win({
      score: eng.obj.score,
      stars,
      bestCascade: 0,
      starThresholds: eng.level.stars,
      starMoves: eng.level.starsMoves,
      movesLeft: Math.max(0, spare),
    }, {
      hasNext,
      onNext: () => {
        this.ui.clearModals();
        this.startLevel(mode.n + 1);
      },
      onRetry: () => {
        this.ui.clearModals();
        this.startLevel(mode.n);
      },
      onMenu: () => {
        this.ui.clearModals();
        this.quitToMenu();
      },
    });
  }



  private pause(): void {
    if (this.pauseModal) return;
    this.playUi();
    this.pauseModal = this.ui.pause({
      onResume: () => this.resume(),
      onRestart: () => {
        this.resume();
        const m = this.mode;
        if (m?.kind === 'levels') this.startLevel(m.n);
        else this.startEndless();
      },
      onSettings: () => {
        // Settings over the paused game; back returns to the same pause.
        this.resume();
        this.showSettings(() => this.pause());
      },
      onQuit: () => {
        this.resume();
        this.quitToMenu();
      },
    });
  }

  private resume(): void {
    if (this.pauseModal) {
      this.ui.closeModal(this.pauseModal);
      this.pauseModal = null;
    }
    // Snap any mid-flight animation to its final position so nothing drifts.
    this.board?.resnap();
  }

  private quitToMenu(): void {
    this.setBack(null);
    this.showMenu();
  }

  private setBack(cb: (() => void) | null): void {
    this.backBtnCb = cb;
    const bb = this.tg?.BackButton;
    if (!bb) return;
    try {
      if (cb) bb.show();
      else bb.hide();
    } catch {
      // ignore
    }
  }

  private playUi(): void {
    this.sfx?.ui();
  }

  // ============ Frame loop ============

  private frame(ts: number): void {
    requestAnimationFrame((t2) => this.frame(t2));
    if (!this.running) return;
    const dt = Math.min(0.05, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    this.bg.update(dt);
    this.bg.draw(this.ctx);
    if (this.board && this.engine) {
      this.board.update(dt);
      if (!this.board.busy && !this.pauseModal) {
        // Подсказка появляется не сразу, а только после долгого простоя.
        this.idleTime += dt;
        if (this.idleTime >= HINT_DELAY_S && !this.board.hintPair) {
          this.board.hintPair = findHint(this.engine);
        }
      } else {
        this.resetIdle();
      }
      this.board.draw(this.ctx);
    }
    this.particles.update(dt);
    if (!this.board || !this.engine) this.particles.draw(this.ctx, window.innerWidth);
    // Секундный тик: офлайн-восстановление энергии и таймеры на экранах.
    this.energyClock += dt;
    if (this.energyClock >= 1) {
      this.energyClock = 0;
      if (syncEnergy(this.save) > 0) this.persist();
      this.ui.tickEnergy();
    }
  }
}

new Game();

// Dev-хук для отладки: превратить произвольный гем в бонус (только в dev-сборке).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__neon = {
    makePower(r: number, c: number, power: number): boolean {
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return false;
      const ev = new CustomEvent('neon-make-power', { detail: { r, c, power } });
      canvas.dispatchEvent(ev);
      return true;
    },
    /** Для тестов: состояние активной партии. */
    get game(): unknown {
      return (document.getElementById('game-canvas') as unknown as Record<string, unknown> | null)?.['__game'] ?? null;
    },
  };
  document.getElementById('game-canvas')?.addEventListener('neon-make-power', ((e: Event) => {
    const { r, c, power } = (e as CustomEvent<{ r: number; c: number; power: number }>).detail;
    window.dispatchEvent(new CustomEvent('neon-set-power', { detail: { r, c, power } }));
  }) as EventListener);
}
