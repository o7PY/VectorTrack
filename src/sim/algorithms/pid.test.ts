import { describe, expect, it } from 'vitest';
import { createPid } from './pid';
import { INTEGRAL_LIMIT } from './lineShared';

describe('createPid', () => {
  it('drives straight (equal wheel speeds at baseSpeed) when centered and all gains zero', () => {
    const pid = createPid();
    const out = pid.step([0, 0, 1, 0, 0], 1 / 120, { Kp: 0, Ki: 0, Kd: 0 }, 250, 400, 90);
    expect(out.vLeft).toBeCloseTo(250, 6);
    expect(out.vRight).toBeCloseTo(250, 6);
    expect(out.debug.error).toBeCloseTo(0, 6);
  });

  it('turns left (vRight > vLeft) when the line is toward the left sensors (positive error)', () => {
    const pid = createPid();
    const out = pid.step([0, 0, 0, 0, 1], 1 / 120, { Kp: 0.5, Ki: 0, Kd: 0 }, 250, 400, 90);
    expect(out.vRight).toBeGreaterThan(out.vLeft);
  });

  it('turns right (vLeft > vRight) when the line is toward the right sensors (negative error)', () => {
    const pid = createPid();
    const out = pid.step([1, 0, 0, 0, 0], 1 / 120, { Kp: 0.5, Ki: 0, Kd: 0 }, 250, 400, 90);
    expect(out.vLeft).toBeGreaterThan(out.vRight);
  });

  it('accumulates and clamps the integral term (anti-windup)', () => {
    const pid = createPid();
    let out;
    for (let i = 0; i < 10000; i++) {
      out = pid.step([0, 0, 0, 0, 1], 1 / 120, { Kp: 0, Ki: 0.5, Kd: 0 }, 250, 400, 90);
    }
    // integral should have saturated at INTEGRAL_LIMIT, not grown unbounded
    expect(out!.debug.i).toBeCloseTo(0.5 * INTEGRAL_LIMIT, 4);
  });

  it('produces a derivative kick when error changes abruptly', () => {
    const pid = createPid();
    pid.step([0, 0, 1, 0, 0], 1 / 120, { Kp: 0, Ki: 0, Kd: 0.5 }, 250, 400, 90); // error 0
    const out = pid.step([0, 0, 0, 0, 1], 1 / 120, { Kp: 0, Ki: 0, Kd: 0.5 }, 250, 400, 90); // error jumps to 2
    expect(out.debug.d).toBeGreaterThan(0);
  });

  it('resets internal state (integral, last error) on reset()', () => {
    const pid = createPid();
    for (let i = 0; i < 100; i++) {
      pid.step([0, 0, 0, 0, 1], 1 / 120, { Kp: 0, Ki: 0.5, Kd: 0 }, 250, 400, 90);
    }
    pid.reset();
    const out = pid.step([0, 0, 1, 0, 0], 1 / 120, { Kp: 0, Ki: 0.5, Kd: 0 }, 250, 400, 90);
    expect(out.debug.i).toBeCloseTo(0, 6);
  });
});
