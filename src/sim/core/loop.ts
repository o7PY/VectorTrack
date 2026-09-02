/**
 * Fixed-timestep accumulator (SPEC 3.2). Pure TS — the caller supplies real
 * elapsed time each frame (e.g. from requestAnimationFrame) and this decides
 * how many fixed `dt` ticks to run, decoupling sim rate from render rate.
 */
export const FIXED_DT = 1 / 120;

export class FixedStepLoop {
  readonly dt: number;
  speedMultiplier = 1;
  playing = false;
  private accumulator = 0;

  constructor(dt: number = FIXED_DT) {
    this.dt = dt;
  }

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  /** Clears any partially-accumulated time (does not touch sim state itself). */
  resetAccumulator(): void {
    this.accumulator = 0;
  }

  /**
   * Advance by one render frame's worth of real time. Runs zero or more
   * fixed-dt ticks via `onTick`. Returns the number of ticks run.
   * `maxStepsPerFrame` guards against a spiral-of-death after e.g. a
   * backgrounded tab, by dropping accumulated time instead of catching up.
   */
  advance(realDtSeconds: number, onTick: (dt: number) => void, maxStepsPerFrame = 240): number {
    if (!this.playing) return 0;
    this.accumulator += realDtSeconds * this.speedMultiplier;

    let steps = 0;
    while (this.accumulator >= this.dt && steps < maxStepsPerFrame) {
      onTick(this.dt);
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps >= maxStepsPerFrame) this.accumulator = 0;
    return steps;
  }

  /** Single manual tick, independent of `playing` state. */
  step(onTick: (dt: number) => void): void {
    onTick(this.dt);
  }
}
