import { useStore } from '../store/useStore';
import { lineMaps } from '../maps/line';
import { mazeMaps } from '../maps/maze';

function LineThumb({ points, widthMm, heightMm }: { points: { x: number; y: number }[]; widthMm: number; heightMm: number }) {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ') + ' Z';
  return (
    <svg viewBox={`0 0 ${widthMm} ${heightMm}`} className="h-10 w-14 shrink-0 rounded bg-neutral-950">
      <path d={d} fill="none" stroke="#71717a" strokeWidth={40} />
    </svg>
  );
}

function MazeThumb({ rows }: { rows: number }) {
  const cells = Math.min(rows, 8);
  return (
    <div className="grid h-10 w-14 shrink-0 grid-cols-4 grid-rows-4 gap-px rounded bg-neutral-950 p-1">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className={`rounded-sm ${i % 5 === 0 ? 'bg-neutral-600' : 'bg-neutral-800'}`} />
      ))}
      <span className="sr-only">{cells}</span>
    </div>
  );
}

export function MapList() {
  const mode = useStore((s) => s.mode);
  const mapId = useStore((s) => s.mapId);
  const selectMap = useStore((s) => s.selectMap);
  const completedMaps = useStore((s) => s.completedMaps);

  const maps = mode === 'line' ? lineMaps : mazeMaps;

  return (
    <div className="flex flex-col gap-1.5">
      {maps.map((m) => {
        const selected = m.id === mapId;
        const completed = completedMaps.includes(m.id);
        return (
          <button
            key={m.id}
            onClick={() => selectMap(m.id)}
            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
              selected ? 'border-sky-600 bg-sky-950/40' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
            }`}
          >
            {'points' in m ? (
              <LineThumb points={m.points} widthMm={m.widthMm} heightMm={m.heightMm} />
            ) : (
              <MazeThumb rows={m.rows} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-neutral-100">{m.name}</span>
                {completed && <span title="Completed" className="text-xs text-emerald-400">✓</span>}
              </div>
              <div className="truncate text-xs text-neutral-500">{m.description ?? ''}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
