// Математика энергии: восстановление по таймстампу, списание, капы.
import { describe, expect, it } from 'vitest';
import {
  defaultSave,
  ENERGY_MAX,
  ENERGY_REFILL_MS,
  gainEnergy,
  loseEnergy,
  msToNextEnergy,
  normalize,
  syncEnergy,
  type SaveData,
} from '../src/platform/storage';

function saveWith(current: number, updatedAt: number): SaveData {
  const s = defaultSave();
  s.energy = { current, updatedAt };
  return s;
}

describe('energy', () => {
  it('refills one unit per 3 hours, accumulating offline time', () => {
    const t0 = 1_000_000;
    const s = saveWith(2, t0);
    // Прошло 2 часа — восстановления ещё нет.
    expect(syncEnergy(s, t0 + 2 * ENERGY_REFILL_MS / 3)).toBe(0);
    expect(s.energy.current).toBe(2);
    // Прошло 3 часа — ровно +1.
    expect(syncEnergy(s, t0 + ENERGY_REFILL_MS)).toBe(1);
    expect(s.energy.current).toBe(3);
    // Прошло ещё 6 часов — +2 сразу (офлайн-накопление).
    expect(syncEnergy(s, t0 + 3 * ENERGY_REFILL_MS)).toBe(2);
    expect(s.energy.current).toBe(5);
  });

  it('caps at max and reports zero while full', () => {
    const t0 = 1_000_000;
    const s = saveWith(4, t0);
    expect(syncEnergy(s, t0 + 10 * ENERGY_REFILL_MS)).toBe(1);
    expect(s.energy.current).toBe(ENERGY_MAX);
    expect(syncEnergy(s, t0 + 100 * ENERGY_REFILL_MS)).toBe(0);
    expect(msToNextEnergy(s)).toBe(0);
  });

  it('losing energy starts the refill timer only from full', () => {
    const t0 = 1_000_000;
    // Полная энергия: списание запускает таймер.
    const a = saveWith(ENERGY_MAX, t0);
    loseEnergy(a, 1, t0);
    expect(a.energy.current).toBe(ENERGY_MAX - 1);
    expect(msToNextEnergy(a, t0 + 1000)).toBe(ENERGY_REFILL_MS - 1000);
    // Уже неполная: таймер продолжает тикать с прежней точки.
    const b = saveWith(2, t0);
    loseEnergy(b, 1, t0);
    expect(b.energy.current).toBe(1);
    expect(msToNextEnergy(b, t0 + 1000)).toBe(ENERGY_REFILL_MS - 1000);
  });

  it('gaining energy caps at max', () => {
    const s = saveWith(4, 1);
    gainEnergy(s, 3);
    expect(s.energy.current).toBe(ENERGY_MAX);
  });

  it('clock skew does not grant energy', () => {
    const t0 = 1_000_000;
    const s = saveWith(1, t0);
    expect(syncEnergy(s, t0 - 999)).toBe(0);
    expect(s.energy.current).toBe(1);
  });

  it('old saves without energy get a full tank', () => {
    const migrated = normalize({ unlocked: 3 });
    expect(migrated.energy.current).toBe(ENERGY_MAX);
    expect(migrated.streak).toBe(0);
    expect(migrated.levelFails).toEqual({});
  });
});
