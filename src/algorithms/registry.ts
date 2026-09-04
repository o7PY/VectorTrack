import { pidDefaults, proportionalDefaults } from '../robots/definitions';
import { isVtlRuntimeId, resolveCompiledCustomAlgorithm, resolveCustomAlgorithm } from '../store/customAlgorithmResolvers';
import type { ParamDecl, Program } from '../vtl/types';

export type LineAlgorithmId = 'bangBang' | 'proportional' | 'pid';
export type MazeAlgorithmId = 'wallFollower' | 'floodFill';

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** When set, this param's max is the selected robot's maxWheelSpeed instead of a fixed number. */
  maxIsRobotSpeed?: boolean;
}

export interface AlgorithmMeta {
  id: string;
  name: string;
  mode: 'line' | 'maze';
  params: ParamSpec[];
  choiceParams?: { key: string; label: string; options: { value: string; label: string }[] }[];
}

export const lineAlgorithms: AlgorithmMeta[] = [
  { id: 'bangBang', name: 'Bang-Bang', mode: 'line', params: [] },
  {
    id: 'proportional',
    name: 'Proportional (P)',
    mode: 'line',
    params: [
      { key: 'Kp', label: 'Kp', min: 0, max: 2, step: 0.01 },
      { key: 'baseSpeed', label: 'Base speed', min: 50, max: 800, step: 5, maxIsRobotSpeed: true },
    ],
  },
  {
    id: 'pid',
    name: 'PID',
    mode: 'line',
    params: [
      { key: 'Kp', label: 'Kp', min: 0, max: 2, step: 0.01 },
      { key: 'Ki', label: 'Ki', min: 0, max: 0.5, step: 0.005 },
      { key: 'Kd', label: 'Kd', min: 0, max: 1, step: 0.01 },
      { key: 'baseSpeed', label: 'Base speed', min: 50, max: 800, step: 5, maxIsRobotSpeed: true },
    ],
  },
];

export const mazeAlgorithms: AlgorithmMeta[] = [
  {
    id: 'wallFollower',
    name: 'Wall Follower',
    mode: 'maze',
    params: [],
    choiceParams: [
      {
        key: 'hand',
        label: 'Hand',
        options: [
          { value: 'right', label: 'Right' },
          { value: 'left', label: 'Left' },
        ],
      },
    ],
  },
  { id: 'floodFill', name: 'Flood Fill', mode: 'maze', params: [] },
];

// Snaps a slider step to a "nice" 1/2/5-times-a-power-of-ten increment, aiming for ~200 steps
// across the declared range — VTL `param` decls carry a range but no step, unlike ParamSpec.
function stepForRange(min: number, max: number): number {
  const span = max - min;
  if (!(span > 0)) return 1;
  const raw = span / 200;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function paramSpecsFromVtlParams(params: ParamDecl[]): Pick<AlgorithmMeta, 'params' | 'choiceParams'> {
  const numberParams: ParamSpec[] = [];
  const choiceParams: NonNullable<AlgorithmMeta['choiceParams']> = [];
  for (const p of params) {
    if (p.valueKind === 'number') {
      numberParams.push({ key: p.name, label: p.name, min: p.range[0], max: p.range[1], step: stepForRange(p.range[0], p.range[1]) });
    } else {
      choiceParams.push({ key: p.name, label: p.name, options: p.options.map((o) => ({ value: o, label: o })) });
    }
  }
  return { params: numberParams, choiceParams: choiceParams.length > 0 ? choiceParams : undefined };
}

function defaultParamsFromVtlProgram(program: Program): Record<string, number | string> {
  const defaults: Record<string, number | string> = {};
  for (const p of program.params) defaults[p.name] = p.value;
  return defaults;
}

/**
 * Meta for a `vtl:${id}` algorithm, derived from the compiled program's `param` decls rather than
 * hand-written like the built-ins — internal-docs/Algorithms.md §1.4. A saved algorithm whose
 * source no longer compiles still needs to render *something* (its name, in a disabled-looking
 * state) rather than crashing the param panel or the dropdown, so a compile failure here degrades
 * to zero tunable params instead of throwing.
 */
function vtlAlgorithmMeta(algorithmId: string): AlgorithmMeta {
  const algorithm = resolveCustomAlgorithm(algorithmId);
  try {
    const { program } = resolveCompiledCustomAlgorithm(algorithmId);
    return { id: algorithmId, name: algorithm.name, mode: algorithm.mode, ...paramSpecsFromVtlParams(program.params) };
  } catch {
    return { id: algorithmId, name: algorithm.name, mode: algorithm.mode, params: [] };
  }
}

export function getAlgorithmMeta(algorithmId: string): AlgorithmMeta {
  if (isVtlRuntimeId(algorithmId)) return vtlAlgorithmMeta(algorithmId);
  const m = [...lineAlgorithms, ...mazeAlgorithms].find((a) => a.id === algorithmId);
  if (!m) throw new Error(`Unknown algorithm: ${algorithmId}`);
  return m;
}

export function getDefaultParams(robotId: string, algorithmId: string): Record<string, number | string> {
  if (isVtlRuntimeId(algorithmId)) {
    try {
      return defaultParamsFromVtlProgram(resolveCompiledCustomAlgorithm(algorithmId).program);
    } catch {
      return {};
    }
  }
  if (algorithmId === 'pid') return { ...(pidDefaults[robotId] ?? { Kp: 0.4, Ki: 0, Kd: 0.15, baseSpeed: 300 }) };
  if (algorithmId === 'proportional') return { ...(proportionalDefaults[robotId] ?? { Kp: 0.4, baseSpeed: 300 }) };
  if (algorithmId === 'wallFollower') return { hand: 'right' };
  return {};
}
