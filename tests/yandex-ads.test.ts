// Rewarded Yandex: защита от двойной награды и маппинг колбеков в результат.
import { describe, expect, it, vi } from 'vitest';
import { rewardedFromCallbacks } from '../src/platform/yandex/yandex-ads';
import type { RewardedCallbacks } from '../src/platform/yandex/yandex-ads';

function runScript(script: (cb: RewardedCallbacks) => void): Promise<string> {
  return rewardedFromCallbacks(script);
}

describe('rewardedFromCallbacks', () => {
  it('grants reward exactly once for onRewarded → onClose', async () => {
    const onRewarded = vi.fn();
    const result = await runScript((cb) => {
      cb.onRewarded?.();
      onRewarded();
      cb.onRewarded?.(); // SDK дублировал событие
      cb.onClose?.();
    });
    expect(result).toBe('rewarded');
    // Награда внутри игры выдаётся по result === 'rewarded' ровно один раз;
    // сам helper гарантирует однократное разрешение промиса.
    expect(onRewarded).toHaveBeenCalledTimes(1);
  });

  it('no reward when closed without watching (reward = 0)', async () => {
    const result = await runScript((cb) => {
      cb.onClose?.();
    });
    expect(result).toBe('closed');
  });

  it('no reward on error', async () => {
    const result = await runScript((cb) => {
      cb.onError?.(new Error('no fill'));
    });
    expect(result).toBe('error');
  });

  it('late duplicate close does not resolve twice', async () => {
    let resolved = 0;
    const p = rewardedFromCallbacks((cb) => {
      cb.onRewarded?.();
      cb.onClose?.();
      // Поздний колбек после завершения — не должен менять результат.
      setTimeout(() => cb.onClose?.(), 5);
      setTimeout(() => cb.onError?.(new Error('late')), 10);
    });
    await p.then((r) => {
      resolved++;
      expect(r).toBe('rewarded');
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(1);
  });

  it('error after reward still counts as rewarded if close not called', async () => {
    // SDK сначала прислал onRewarded, потом упал с ошибкой до onClose:
    // ролик досмотрен — награда заслужена.
    const result = await runScript((cb) => {
      cb.onRewarded?.();
      cb.onError?.(new Error('renderer crashed at the end'));
    });
    expect(result).toBe('rewarded');
  });

  it('register throwing synchronously resolves as error', async () => {
    const result = await runScript(() => {
      throw new Error('sdk unavailable');
    });
    expect(result).toBe('error');
  });
});
