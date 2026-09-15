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
import type { PlatformAdapter, RewardedPlacement } from '../platform/platform';
import { createPlatform } from '../platform/create-platform';
import { RepoSaveRepository } from '../platform/storage/save-repository';
import { mapLang, syncEnergy } from '../platform/storage/save-schema';
import {
  ENERGY_MAX,
  gainEnergy,
  loseEnergy,
  msToNextEnergy,
  type SaveData,
} from '../platform/storage/save-schema';
import type { SaveRepository } from '../platform/storage/save-repository';
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
  private platform: PlatformAdapter;
  private repo: SaveRepository;
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
  /** Источники остановки цикла: скрытая вкладка, платформенная пауза, реклама, pause menu. */
  private documentHidden = false;
  private platformPaused = false;
  private adShowing = false;
  private adModal: HTMLElement | null = null;
  /** Секунды бездействия игрока с момента последнего хода/касания. */
  private idleTime = 0;

  private constructor(platform: PlatformAdapter, repo: SaveRepository, save: SaveData) {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    // Dev-доступ к состоянию партии из консоли/тестов.
    (this.canvas as unknown as Record<string, unknown>)['__game'] = this;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.ui = new UI(document.getElementById('overlays')!);
    this.platform = platform;
    this.repo = repo;
    this.save = save;
    syncEnergy(this.save); // офлайн-восстановление энергии по таймстампу
    this.initAudio();
    this.bindPointer();
    this.lockGestures();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.documentHidden = document.hidden;
      this.updateRunning();
      this.lastFrame = performance.now();
      if (document.hidden) {
        suspendAudio();
        void this.repo.flush(); // уход в background — сохранить облако немедленно
      } else if (!this.platformPaused && !this.userPaused()) {
        resumeAudio();
      }
    });
    // Платформенная пауза (Yandex game_api_pause/resume). Не дублирует
    // visibilitychange: общий расчёт running в updateRunning().
    this.platform.onPause?.(() => {
      this.platformPaused = true;
      this.updateRunning();
      suspendAudio();
    });
    this.platform.onResume?.(() => {
      this.platformPaused = false;
      this.updateRunning();
      if (!this.documentHidden && !this.userPaused()) resumeAudio();
    });
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

  /** Асинхронный bootstrap: платформа уже инициализирована, сейв смержен. */
  static async create(platform: PlatformAdapter, repo: SaveRepository): Promise<Game> {
    const save = await repo.load();
    // Язык: auto — с платформы на каждом запуске; manual — выбор игрока.
    if (save.settings.langMode === 'manual') {
      setLang(save.settings.lang);
    } else {
      save.settings.lang = mapLang(platform.getLanguage());
      setLang(save.settings.lang);
    }
    return new Game(platform, repo, save);
  }

  /** Игра идёт, только когда ни один источник паузы не активен. */
  private userPaused(): boolean {
    return this.pauseModal !== null;
  }

  private updateRunning(): void {
    this.running = !this.documentHidden && !this.platformPaused && !this.adShowing && !this.userPaused();
    if (this.running) this.lastFrame = performance.now();
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

  /** persist: local сразу, cloud с debounce; critical — победа/rewarded/reset. */
  private persist(critical = false): void {
    this.repo.save(this.save, critical);
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
          this.save.settings.langMode = 'manual'; // явный выбор игрока важнее авто-языка
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
          // Полный сброс: local + cloud перезаписываются дефолтом.
          void this.repo.reset().then((fresh) => {
            this.save = fresh;
            this.save.settings.lang = mapLang(this.platform.getLanguage());
            setLang(this.save.settings.lang);
            this.showMenu();
          });
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

  /** Состояние энергии для виджетов; синхронизирует офлайн-восстановление.
   *  На платформах без energyGate виджеты энергии не создаются. */
  private energyView(): EnergyOpts | undefined {
    if (!this.platform.features.energyGate) return undefined;
    return {
      get: () => {
        syncEnergy(this.save);
        return { current: this.save.energy.current, max: ENERGY_MAX, nextInMs: msToNextEnergy(this.save) };
      },
      onAd: () => this.offerEnergyAd(),
    };
  }

  /**
   * Унифицированный rewarded flow. Награда — только при результате 'rewarded'
   * (досмотрено до конца). На платформах без рекламного SDK (browser/dev)
   * показывает подтверждение «смотреть рекламу» и выдаёт награду как тестовый
   * сценарий; в Yandex- и Telegram-production этой заглушки нет.
   */
  private async runRewarded(placement: RewardedPlacement, onReward: () => void): Promise<void> {
    if (!this.platform.features.rewardedAds) {
      this.showAdStub(() => onReward());
      return;
    }
    this.platform.gameplayStop();
    this.adShowing = true;
    this.updateRunning();
    suspendAudio();
    try {
      const result = await this.platform.showRewardedAd(placement);
      if (result === 'rewarded') {
        onReward();
        this.persist(true); // критическое событие — облако сразу
      } else if (result === 'error' || result === 'unavailable') {
        this.ui.toast(t('ad.unavailable'));
      } else {
        this.ui.toast(t('ad.skipped'));
      }
    } finally {
      this.adShowing = false;
      this.updateRunning();
      if (!this.documentHidden && !this.platformPaused && !this.userPaused()) {
        resumeAudio();
        // Уровень всё ещё активен — геймплей продолжается.
        if (this.mode && !this.pauseModal) this.platform.gameplayStart();
      }
    }
  }

  /** Dev/browser fallback: подтверждение перед «просмотром». */
  private showAdStub(onGranted: () => void): void {
    if (this.adModal) return;
    this.adModal = this.ui.adStubModal(
      '',
      () => {
        this.closeAdStub();
        onGranted();
      },
      () => this.closeAdStub(),
    );
  }

  private closeAdStub(): void {
    if (this.adModal) {
      this.ui.closeModal(this.adModal);
      this.adModal = null;
    }
  }

  /** Проверка энергии перед запуском уровня. false — показан рекламный flow;
   *  после просмотра действие повторяется автоматически. На платформах без
   *  energyGate проверка всегда проходит (требование Яндекс Игр). */
  private gateEnergy(retry: () => void): boolean {
    if (!this.platform.features.energyGate) return true;
    syncEnergy(this.save);
    if (this.save.energy.current > 0) return true;
    void this.runRewarded('energy_refill', () => {
      gainEnergy(this.save, 1);
      this.ui.tickEnergy();
      this.ui.toast(t('energy.got'));
      this.sfx?.chain();
      retry();
    });
    return false;
  }

  /** Реклама прямо из чипа энергии: +1 ⚡. */
  private offerEnergyAd(): void {
    this.playUi();
    void this.runRewarded('energy_refill', () => {
      gainEnergy(this.save, 1);
      this.ui.tickEnergy();
      this.ui.toast(t('energy.got'));
      this.sfx?.chain();
    });
  }

  /** Спасение на экране проигрыша: +5 ходов за рекламу, партия продолжается. */
  private offerRescue(n: number): void {
    this.playUi();
    void this.runRewarded('rescue_5_moves', () => {
      this.ui.clearModals(); // убрать экран проигрыша
      this.rescueUsed = true;
      // На платформах с energyGate спасение возвращает списанную энергию.
      if (this.platform.features.energyGate) gainEnergy(this.save, 1);
      const fails = this.save.levelFails[n];
      if (fails !== undefined && fails > 0) this.save.levelFails[n] = fails - 1;
      this.engine?.useExtraMoves(5);
      this.updateMovesHud();
      this.ui.tickEnergy();
      this.ui.toast(t('rescue.got'));
      this.sfx?.chain();
      this.platform.gameplayStart();
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
    // Активный геймплей начался (Yandex GameplayAPI) + кнопка «Назад» (Telegram).
    this.platform.gameplayStart();
    if (this.platform.setBackButton) this.platform.setBackButton(() => this.quitToMenu());
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
      this.doHaptic('light');
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
      this.doHaptic('medium');
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
        // Новый endless-рекорд — отправить в таблицу лидеров (если доступна).
        if (this.platform.features.leaderboard && this.platform.setLeaderboardScore) {
          this.platform.setLeaderboardScore('endless_best', this.save.endlessBest).catch(() => undefined);
        }
      }
      if (newCombo) this.save.endlessBestCombo = this.endlessCombo;
      if (newBest || newCombo) this.persist(newBest);
      if (eng.movesLeft <= 0) {
        this.sfx?.lose();
        this.doHapticNotify('error');
        this.platform.gameplayStop(); // партия завершена
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
      this.doHapticNotify('error');
      this.platform.gameplayStop(); // партия завершена (спасение может продолжить)
      const n = (this.mode as { kind: 'levels'; n: number }).n;
      // Неудача тратит энергию (только там, где energyGate) и ломает серию;
      // спасение может всё вернуть.
      if (this.platform.features.energyGate) loseEnergy(this.save, 1);
      this.save.levelFails[n] = (this.save.levelFails[n] ?? 0) + 1;
      this.save.streak = 0;
      this.persist();
      this.ui.tickEnergy();
      this.ui.lose(eng.obj.score, {
        energy: this.platform.features.energyGate
          ? t('lose.energy', { n: this.save.energy.current, max: ENERGY_MAX })
          : undefined,
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
      this.refreshPowers();
      eng.useExtraMoves(2);
      this.updateMovesHud();
      this.ui.toast(t('super.usedMoves'));
      this.sfx?.chain();
      this.doHaptic('light');
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
    const placement: RewardedPlacement =
      kind === 'bomb' ? 'super_bomb' : kind === 'lightning' ? 'super_lightning' : 'super_extra_moves';
    void this.runRewarded(placement, () => {
      this.save.powers[kind]++;
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
    this.doHaptic('medium');
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
      if (this.platform.features.energyGate) gainEnergy(this.save, 1);
      this.save.streak++;
      if (this.save.streak % STREAK_REWARD_EVERY === 0) {
        const kind: SuperKind = this.save.streak % 2 === 0 ? 'lightning' : 'bomb';
        this.save.powers[kind]++;
        this.ui.toast(t('win.streakReward', { n: this.save.streak, name: kind === 'bomb' ? '💥' : '⚡' }));
      }
      this.ui.toast(t('win.perfect'));
    }
    delete this.save.levelFails[mode.n]; // попытки сбрасываются победой
    this.persist(true); // победа/открытие уровня — критическое сохранение
    this.platform.gameplayStop(); // уровень завершён
    this.sfx?.win();
    this.doHapticNotify('success');
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
    this.platform.gameplayStop(); // пауза пользователем — геймплей остановлен
    this.updateRunning();
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
    this.updateRunning();
    // Snap any mid-flight animation to its final position so nothing drifts.
    this.board?.resnap();
    // Возврат в активную партию.
    if (this.mode) this.platform.gameplayStart();
  }

  private quitToMenu(): void {
    this.platform.gameplayStop();
    this.platform.setBackButton?.(null);
    this.showMenu();
  }

  private playUi(): void {
    this.sfx?.ui();
  }

  /** Вибрация по настройке игрока; на платформе без поддержки — no-op. */
  private doHaptic(type: 'light' | 'medium' | 'heavy'): void {
    if (!this.save.settings.haptics) return;
    this.platform.haptic?.(type);
  }

  private doHapticNotify(type: 'error' | 'success' | 'warning'): void {
    if (!this.save.settings.haptics) return;
    this.platform.hapticNotify?.(type);
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
      if (this.platform.features.energyGate && syncEnergy(this.save) > 0) this.persist();
      this.ui.tickEnergy();
    }
  }
}

// ============ Bootstrap ============
// Порядок: платформа → сейв (local+cloud merge) → Game → меню → Game Ready.
// Loading overlay скрывается только когда UI готов к взаимодействию
// (обязательное требование модерации Яндекс Игр).

const LOADING_HTML = `
  <div id="loading-screen" style="position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:14px;background:#070a18;color:#8ea2ff;
    font:600 22px/1.4 system-ui,sans-serif;letter-spacing:2px;">
    <div>NEON MATCH</div>
    <div id="loading-text" style="font-size:14px;font-weight:400;opacity:.7;letter-spacing:0"></div>
  </div>`;

function removeLoadingScreen(): void {
  document.getElementById('loading-screen')?.remove();
}

async function bootstrap(): Promise<void> {
  document.body.insertAdjacentHTML('beforeend', LOADING_HTML);
  const loadingText = document.getElementById('loading-text');
  if (loadingText) loadingText.textContent = t('common.loading');

  const platform = createPlatform(); // своя платформа; остальные вытряхнуты tree-shaking'ом
  await platform.init(); // ошибки внутри адаптера не бросаются

  const repo = new RepoSaveRepository(platform);
  const game = await Game.create(platform, repo);

  // LoadingAPI.ready() — только когда интерфейс построен и ввод доступен.
  platform.loadingReady();
  removeLoadingScreen();
  // Полноэкранный режим на мобильных (Yandex): после первого действия игрока.
  if (platform.features.interstitialAds && platform.requestFullscreen) {
    const goFullscreen = (): void => {
      platform.requestFullscreen?.();
      window.removeEventListener('pointerdown', goFullscreen);
    };
    window.addEventListener('pointerdown', goFullscreen, { once: true });
  }
  // Dev-доступ к платформе из консоли.
  (window as unknown as Record<string, unknown>)['__platform'] = platform;
  void game;
}

void bootstrap();

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
