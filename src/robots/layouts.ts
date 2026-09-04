// Built-in sensor layout presets — internal-docs/Algorithms.md §2, PLAN.md Phase J.
//
// A robot's *default* layout id must equal the robot's own id exactly — store/persistence.ts's
// v2->v3 `bestRuns` migration assumes every pre-Phase-J run's implicit layout is `robotId`, and
// changing that here would mean re-doing that already-shipped migration.
import type { LineRobotSpec, MazeRobotSpec } from '../sim/core/types';
import type { SensorPlacement } from '../sim/sensors/placement';
import { orderSensorsLeftToRight } from '../sim/sensors/placement';

export interface SensorLayoutPreset {
  id: string;
  name: string;
  mode: 'line' | 'maze';
  sensors: SensorPlacement[];
}

/** `robot`'s current fixed-geometry sensor array, reproduced exactly (same `(i-mid)*spacing` arithmetic the pre-Phase-J code used) so this is a zero-behavioral-change refactor. */
export function defaultLineLayout(robot: LineRobotSpec): SensorLayoutPreset {
  const mid = (robot.sensorCount - 1) / 2;
  const sensors: SensorPlacement[] = [];
  for (let i = 0; i < robot.sensorCount; i++) {
    sensors.push({
      id: `s${i}`,
      type: 'reflectance',
      forwardMm: robot.sensorForwardOffset,
      lateralMm: (i - mid) * robot.sensorSpacing,
      headingDeg: 0,
      spotRadiusMm: robot.sensorSampleRadius,
    });
  }
  return { id: robot.id, name: `${robot.name} (default)`, mode: 'line', sensors: orderSensorsLeftToRight(sensors) };
}

/** `robot`'s current front/left/right rangefinder array, mounted at the wheel axis (rangefinder.ts's pre-Phase-J fixed geometry). */
export function defaultMazeLayout(robot: MazeRobotSpec): SensorLayoutPreset {
  const sensors: SensorPlacement[] = [
    { id: 'left', type: 'rangefinder', forwardMm: 0, lateralMm: 0, headingDeg: -90, maxRangeMm: robot.sensorRange },
    { id: 'front', type: 'rangefinder', forwardMm: 0, lateralMm: 0, headingDeg: 0, maxRangeMm: robot.sensorRange },
    { id: 'right', type: 'rangefinder', forwardMm: 0, lateralMm: 0, headingDeg: 90, maxRangeMm: robot.sensorRange },
  ];
  return { id: robot.id, name: `${robot.name} (default)`, mode: 'maze', sensors };
}
