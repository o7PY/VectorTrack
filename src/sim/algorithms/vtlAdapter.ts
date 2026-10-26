// Wraps a compiled VTL `Program` in the existing `LineController` interface, so
// `sim/runners/lineRunner.ts` never learns VTL exists — internal-docs/Algorithms.md §1.6/§1.7,
// PLAN.md Phase D.

import type { LineController } from '../core/types';
import type { Program } from '../../vtl/types';
import { computeLineError, WHITE_THRESHOLD } from '../sensors/reflectance';
import type { SensorPlacement } from '../sensors/placement';
import { createRunState, Interpreter, VtlRuntimeHalt, type VtlBuiltinFn, type VtlRunState, type VtlValue } from '../../vtl/interpreter';
import { computeWheelSpeeds, D_GAIN_SCALE, ERROR_GAIN_SCALE } from './lineShared';

export type VtlLogHandler = (label: string, value: VtlValue) => void;
export type VtlHaltHandler = (halt: VtlRuntimeHalt) => void;

const MAX_LOG_LABELS = 8;

/**
 * `hotSwap` lets `store/engine.ts` swap in a newly-recompiled program mid-run — Algorithms.md §3.2's
 * "compiling source edit -> hot-swap next tick, preserving state whose names/types still match."
 * Not part of the plain `LineController` interface (`sim/runners/` must never learn VTL exists);
 * only vtl-aware callers hold a reference typed this way.
 */
export interface VtlLineController extends LineController {
  hotSwap(newProgram: Program): void;
}

// Preserves a `state`'s live value across a hot-swap when the new program still declares a state
// of the same name and same JS value type — a new/renamed state gets its fresh declared default,
// a removed one simply drops off the map.
function transplantMatchingState(previous: VtlRunState['states'], nextProgram: Program): VtlRunState['states'] {
  const next = new Map<string, VtlValue>();
  for (const s of nextProgram.states) {
    if (s.length !== null) continue; // arrays are handled by transplantMatchingArrays
    const prevValue = previous.get(s.name);
    next.set(s.name, prevValue !== undefined && typeof prevValue === typeof s.value ? prevValue : s.value);
  }
  return next;
}

// Same idea as transplantMatchingState, for array states: preserved only when the new program
// still declares an array of the same name AND the same length — a length change means every
// existing index assumption in the new source could be wrong, so it's safer to reset than to
// silently truncate/pad (v0.3.1.md §G).
function transplantMatchingArrays(previous: VtlRunState['arrays'], nextProgram: Program): VtlRunState['arrays'] {
  const next = new Map<string, number[]>();
  for (const s of nextProgram.states) {
    if (s.length === null) continue;
    const prevArr = previous.get(s.name);
    next.set(s.name, prevArr && prevArr.length === s.length ? [...prevArr] : new Array(s.length).fill(s.value as number));
  }
  return next;
}

/** Creates a `LineController` that runs `program` against `sensorPlacements`' geometry (§2.1). */
export function createVtlLineController(
  program: Program,
  sensorPlacements: SensorPlacement[],
  onLog?: VtlLogHandler,
  onHalt?: VtlHaltHandler,
): VtlLineController {
  const lateralMm = sensorPlacements.map((p) => p.lateralMm);
  const forwardMm = sensorPlacements.map((p) => p.forwardMm);
  const halfSpanMm = Math.max((Math.max(...lateralMm) - Math.min(...lateralMm)) / 2, 1e-6);

  let runState = createRunState(program);
  let simTime = 0;
  let currentSensors: number[] = new Array(sensorPlacements.length).fill(0);
  let currentDt = 0;
  let lastError = 0;
  let outLeft = 0;
  let outRight = 0;
  let driveCalled = false;
  let halted = false;
  const logLabels = new Set<string>();
  // Per-call-site low-pass filter state for deriv(), keyed by `${line}:${column}` so two deriv()
  // calls in one program get independent filters (v0.3.1.md §F.1). Analyzer forbids calling
  // deriv() from inside a loop, so a call site's key is always unique per tick.
  const derivStates = new Map<string, { lastRaw: number; lastOut: number }>();

  function sensorIndex(raw: VtlValue, label: string, line: number, column: number): number {
    const i = Math.trunc(raw as number);
    if (i < 0 || i >= currentSensors.length) {
      throw new VtlRuntimeHalt('VTL012', `${label}(${raw}) is out of range (0..${currentSensors.length - 1}).`, line, column);
    }
    return i;
  }

  const builtins: Record<string, VtlBuiltinFn> = {
    dt: () => currentDt,
    time: () => simTime,
    abs: (a) => Math.abs(a[0] as number),
    min: (a) => Math.min(a[0] as number, a[1] as number),
    max: (a) => Math.max(a[0] as number, a[1] as number),
    clamp: (a) => Math.min(Math.max(a[0] as number, a[1] as number), a[2] as number),
    sign: (a) => Math.sign(a[0] as number),
    sqrt: (a) => Math.sqrt(a[0] as number),
    sin: (a) => Math.sin(((a[0] as number) * Math.PI) / 180),
    cos: (a) => Math.cos(((a[0] as number) * Math.PI) / 180),
    atan2: (a) => (Math.atan2(a[0] as number, a[1] as number) * 180) / Math.PI,
    log: (a) => {
      const label = String(a[0]);
      if (logLabels.has(label) || logLabels.size < MAX_LOG_LABELS) {
        logLabels.add(label);
        onLog?.(label, a[1]);
      }
      return null;
    },
    sensor: (a, ctx) => currentSensors[sensorIndex(a[0], 'sensor', ctx.line, ctx.column)],
    sensor_count: () => currentSensors.length,
    sensor_x: (a, ctx) => lateralMm[sensorIndex(a[0], 'sensor_x', ctx.line, ctx.column)],
    sensor_y: (a, ctx) => forwardMm[sensorIndex(a[0], 'sensor_y', ctx.line, ctx.column)],
    line_error: () => lastError,
    line_error_mm: () => lastError * halfSpanMm,
    line_lost: () => currentSensors.every((s) => s < WHITE_THRESHOLD),
    drive: (a) => {
      driveCalled = true;
      outLeft = a[0] as number;
      outRight = a[1] as number;
      return null;
    },
    // Replaces the hand-rolled low-pass derivative filter (ISSUES #14) that used to be
    // copy-pasted into every PID-flavored example. Matches that filter's math exactly, with the
    // same `state ... = 0` initial conditions, and pre-scales its output by D_GAIN_SCALE /
    // ERROR_GAIN_SCALE so it's directly addable to a plain error term (v0.3.1.md §F.1).
    deriv: (a, ctx) => {
      const e = a[0] as number;
      const tau = a[1] as number;
      const key = `${ctx.line}:${ctx.column}`;
      const prev = derivStates.get(key) ?? { lastRaw: 0, lastOut: 0 };
      const raw = (e - prev.lastRaw) / currentDt;
      const out = prev.lastOut + (raw - prev.lastOut) * (currentDt / (tau + currentDt));
      derivStates.set(key, { lastRaw: e, lastOut: out });
      return out * (D_GAIN_SCALE / ERROR_GAIN_SCALE);
    },
    // Sugar over drive() + computeWheelSpeeds(), applying ERROR_GAIN_SCALE internally so user
    // programs never hand-multiply an internal calibration constant (v0.3.1.md §F.2).
    steer: (a) => {
      const { vLeft, vRight } = computeWheelSpeeds(a[0] as number, (a[1] as number) * ERROR_GAIN_SCALE);
      driveCalled = true;
      outLeft = vLeft;
      outRight = vRight;
      return null;
    },
  };

  let interp = new Interpreter(program, builtins);

  function run(eventName: 'start' | 'tick'): void {
    if (halted) return;
    try {
      interp.runEvent(eventName, runState);
    } catch (e) {
      halted = true;
      if (e instanceof VtlRuntimeHalt) {
        onHalt?.(e);
      } else {
        throw e;
      }
    }
  }

  return {
    id: 'vtl',
    reset() {
      runState = createRunState(program);
      simTime = 0;
      lastError = 0;
      outLeft = 0;
      outRight = 0;
      driveCalled = false;
      halted = false;
      logLabels.clear();
      derivStates.clear();
      run('start');
    },
    step(sensors, dt, params, _baseSpeed, maxWheelSpeed) {
      currentSensors = sensors;
      currentDt = dt;
      simTime += dt;
      lastError = computeLineError(sensors, lastError, lateralMm);
      driveCalled = false;

      for (const [name, value] of Object.entries(params)) {
        if (runState.params.has(name)) runState.params.set(name, value);
      }

      run('tick');

      const vLeft = driveCalled ? Math.max(-maxWheelSpeed, Math.min(maxWheelSpeed, outLeft)) : 0;
      const vRight = driveCalled ? Math.max(-maxWheelSpeed, Math.min(maxWheelSpeed, outRight)) : 0;
      return { vLeft, vRight, debug: { error: lastError, p: 0, i: 0, d: 0 } };
    },
    hotSwap(newProgram) {
      program = newProgram;
      runState = {
        states: transplantMatchingState(runState.states, newProgram),
        arrays: transplantMatchingArrays(runState.arrays, newProgram),
        params: createRunState(newProgram).params,
        constants: runState.constants,
      };
      derivStates.clear();
      interp = new Interpreter(newProgram, builtins);
      halted = false;
    },
  };
}
