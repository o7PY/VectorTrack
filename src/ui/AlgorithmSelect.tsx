import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { lineAlgorithms, mazeAlgorithms } from '../algorithms/registry';
import { toVtlRuntimeId } from '../store/customAlgorithmResolvers';
import { listCustomAlgorithms, loadCustomAlgorithmStore } from '../store/customAlgorithms';

/**
 * Custom-rendered dropdown (not a native <select>) grouping built-in algorithms above a
 * "My Algorithms" section for `vtl:${id}` ones — same popover treatment as `MapList.tsx`'s
 * `MapDropdown` (Algorithms.md §6), collapsed into one control since this field sits in a
 * single-line row of the sidebar rather than the Map Maker's full-width list.
 */
export function AlgorithmSelect() {
  const mode = useStore((s) => s.mode);
  const algorithmId = useStore((s) => s.algorithmId);
  const selectAlgorithm = useStore((s) => s.selectAlgorithm);

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

  const builtIns = mode === 'line' ? lineAlgorithms : mazeAlgorithms;
  // Custom algorithms only change via the in-simulator code panel or /algorithms (both full
  // re-renders away from here), so re-reading localStorage on every render — rather than caching
  // in state — is simplest and always fresh.
  const myAlgorithms = listCustomAlgorithms(loadCustomAlgorithmStore())
    .filter((a) => a.mode === mode)
    .map((a) => ({ id: toVtlRuntimeId(a.id), name: a.name, broken: a.lastCompile?.ok === false }));

  const selectedBuiltIn = builtIns.find((a) => a.id === algorithmId);
  const selectedCustom = myAlgorithms.find((a) => a.id === algorithmId);
  const selectedName = selectedBuiltIn?.name ?? selectedCustom?.name ?? 'Choose an algorithm';

  function pick(id: string) {
    selectAlgorithm(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-left hover:border-neutral-700"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">{selectedName}</span>
        {selectedCustom?.broken && (
          <span title="This algorithm's source doesn't compile" className="shrink-0 text-xs text-amber-400">
            ⚠
          </span>
        )}
        <span className="shrink-0 text-neutral-500">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto scroll-thin rounded-md border border-neutral-800 bg-neutral-900 shadow-xl">
          <h3 className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Built-in</h3>
          {builtIns.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a.id)}
              className={`flex w-full items-center px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-800 ${
                a.id === algorithmId ? 'bg-sky-950/40 text-neutral-100' : 'text-neutral-300'
              }`}
            >
              {a.name}
            </button>
          ))}
          <h3 className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">My Algorithms</h3>
          {myAlgorithms.length > 0 ? (
            myAlgorithms.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pick(a.id)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-800 ${
                  a.id === algorithmId ? 'bg-sky-950/40 text-neutral-100' : 'text-neutral-300'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {a.broken && (
                  <span title="This algorithm's source doesn't compile" className="shrink-0 text-xs text-amber-400">
                    ⚠
                  </span>
                )}
              </button>
            ))
          ) : (
            <p className="px-2 pb-2 text-xs text-neutral-500">No custom algorithms yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
