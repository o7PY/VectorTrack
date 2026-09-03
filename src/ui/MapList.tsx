import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { lineMaps } from '../maps/line';
import { mazeMaps } from '../maps/maze';
import { toCustomRuntimeId } from '../maps/custom/toRuntimeMap';
import type { CustomLineMap, CustomMap } from '../maps/custom/types';
import { base64ToBits } from '../maps/custom/codec';
import { listCustomMaps, loadCustomMapStore } from '../store/customMaps';

function LineThumb({ points, widthMm, heightMm }: { points: { x: number; y: number }[]; widthMm: number; heightMm: number }) {
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ') + ' Z';
  return (
    <svg viewBox={`0 0 ${widthMm} ${heightMm}`} className="h-9 w-12 shrink-0 rounded bg-neutral-950">
      <path d={d} fill="none" stroke="#71717a" strokeWidth={40} />
    </svg>
  );
}

function CustomLineThumb({ map }: { map: CustomLineMap }) {
  const bits = base64ToBits(map.bits, map.cols * map.rows);
  return (
    <svg viewBox={`0 0 ${map.cols} ${map.rows}`} className="h-9 w-12 shrink-0 rounded bg-neutral-950">
      {Array.from(bits).map((b, i) =>
        b ? <rect key={i} x={i % map.cols} y={Math.floor(i / map.cols)} width={1} height={1} fill="#71717a" /> : null,
      )}
    </svg>
  );
}

function MazeThumb({ rows }: { rows: number }) {
  const cells = Math.min(rows, 8);
  return (
    <div className="grid h-9 w-12 shrink-0 grid-cols-4 grid-rows-4 gap-px rounded bg-neutral-950 p-1">
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className={`rounded-sm ${i % 5 === 0 ? 'bg-neutral-600' : 'bg-neutral-800'}`} />
      ))}
      <span className="sr-only">{cells}</span>
    </div>
  );
}

interface DropdownOption {
  id: string;
  name: string;
  completed: boolean;
  thumb: ReactNode;
}

/** A custom-rendered dropdown (rather than a native <select>) so each option can show a map thumbnail — the popover itself scrolls internally, so an arbitrarily long map list never grows the sidebar. */
function MapDropdown({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const selected = options.find((o) => o.id === value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-left hover:border-neutral-700"
      >
        {selected ? selected.thumb : <div className="h-9 w-12 shrink-0 rounded bg-neutral-950" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">{selected ? selected.name : placeholder}</span>
        {selected?.completed && <span title="Completed" className="shrink-0 text-xs text-emerald-400">✓</span>}
        <span className="shrink-0 text-neutral-500">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto scroll-thin rounded-md border border-neutral-800 bg-neutral-900 shadow-xl">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-neutral-800 ${
                o.id === value ? 'bg-sky-950/40' : ''
              }`}
            >
              {o.thumb}
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{o.name}</span>
              {o.completed && <span title="Completed" className="shrink-0 text-xs text-emerald-400">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MapList() {
  const mode = useStore((s) => s.mode);
  const mapId = useStore((s) => s.mapId);
  const selectMap = useStore((s) => s.selectMap);
  const completedMaps = useStore((s) => s.completedMaps);

  const builtIns = mode === 'line' ? lineMaps : mazeMaps;
  // Custom maps only change via the Map Maker (a full page navigation away
  // from here), so re-reading localStorage on every render — rather than
  // caching in state — is simplest and always fresh.
  const myMaps: CustomMap[] = listCustomMaps(loadCustomMapStore()).filter((m) => m.mode === mode);

  const builtInIsSelected = builtIns.some((m) => m.id === mapId);
  const myMapsIsSelected = myMaps.some((m) => toCustomRuntimeId(m.id) === mapId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Built-in maps</h3>
        <MapDropdown
          value={builtInIsSelected ? mapId : ''}
          onChange={selectMap}
          placeholder="Choose a map"
          options={builtIns.map((m) => ({
            id: m.id,
            name: m.name,
            completed: completedMaps.includes(m.id),
            thumb: 'points' in m ? <LineThumb points={m.points} widthMm={m.widthMm} heightMm={m.heightMm} /> : <MazeThumb rows={m.rows} />,
          }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">My Maps</h3>
        {myMaps.length > 0 ? (
          <MapDropdown
            value={myMapsIsSelected ? mapId : ''}
            onChange={selectMap}
            placeholder="Choose a map"
            options={myMaps.map((m) => {
              const runtimeId = toCustomRuntimeId(m.id);
              return {
                id: runtimeId,
                name: m.name,
                completed: completedMaps.includes(runtimeId),
                thumb: m.mode === 'line' ? <CustomLineThumb map={m} /> : <MazeThumb rows={m.rows} />,
              };
            })}
          />
        ) : (
          <p className="px-1 text-xs text-neutral-500">No custom maps yet.</p>
        )}
        <Link
          to={`/editor/${mode}/new`}
          state={{ from: 'simulator' }}
          className="mt-0.5 rounded-md bg-sky-600 px-3 py-1.5 text-center text-sm font-semibold text-white hover:bg-sky-500"
        >
          + New {mode === 'line' ? 'Line Track' : 'Maze'}
        </Link>
      </div>
    </div>
  );
}
