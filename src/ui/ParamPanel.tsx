import { useStore } from '../store/useStore';
import { getAlgorithmMeta } from '../algorithms/registry';
import { getLineRobot, getMazeRobot } from '../robots/definitions';

export function ParamPanel() {
  const mode = useStore((s) => s.mode);
  const robotId = useStore((s) => s.robotId);
  const algorithmId = useStore((s) => s.algorithmId);
  const params = useStore((s) => s.params);
  const setParam = useStore((s) => s.setParam);
  const resetParamsToDefault = useStore((s) => s.resetParamsToDefault);

  const meta = getAlgorithmMeta(algorithmId);
  const maxWheelSpeed = mode === 'line' ? getLineRobot(robotId).maxWheelSpeed : getMazeRobot(robotId).maxWheelSpeed;

  if (meta.params.length === 0 && !meta.choiceParams) {
    return <p className="text-xs text-neutral-500">No tunable parameters for {meta.name}.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {meta.params.map((p) => {
        const max = p.maxIsRobotSpeed ? maxWheelSpeed : p.max;
        const value = Number(params[p.key] ?? p.min);
        return (
          <div key={p.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>{p.label}</span>
              <input
                type="number"
                value={value}
                min={p.min}
                max={max}
                step={p.step}
                onChange={(e) => setParam(p.key, clampNum(Number(e.target.value), p.min, max))}
                className="w-16 rounded border border-neutral-800 bg-neutral-950 px-1 py-0.5 text-right text-neutral-100"
              />
            </div>
            <input
              type="range"
              min={p.min}
              max={max}
              step={p.step}
              value={value}
              onChange={(e) => setParam(p.key, Number(e.target.value))}
              className="w-full accent-sky-500"
            />
          </div>
        );
      })}

      {meta.choiceParams?.map((cp) => (
        <div key={cp.key} className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">{cp.label}</span>
          <div className="flex overflow-hidden rounded-md border border-neutral-800">
            {cp.options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setParam(cp.key, opt.value)}
                className={`flex-1 px-2 py-1 text-xs font-medium ${
                  params[cp.key] === opt.value ? 'bg-sky-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {meta.params.length > 0 && (
        <button
          onClick={resetParamsToDefault}
          className="mt-1 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
        >
          Reset to defaults
        </button>
      )}
    </div>
  );
}

function clampNum(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}
