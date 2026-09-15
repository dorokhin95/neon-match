// Платформенный слой: envelope, merge local/cloud, миграция v1, языки.
import { describe, expect, it } from 'vitest';
import {
  defaultSave,
  isDefaultLike,
  makeEnvelope,
  mapLang,
  mergeSaves,
  parseEnvelope,
  SCHEMA_VERSION,
  type SaveData,
} from '../src/platform/storage/save-schema';
import { TelegramPlatform } from '../src/platform/telegram/telegram-platform';
import { YandexPlatform } from '../src/platform/yandex/yandex-platform';
import { BrowserPlatform } from '../src/platform/browser/browser-platform';

function saveWith(overrides: Partial<SaveData>, now = 1_000_000): SaveData {
  return { ...defaultSave(now), ...overrides };
}

describe('SaveEnvelope', () => {
  it('wraps SaveData with schemaVersion 2', () => {
    const env = makeEnvelope(saveWith({ unlocked: 7 }), 12, 12345);
    expect(env.schemaVersion).toBe(SCHEMA_VERSION);
    expect(env.revision).toBe(12);
    expect(env.updatedAt).toBe(12345);
    expect(env.data.unlocked).toBe(7);
  });

  it('parses its own JSON output', () => {
    const env = makeEnvelope(saveWith({ endlessBest: 500 }), 3, 777);
    const parsed = parseEnvelope(JSON.stringify(env));
    expect(parsed?.data.endlessBest).toBe(500);
    expect(parsed?.revision).toBe(3);
    expect(parsed?.updatedAt).toBe(777);
  });

  it('migrates legacy v1 raw SaveData into an envelope', () => {
    // Старый формат: голый SaveData в localStorage/облаке (без data/schemaVersion).
    const legacy = JSON.stringify(saveWith({ unlocked: 5, endlessBest: 12300 }));
    const parsed = parseEnvelope(legacy, /* now */ 42);
    expect(parsed).not.toBeNull();
    expect(parsed?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed?.data.unlocked).toBe(5);
    expect(parsed?.data.endlessBest).toBe(12300);
    expect(parsed?.revision).toBe(0);
  });

  it('returns null for corrupted JSON', () => {
    expect(parseEnvelope('{oops')).toBeNull();
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope('')).toBeNull();
  });
});

describe('mergeSaves', () => {
  it('uses local when cloud is missing', () => {
    const local = makeEnvelope(saveWith({ unlocked: 9 }), 1, 2000);
    const { data, winner } = mergeSaves({ local, cloud: null });
    expect(winner).toBe('local');
    expect(data.unlocked).toBe(9);
  });

  it('uses cloud when local is missing', () => {
    const cloud = makeEnvelope(saveWith({ unlocked: 4 }), 1, 1000);
    const { data, winner } = mergeSaves({ local: null, cloud });
    expect(winner).toBe('cloud');
    expect(data.unlocked).toBe(4);
  });

  it('prefers the newest updatedAt', () => {
    const local = makeEnvelope(saveWith({ unlocked: 3 }), 1, 2000);
    const cloud = makeEnvelope(saveWith({ unlocked: 8 }), 1, 5000);
    const { data, winner } = mergeSaves({ local, cloud });
    expect(winner).toBe('cloud');
    expect(data.unlocked).toBe(8);
  });

  it('prefers cloud on equal updatedAt', () => {
    const local = makeEnvelope(saveWith({ unlocked: 3 }), 1, 2000);
    const cloud = makeEnvelope(saveWith({ unlocked: 8 }), 1, 2000);
    expect(mergeSaves({ local, cloud }).winner).toBe('both-equal');
  });

  it('never lets an empty cloud save erase played local progress', () => {
    // Сценарий: игрок играл локально гостем, вошёл в аккаунт с пустым облаком.
    const local = makeEnvelope(saveWith({ unlocked: 20, levels: { 1: { stars: 3, best: 999 } } }), 1, 1000);
    const cloud = makeEnvelope(defaultSave(500), 1, 9000); // поздний, но пустой
    const { data, winner } = mergeSaves({ local, cloud });
    expect(winner).toBe('local');
    expect(data.unlocked).toBe(20);
  });

  it('never lets an empty local save erase cloud progress', () => {
    // Сценарий: новый браузер + богатое облако.
    const local = makeEnvelope(defaultSave(500), 1, 9000);
    const cloud = makeEnvelope(saveWith({ unlocked: 15 }), 1, 1000);
    const { data, winner } = mergeSaves({ local, cloud });
    expect(winner).toBe('cloud');
    expect(data.unlocked).toBe(15);
  });
});

describe('isDefaultLike', () => {
  it('detects untouched saves', () => {
    expect(isDefaultLike(defaultSave())).toBe(true);
    expect(isDefaultLike(saveWith({ unlocked: 2 }))).toBe(false);
    expect(isDefaultLike(saveWith({ endlessBest: 10 }))).toBe(false);
  });
});

describe('mapLang', () => {
  it('maps ru* to ru and everything else to en', () => {
    expect(mapLang('ru')).toBe('ru');
    expect(mapLang('ru-RU')).toBe('ru');
    expect(mapLang('en')).toBe('en');
    expect(mapLang('tr')).toBe('en');
    expect(mapLang('de-DE')).toBe('en');
    expect(mapLang(undefined)).toBe('en');
    expect(mapLang('')).toBe('en');
  });
});

describe('platform features', () => {
  it('telegram: energy gate on, rewarded on, no leaderboards', () => {
    const f = new TelegramPlatform().features;
    expect(f.energyGate).toBe(true);
    expect(f.rewardedAds).toBe(true);
    expect(f.leaderboard).toBe(false);
    expect(f.cloudSave).toBe(true);
  });

  it('yandex: energy gate OFF (moderation requirement), leaderboards on', () => {
    const f = new YandexPlatform().features;
    expect(f.energyGate).toBe(false);
    expect(f.rewardedAds).toBe(true);
    expect(f.leaderboard).toBe(true);
    expect(f.stats).toBe(true);
  });

  it('browser: no ads, no cloud, energy gate on', () => {
    const f = new BrowserPlatform().features;
    expect(f.rewardedAds).toBe(false);
    expect(f.cloudSave).toBe(false);
    expect(f.energyGate).toBe(true);
  });
});
