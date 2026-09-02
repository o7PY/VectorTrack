import type { LineRobotSpec, MazeRobotSpec } from '../sim/core/types';

export const lineRobots: LineRobotSpec[] = [
  {
    kind: 'line',
    id: 'lf-scout',
    name: 'Scout',
    sensorCount: 3,
    sensorSpacing: 25,
    sensorForwardOffset: 60,
    sensorSampleRadius: 6,
    wheelBase: 90,
    maxWheelSpeed: 400,
    color: '#38bdf8',
    notes: 'Coarse resolution, forgiving. Beginner.',
  },
  {
    kind: 'line',
    id: 'lf-ranger',
    name: 'Ranger',
    sensorCount: 5,
    sensorSpacing: 12,
    sensorForwardOffset: 55,
    sensorSampleRadius: 4,
    wheelBase: 70,
    maxWheelSpeed: 800,
    color: '#f472b6',
    notes: 'Fine resolution, twitchy, needs tuned gains.',
  },
];

export const mazeRobots: MazeRobotSpec[] = [
  {
    kind: 'maze',
    id: 'mz-probe',
    name: 'Probe',
    sensorRange: 250,
    wheelBase: 80,
    maxWheelSpeed: 300,
    color: '#38bdf8',
    notes: 'Standard.',
  },
  {
    kind: 'maze',
    id: 'mz-sprint',
    name: 'Sprint',
    sensorRange: 150,
    wheelBase: 60,
    maxWheelSpeed: 600,
    color: '#f472b6',
    notes: 'Faster but shorter-sighted.',
  },
];

export function getLineRobot(id: string): LineRobotSpec {
  const r = lineRobots.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown line robot: ${id}`);
  return r;
}

export function getMazeRobot(id: string): MazeRobotSpec {
  const r = mazeRobots.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown maze robot: ${id}`);
  return r;
}

export interface PidDefaults {
  Kp: number;
  Ki: number;
  Kd: number;
  baseSpeed: number;
}

// SPEC 5.5
export const pidDefaults: Record<string, PidDefaults> = {
  'lf-scout': { Kp: 0.45, Ki: 0.0, Kd: 0.12, baseSpeed: 250 },
  'lf-ranger': { Kp: 0.3, Ki: 0.0, Kd: 0.2, baseSpeed: 500 },
};

export interface ProportionalDefaults {
  Kp: number;
  baseSpeed: number;
}

export const proportionalDefaults: Record<string, ProportionalDefaults> = {
  'lf-scout': { Kp: 0.45, baseSpeed: 250 },
  'lf-ranger': { Kp: 0.3, baseSpeed: 500 },
};
