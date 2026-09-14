// Tiny tween engine. update(dt) is called once per frame with seconds.

export type EaseFn = (t: number) => number;

const c1 = 1.70158;

export const Ease: Record<string, EaseFn> = {
  linear: (t) => t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  outElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const p = 0.3;
    return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
  },
};

export interface Tween {
  update(dt: number): boolean; // false when finished
  cancel(): void;
}

export class TweenPool {
  private list: Tween[] = [];

  add(update: (t: number) => void, dur: number, ease: EaseFn = Ease.outCubic, onDone?: () => void): Tween {
    let t = 0;
    let done = false;
    const tw: Tween = {
      update(dt: number): boolean {
        if (done) return false;
        t += dt / dur;
        if (t >= 1) {
          update(1);
          done = true;
          if (onDone) onDone();
          return false;
        }
        update(ease(t));
        return true;
      },
      cancel() {
        done = true;
      },
    };
    this.list.push(tw);
    return tw;
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (!this.list[i]!.update(dt)) this.list.splice(i, 1);
    }
  }

  clear(): void {
    this.list.length = 0;
  }

  get count(): number {
    return this.list.length;
  }
}
