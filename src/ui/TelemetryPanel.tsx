import { useStore } from '../store/useStore';
import { Sparkline } from './Sparkline';

function SensorBar({ v }: { v: number }) {
  const shade = Math.round(255 - v * 200);
  return <span className="inline-block h-3 w-3 rounded-sm border border-neutral-700" style={{ backgroundColor: `rgb(${shade},${shade},${shade})` }} />;
}

// Flood fill is a three-phase algorithm (SPEC 5.4: "explore to goal, then
// compute shortest path and run it") — it reaches the goal once mid-run
// (ending "explore"), then deliberately drives all the way back to start
// before running the shortest known path for the timed result. That looks
// like backtracking/a bug if the phase isn't labeled clearly.
const PHASE_LABELS: Record<string, string> = {
  navigating: 'Navigating',
  explore: 'Exploring',
  return: 'Returning to start',
  run: 'Running shortest path',
  done: 'Done',
};

const PHASE_NOTES: Record<string, string> = {
  return: 'Goal reached — heading back to start to run the optimized path.',
  run: 'Replaying the shortest known path for the timed result.',
};

export function TelemetryPanel() {
  const mode = useStore((s) => s.mode);
  const simTime = useStore((s) => s.simTime);
  const vLeft = useStore((s) => s.vLeft);
  const vRight = useStore((s) => s.vRight);
  const lineTelemetry = useStore((s) => s.lineTelemetry);
  const mazeTelemetry = useStore((s) => s.mazeTelemetry);

  const speed = (vLeft + vRight) / 2;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-300 sm:grid-cols-4">
      <div>
        <div className="text-neutral-500">t</div>
        <div className="font-mono">{simTime.toFixed(1)}s</div>
      </div>
      <div>
        <div className="text-neutral-500">speed</div>
        <div className="font-mono">{speed.toFixed(0)} mm/s</div>
      </div>
      <div>
        <div className="text-neutral-500">wheels L/R</div>
        <div className="font-mono">
          {vLeft.toFixed(0)} / {vRight.toFixed(0)}
        </div>
      </div>

      {mode === 'line' && lineTelemetry && (
        <>
          <div>
            <div className="text-neutral-500">sensors</div>
            <div className="flex gap-0.5">
              {lineTelemetry.sensors.map((v, i) => (
                <SensorBar key={i} v={v} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-neutral-500">error</div>
            <div className="font-mono">{lineTelemetry.error.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-neutral-500">P / I / D</div>
            <div className="font-mono">
              {lineTelemetry.p.toFixed(2)} / {lineTelemetry.i.toFixed(2)} / {lineTelemetry.d.toFixed(2)}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <div className="mb-0.5 text-neutral-500">error vs time</div>
            <Sparkline values={lineTelemetry.errorHistory} />
          </div>
        </>
      )}

      {mode === 'maze' && mazeTelemetry && (
        <>
          <div>
            <div className="text-neutral-500">sensors F/L/R</div>
            <div className="font-mono">
              {mazeTelemetry.sensors.front.toFixed(0)}/{mazeTelemetry.sensors.left.toFixed(0)}/{mazeTelemetry.sensors.right.toFixed(0)}
            </div>
          </div>
          <div>
            <div className="text-neutral-500">cell</div>
            <div className="font-mono">
              ({mazeTelemetry.cell.row},{mazeTelemetry.cell.col})
            </div>
          </div>
          <div>
            <div className="text-neutral-500">visited</div>
            <div className="font-mono">{mazeTelemetry.cellsVisited}</div>
          </div>
          <div>
            <div className="text-neutral-500">phase</div>
            <div className="font-mono">{PHASE_LABELS[mazeTelemetry.phase] ?? mazeTelemetry.phase}</div>
          </div>
          {PHASE_NOTES[mazeTelemetry.phase] && (
            <div className="col-span-2 rounded border border-sky-900/60 bg-sky-950/30 px-2 py-1 text-sky-300 sm:col-span-4">
              {PHASE_NOTES[mazeTelemetry.phase]}
            </div>
          )}
        </>
      )}
    </div>
  );
}
