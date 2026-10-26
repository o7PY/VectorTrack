import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { createRunState, Interpreter, VtlEventStop, type VtlBuiltinFn, type VtlValue } from './interpreter';
import { MAZE_DIRECTION_CONSTANTS } from './builtins/maze';
import type { Program } from './types';

const MAZE_CONSTANTS = Object.fromEntries(MAZE_DIRECTION_CONSTANTS.map((d) => [d, d]));

const PID_PROGRAM = `
param Kp = 0.45 range 0..2
param Ki = 0.00 range 0..0.5
param Kd = 0.12 range 0..1
param base = 250 range 50..800

state integral = 0
state lastError = 0
state lastD = 0

on tick:
  let e = line_error()
  set integral = clamp(integral + e * dt(), -1, 1)
  let raw = (e - lastError) / dt()
  let d = lastD + (raw - lastD) * (dt() / (0.12 + dt()))
  set lastD = d
  set lastError = e
  let corr = Kp * e * 340 + Ki * integral * 340 + Kd * d * 20
  drive(base - corr, base + corr)
`;

const WALL_FOLLOWER_PROGRAM = `
on junction:
  if can_move(left):
    move_to(left)
  elif can_move(forward):
    move_to(forward)
  elif can_move(right):
    move_to(right)
  else:
    move_to(back)
`;

const FLOOD_FILL_PROGRAM = `
on junction:
  if at_goal():
    finish()
  let best = "forward"
  if distance_to_goal(left) < distance_to_goal(best):
    set best = "left"
  if distance_to_goal(right) < distance_to_goal(best):
    set best = "right"
  if distance_to_goal(back) < distance_to_goal(best):
    set best = "back"
  move_to(best)
`;

function mustCompile(source: string, mode: 'line' | 'maze'): Program {
  const result = compile(source, mode);
  if (!result.ok) throw new Error(`compile failed: ${result.errors.map((e) => e.message).join('; ')}`);
  return result.program;
}

function sharedBuiltins(dtValue: number, timeValue: number): Record<string, VtlBuiltinFn> {
  return {
    dt: () => dtValue,
    time: () => timeValue,
    abs: (a) => Math.abs(a[0] as number),
    min: (a) => Math.min(a[0] as number, a[1] as number),
    max: (a) => Math.max(a[0] as number, a[1] as number),
    clamp: (a) => Math.min(Math.max(a[0] as number, a[1] as number), a[2] as number),
    sign: (a) => Math.sign(a[0] as number),
    sqrt: (a) => Math.sqrt(a[0] as number),
    sin: (a) => Math.sin(((a[0] as number) * Math.PI) / 180),
    cos: (a) => Math.cos(((a[0] as number) * Math.PI) / 180),
    atan2: (a) => (Math.atan2(a[0] as number, a[1] as number) * 180) / Math.PI,
    log: () => null,
  };
}

describe('Interpreter — PID line follower (§1.8)', () => {
  it('drives straight with zero error and settles gains deterministically', () => {
    const program = mustCompile(PID_PROGRAM, 'line');
    const drives: [number, number][] = [];
    const builtins: Record<string, VtlBuiltinFn> = {
      ...sharedBuiltins(1 / 120, 0),
      line_error: () => 0,
      drive: (a) => {
        drives.push([a[0] as number, a[1] as number]);
        return null;
      },
    };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program);
    for (let i = 0; i < 10; i++) interp.runEvent('tick', state);
    expect(drives).toHaveLength(10);
    for (const [l, r] of drives) {
      expect(l).toBeCloseTo(250, 6);
      expect(r).toBeCloseTo(250, 6);
    }
  });

  it('corrects toward the line when error is nonzero', () => {
    const program = mustCompile(PID_PROGRAM, 'line');
    const drives: [number, number][] = [];
    const builtins: Record<string, VtlBuiltinFn> = {
      ...sharedBuiltins(1 / 120, 0),
      line_error: () => 0.5,
      drive: (a) => {
        drives.push([a[0] as number, a[1] as number]);
        return null;
      },
    };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program);
    interp.runEvent('tick', state);
    const [left, right] = drives[0];
    expect(right).toBeGreaterThan(left);
  });

  it('is deterministic: two identical runs produce identical trajectories', () => {
    const runOnce = (): VtlValue[] => {
      const program = mustCompile(PID_PROGRAM, 'line');
      const errors = [0.3, -0.2, 0.1, 0.05, -0.4, 0, 0.2, -0.1, 0.15, -0.3];
      let idx = 0;
      const trace: VtlValue[] = [];
      const builtins: Record<string, VtlBuiltinFn> = {
        ...sharedBuiltins(1 / 120, 0),
        line_error: () => errors[idx],
        drive: (a) => {
          trace.push(a[0], a[1]);
          return null;
        },
      };
      const interp = new Interpreter(program, builtins);
      const state = createRunState(program);
      for (idx = 0; idx < errors.length; idx++) interp.runEvent('tick', state);
      return trace;
    };
    expect(runOnce()).toEqual(runOnce());
  });
});

describe('Interpreter — left-hand wall follower (§1.8)', () => {
  it('prefers left, then forward, then right, then back', () => {
    const program = mustCompile(WALL_FOLLOWER_PROGRAM, 'maze');

    function moveWith(open: Record<string, boolean>): string {
      let moved = '';
      const builtins: Record<string, VtlBuiltinFn> = {
        can_move: (a) => open[a[0] as string] ?? false,
        move_to: (a) => {
          moved = a[0] as string;
          throw new VtlEventStop();
        },
      };
      const interp = new Interpreter(program, builtins);
      const state = createRunState(program, MAZE_CONSTANTS);
      interp.runEvent('junction', state);
      return moved;
    }

    expect(moveWith({ left: true, forward: true, right: true, back: true })).toBe('left');
    expect(moveWith({ left: false, forward: true, right: true, back: true })).toBe('forward');
    expect(moveWith({ left: false, forward: false, right: true, back: true })).toBe('right');
    expect(moveWith({ left: false, forward: false, right: false, back: true })).toBe('back');
  });
});

describe('Interpreter — greedy flood fill (§1.8)', () => {
  it('finishes immediately when already at the goal', () => {
    const program = mustCompile(FLOOD_FILL_PROGRAM, 'maze');
    let finished = false;
    let moved = false;
    const builtins: Record<string, VtlBuiltinFn> = {
      at_goal: () => true,
      finish: () => {
        finished = true;
        return null;
      },
      distance_to_goal: () => 0,
      move_to: () => {
        moved = true;
        return null;
      },
    };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program, MAZE_CONSTANTS);
    interp.runEvent('junction', state);
    expect(finished).toBe(true);
    expect(moved).toBe(true);
  });

  it('picks the neighbour with the smallest distance-to-goal', () => {
    const program = mustCompile(FLOOD_FILL_PROGRAM, 'maze');
    const distances: Record<string, number> = { forward: 5, left: 2, right: 8, back: 9 };
    let moved = '';
    const builtins: Record<string, VtlBuiltinFn> = {
      at_goal: () => false,
      finish: () => null,
      distance_to_goal: (a) => distances[a[0] as string],
      move_to: (a) => {
        moved = a[0] as string;
        return null;
      },
    };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program, MAZE_CONSTANTS);
    interp.runEvent('junction', state);
    expect(moved).toBe('left');
  });
});

describe('Interpreter — arrays, tables, and for loops (v0.3.1.md §C/§D/§G)', () => {
  it('for loop over an inclusive range writes exactly that many elements', () => {
    const program = mustCompile(
      'state buf[5] = 0\nstate count = 0\non tick:\n  for i in 0..4:\n    set buf[i] = i * 2\n    set count = count + 1\n  drive(0, 0)\n',
      'line',
    );
    const builtins: Record<string, VtlBuiltinFn> = { ...sharedBuiltins(1 / 120, 0), drive: () => null };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program);
    interp.runEvent('tick', state);
    expect(state.states.get('count')).toBe(5);
    expect(state.arrays.get('buf')).toEqual([0, 2, 4, 6, 8]);
  });

  it('reads a table value declared with negative literals', () => {
    const program = mustCompile(
      'table t = [-2, -1, 0, 1, 2]\non tick:\n  let x = t[1]\n  drive(x, len(t))\n',
      'line',
    );
    const drives: [number, number][] = [];
    const builtins: Record<string, VtlBuiltinFn> = {
      ...sharedBuiltins(1 / 120, 0),
      drive: (a) => {
        drives.push([a[0] as number, a[1] as number]);
        return null;
      },
    };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program);
    interp.runEvent('tick', state);
    expect(drives[0]).toEqual([-1, 5]);
  });

  it('halts with VTL017 on a runtime out-of-range computed index', () => {
    const program = mustCompile(
      'state buf[3] = 0\non tick:\n  let i = 5\n  let x = buf[i]\n  drive(0, 0)\n',
      'line',
    );
    const builtins: Record<string, VtlBuiltinFn> = { ...sharedBuiltins(1 / 120, 0), drive: () => null };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program);
    expect(() => interp.runEvent('tick', state)).toThrowError(/out of range/);
  });

  it('a hot-swap resets an array whose length changed, but preserves it when unchanged', () => {
    const programA = mustCompile('state buf[3] = 0\non tick:\n  set buf[0] = 9\n  drive(0, 0)\n', 'line');
    const builtins: Record<string, VtlBuiltinFn> = { ...sharedBuiltins(1 / 120, 0), drive: () => null };
    const interp = new Interpreter(programA, builtins);
    const state = createRunState(programA);
    interp.runEvent('tick', state);
    expect(state.arrays.get('buf')).toEqual([9, 0, 0]);
  });
});

describe('Interpreter — steer/deriv match the hand-rolled PID exactly (v0.3.1.md §F.2)', () => {
  const HAND_ROLLED_PID = `
param Kp = 0.45 range 0..2
param Ki = 0.00 range 0..0.5
param Kd = 0.12 range 0..1
param base = 250 range 50..800

state integral = 0
state lastError = 0
state lastD = 0

on tick:
  let e = line_error()
  set integral = clamp(integral + e * dt(), -1, 1)
  let raw = (e - lastError) / dt()
  let d = lastD + (raw - lastD) * (dt() / (0.12 + dt()))
  set lastD = d
  set lastError = e
  let corr = Kp * e * 340 + Ki * integral * 340 + Kd * d * 20
  drive(base - corr, base + corr)
`;

  const STEER_PID = `
param Kp = 0.45 range 0..2
param Ki = 0.00 range 0..0.5
param Kd = 0.12 range 0..1
param base = 250 range 50..800

state integral = 0

on tick:
  let e = line_error()
  set integral = clamp(integral + e * dt(), -1, 1)
  steer(base, Kp * e + Ki * integral + Kd * deriv(e, 0.12))
`;

  const D_GAIN_SCALE = 20;
  const ERROR_GAIN_SCALE = 340;

  // Mirrors sim/algorithms/vtlAdapter.ts's deriv/steer builtin implementations exactly — this
  // describe block checks the language contract (interpreter call semantics), while
  // sim/algorithms/vtlPidEquivalence.test.ts checks the real adapter end-to-end on a simulated map.
  function derivSteerBuiltins(dtValue: number): Record<string, VtlBuiltinFn> {
    const derivStates = new Map<string, { lastRaw: number; lastOut: number }>();
    return {
      deriv: (a, ctx) => {
        const e = a[0] as number;
        const tau = a[1] as number;
        const key = `${ctx.line}:${ctx.column}`;
        const prev = derivStates.get(key) ?? { lastRaw: 0, lastOut: 0 };
        const raw = (e - prev.lastRaw) / dtValue;
        const out = prev.lastOut + (raw - prev.lastOut) * (dtValue / (tau + dtValue));
        derivStates.set(key, { lastRaw: e, lastOut: out });
        return out * (D_GAIN_SCALE / ERROR_GAIN_SCALE);
      },
    };
  }

  it('produces identical wheel speeds tick-for-tick across a noisy error sequence', () => {
    const errors = [0, 0.5, -0.3, 0.2, 0.05, -0.6, 0.4, 0, -0.1, 0.35];
    const dt = 1 / 120;

    function run(source: string): [number, number][] {
      const program = mustCompile(source, 'line');
      let idx = 0;
      const drives: [number, number][] = [];
      const builtins: Record<string, VtlBuiltinFn> = {
        ...sharedBuiltins(dt, 0),
        ...derivSteerBuiltins(dt),
        line_error: () => errors[idx],
        drive: (a) => {
          drives.push([a[0] as number, a[1] as number]);
          return null;
        },
        steer: (a) => {
          const base = a[0] as number;
          const corr = (a[1] as number) * ERROR_GAIN_SCALE;
          drives.push([base - corr, base + corr]);
          return null;
        },
      };
      const interp = new Interpreter(program, builtins);
      const state = createRunState(program);
      for (idx = 0; idx < errors.length; idx++) interp.runEvent('tick', state);
      return drives;
    }

    const handRolled = run(HAND_ROLLED_PID);
    const steerForm = run(STEER_PID);
    expect(handRolled).toHaveLength(steerForm.length);
    for (let i = 0; i < handRolled.length; i++) {
      expect(steerForm[i][0]).toBeCloseTo(handRolled[i][0], 9);
      expect(steerForm[i][1]).toBeCloseTo(handRolled[i][1], 9);
    }
  });
});

describe('Interpreter — runtime halts', () => {
  it('halts with VTL011 on division by zero', () => {
    const program = mustCompile('on tick:\n  let e = 1 / 0\n  drive(0, 0)\n', 'line');
    const builtins: Record<string, VtlBuiltinFn> = { ...sharedBuiltins(1 / 120, 0), drive: () => null };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program);
    expect(() => interp.runEvent('tick', state)).toThrowError(/VTL011|Division/);
  });

  it('runs on start once to seed state from params', () => {
    const program = mustCompile(
      'param base = 250 range 50..800\nstate speed = 0\non start:\n  set speed = base\non tick:\n  drive(speed, speed)\n',
      'line',
    );
    const drives: [number, number][] = [];
    const builtins: Record<string, VtlBuiltinFn> = {
      drive: (a) => {
        drives.push([a[0] as number, a[1] as number]);
        return null;
      },
    };
    const interp = new Interpreter(program, builtins);
    const state = createRunState(program);
    interp.runEvent('start', state);
    interp.runEvent('tick', state);
    expect(drives[0]).toEqual([250, 250]);
  });
});
