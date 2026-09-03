import { useState } from 'react';

export interface SizePreset {
  label: string;
  cols: number;
  rows: number;
}

export interface CellSizePreset {
  label: string;
  mm: number;
}

interface Props {
  title: string;
  description: string;
  sizePresets: SizePreset[];
  /** Omit to skip the "Cell resolution" question entirely and use defaultCellSizeMm instead. */
  cellSizePresets?: CellSizePreset[];
  defaultCellSizeMm?: number;
  onConfirm: (cols: number, rows: number, cellSizeMm: number) => void;
  onClose: () => void;
}

/** Shown once, before a brand-new map is created, so the author picks a canvas size (and, when offered, a cell resolution) up front instead of being stuck with a fixed default. Used by both the line and maze editors. */
export function NewMapSizeDialog({ title, description, sizePresets, cellSizePresets, defaultCellSizeMm, onConfirm, onClose }: Props) {
  const [sizeIdx, setSizeIdx] = useState(Math.min(1, sizePresets.length - 1));
  const [cellIdx, setCellIdx] = useState(Math.min(1, (cellSizePresets?.length ?? 1) - 1));

  const size = sizePresets[sizeIdx];
  const cellMm = cellSizePresets ? cellSizePresets[cellIdx].mm : (defaultCellSizeMm ?? 180);
  const widthMm = size.cols * cellMm;
  const heightMm = size.rows * cellMm;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-md p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        >
          ✕
        </button>
        <h2 className="pr-6 text-base font-semibold text-neutral-100">{title}</h2>
        <p className="mt-1 text-sm text-neutral-400">{description}</p>

        <div className="mt-4 flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Canvas size</h3>
          <div className="flex flex-wrap gap-1.5">
            {sizePresets.map((p, i) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setSizeIdx(i)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  i === sizeIdx
                    ? 'border-sky-600 bg-sky-950/40 text-sky-300'
                    : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {cellSizePresets && (
          <div className="mt-4 flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Cell resolution</h3>
            <div className="flex flex-wrap gap-1.5">
              {cellSizePresets.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setCellIdx(i)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    i === cellIdx
                      ? 'border-sky-600 bg-sky-950/40 text-sky-300'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          {size.cols}×{size.rows} cells — {widthMm}×{heightMm}mm. You can zoom in on the canvas afterward for finer editing.
        </p>

        <button
          type="button"
          onClick={() => onConfirm(size.cols, size.rows, cellMm)}
          className="mt-4 w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
        >
          Create
        </button>
      </div>
    </div>
  );
}
