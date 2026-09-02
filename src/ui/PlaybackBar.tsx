import { useStore } from '../store/useStore';

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function PlaybackBar() {
  const playing = useStore((s) => s.playing);
  const status = useStore((s) => s.status);
  const play = useStore((s) => s.play);
  const pause = useStore((s) => s.pause);
  const step = useStore((s) => s.step);
  const reset = useStore((s) => s.reset);
  const speedMultiplier = useStore((s) => s.speedMultiplier);
  const setSpeedMultiplier = useStore((s) => s.setSpeedMultiplier);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const cameraPreset = useStore((s) => s.cameraPreset);
  const setCameraPreset = useStore((s) => s.setCameraPreset);

  const finished = status.outcome === 'success' || status.outcome === 'failed';

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
      <div className="flex items-center gap-1">
        <button
          onClick={() => (playing ? pause() : play())}
          disabled={finished}
          title={playing ? 'Pause' : 'Play'}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          onClick={step}
          disabled={finished || playing}
          title="Step one tick"
          className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          ⏭
        </button>
        <button
          onClick={reset}
          title="Reset run"
          className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-neutral-200 hover:bg-neutral-800"
        >
          ↺
        </button>
      </div>

      <label className="flex items-center gap-1.5 text-neutral-400">
        speed
        <select
          value={speedMultiplier}
          onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
          className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-neutral-100"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-neutral-400">
        view
        <div className="flex overflow-hidden rounded-md border border-neutral-800">
          {(['2d', '3d'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={`px-2 py-1 text-xs font-medium uppercase ${
                viewMode === v ? 'bg-sky-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </label>

      {viewMode === '3d' && (
        <label className="flex items-center gap-1.5 text-neutral-400">
          cam
          <select
            value={cameraPreset}
            onChange={(e) => setCameraPreset(e.target.value as 'iso' | 'top' | 'chase')}
            className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-neutral-100"
          >
            <option value="iso">Isometric</option>
            <option value="top">Top-Down</option>
            <option value="chase">Chase</option>
          </select>
        </label>
      )}
    </div>
  );
}
