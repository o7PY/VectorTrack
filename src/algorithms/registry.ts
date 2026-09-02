import { pidDefaults, proportionalDefaults } from '../robots/definitions';

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

export function getAlgorithmMeta(algorithmId: string): AlgorithmMeta {
  const m = [...lineAlgorithms, ...mazeAlgorithms].find((a) => a.id === algorithmId);
  if (!m) throw new Error(`Unknown algorithm: ${algorithmId}`);
  return m;
}

export function getDefaultParams(robotId: string, algorithmId: string): Record<string, number | string> {
  if (algorithmId === 'pid') return { ...(pidDefaults[robotId] ?? { Kp: 0.4, Ki: 0, Kd: 0.15, baseSpeed: 300 }) };
  if (algorithmId === 'proportional') return { ...(proportionalDefaults[robotId] ?? { Kp: 0.4, baseSpeed: 300 }) };
  if (algorithmId === 'wallFollower') return { hand: 'right' };
  return {};
}
