import { useStore } from '../store/useStore';
import { lineRobots, mazeRobots } from '../robots/definitions';
import type { LineRobotSpec, MazeRobotSpec } from '../sim/core/types';

function isLineRobot(r: LineRobotSpec | MazeRobotSpec): r is LineRobotSpec {
  return r.kind === 'line';
}

export function RobotSelect() {
  const mode = useStore((s) => s.mode);
  const robotId = useStore((s) => s.robotId);
  const selectRobot = useStore((s) => s.selectRobot);
  const robots = mode === 'line' ? lineRobots : mazeRobots;
  const robot = robots.find((r) => r.id === robotId) ?? robots[0];

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={robotId}
        onChange={(e) => selectRobot(e.target.value)}
        className="w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
      >
        {robots.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs">
        <dt className="text-neutral-500">Sensors</dt>
        <dd className="text-right text-neutral-300">
          {isLineRobot(robot) ? robot.sensorCount : `3 (F/L/R), ${robot.sensorRange}mm range`}
        </dd>
        <dt className="text-neutral-500">Wheelbase</dt>
        <dd className="text-right text-neutral-300">{robot.wheelBase} mm</dd>
        <dt className="text-neutral-500">Max speed</dt>
        <dd className="text-right text-neutral-300">{robot.maxWheelSpeed} mm/s</dd>
        <dd className="col-span-2 mt-1 text-neutral-500 italic">{robot.notes}</dd>
      </dl>
    </div>
  );
}
