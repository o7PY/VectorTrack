import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlgorithmImportError, exportAlgorithm, exportAllAlgorithms, parseImportedAlgorithms, slugify } from '../algorithms/custom/codec';
import { starterTemplatesForMode } from '../algorithms/custom/starterTemplates';
import type { CustomAlgorithm, CustomSensorLayout } from '../algorithms/custom/types';
import {
  AlgorithmQuotaError,
  deleteCustomAlgorithm,
  getCustomSensorLayout,
  listCustomAlgorithms,
  listCustomSensorLayouts,
  loadCustomAlgorithmStore,
  saveCustomAlgorithmStore,
  upsertCustomAlgorithm,
  upsertCustomSensorLayout,
} from '../store/customAlgorithms';
import { isSensorLayoutRuntimeId, toBareSensorLayoutId, toVtlRuntimeId } from '../store/customAlgorithmResolvers';
import { useStore } from '../store/useStore';
import Logo from '../ui/Logo';

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function importWithFreshIds(parsed: CustomAlgorithm[]): void {
  const store = loadCustomAlgorithmStore();
  const existingNames = new Set(Object.values(store.algorithms).map((a) => a.name));
  let working = store;
  const now = new Date().toISOString();
  for (const a of parsed) {
    let name = a.name;
    let suffix = 2;
    while (existingNames.has(name)) name = `${a.name} (${suffix++})`;
    existingNames.add(name);
    const fresh: CustomAlgorithm = { ...a, id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    working = upsertCustomAlgorithm(working, fresh);
  }
  saveCustomAlgorithmStore(working);
}

/** Mirrors importWithFreshIds — same fresh-id/name-dedup treatment, for the codec's optional embedded `sensorLayout(s)`. */
function importSensorLayoutsWithFreshIds(parsed: CustomSensorLayout[]): void {
  const store = loadCustomAlgorithmStore();
  const existingNames = new Set(Object.values(store.sensorLayouts).map((l) => l.name));
  let working = store;
  const now = new Date().toISOString();
  for (const l of parsed) {
    let name = l.name;
    let suffix = 2;
    while (existingNames.has(name)) name = `${l.name} (${suffix++})`;
    existingNames.add(name);
    const fresh: CustomSensorLayout = { ...l, id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    working = upsertCustomSensorLayout(working, fresh);
  }
  saveCustomAlgorithmStore(working);
}

/** The layout actually active for `mode` in the simulator right now, if it's a saved custom one — the closest honest answer to "which sensor layout does this algorithm belong with" (there's no stored algorithm<->layout link). */
function currentCustomSensorLayoutFor(mode: 'line' | 'maze'): CustomSensorLayout | undefined {
  const { mode: activeMode, layoutId } = useStore.getState();
  if (activeMode !== mode || !isSensorLayoutRuntimeId(layoutId)) return undefined;
  return getCustomSensorLayout(loadCustomAlgorithmStore(), toBareSensorLayoutId(layoutId));
}

/** Under "+ New" — filtered to the active tab's mode, per Algorithms.md §5.3. */
function NewAlgorithmMenu({ mode, onPick }: { mode: 'line' | 'maze'; onPick: (source: string, name: string) => void }) {
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

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
      >
        + New
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-56 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 shadow-xl">
          {starterTemplatesForMode(mode).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                onPick(t.source, t.name);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-neutral-100 hover:bg-neutral-800"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AlgorithmsPage() {
  const navigate = useNavigate();
  const [algorithms, setAlgorithms] = useState<CustomAlgorithm[]>(() => listCustomAlgorithms(loadCustomAlgorithmStore()));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'line' | 'maze'>('line');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setAlgorithms(listCustomAlgorithms(loadCustomAlgorithmStore()));
  }

  function goEdit(algorithm: CustomAlgorithm) {
    // Editing itself lives in the simulator's code panel (Algorithms.md §3.1, Phase I) — this page
    // only manages the collection. The runtime id in the query string is the hook Phase I's panel
    // will read on mount to auto-select this algorithm.
    navigate(`/simulator?algorithm=${encodeURIComponent(toVtlRuntimeId(algorithm.id))}`);
  }

  function handleCreate(source: string, name: string) {
    const now = new Date().toISOString();
    const algorithm: CustomAlgorithm = {
      id: crypto.randomUUID(),
      name,
      mode: activeTab,
      source,
      createdAt: now,
      updatedAt: now,
      lastCompile: null,
    };
    try {
      saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), algorithm));
      refresh();
      goEdit(algorithm);
    } catch (err) {
      setImportError(err instanceof AlgorithmQuotaError ? err.message : 'Failed to create algorithm.');
    }
  }

  function handleDuplicate(algorithm: CustomAlgorithm) {
    const now = new Date().toISOString();
    const copy: CustomAlgorithm = { ...algorithm, id: crypto.randomUUID(), name: `${algorithm.name} copy`, createdAt: now, updatedAt: now };
    try {
      saveCustomAlgorithmStore(upsertCustomAlgorithm(loadCustomAlgorithmStore(), copy));
      refresh();
    } catch (err) {
      setImportError(err instanceof AlgorithmQuotaError ? err.message : 'Failed to duplicate.');
    }
  }

  function handleDelete(id: string) {
    saveCustomAlgorithmStore(deleteCustomAlgorithm(loadCustomAlgorithmStore(), id));
    setConfirmDeleteId(null);
    refresh();
  }

  function handleExportOne(algorithm: CustomAlgorithm) {
    const sensorLayout = currentCustomSensorLayoutFor(algorithm.mode);
    downloadJson(`${slugify(algorithm.name)}.vectortrack-algorithm.json`, exportAlgorithm(algorithm, sensorLayout));
  }

  function handleExportAll() {
    const sensorLayouts = listCustomSensorLayouts(loadCustomAlgorithmStore());
    downloadJson('vectortrack-algorithms.vectortrack-algorithm.json', exportAllAlgorithms(algorithms, sensorLayouts));
  }

  async function handleImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const text = await files[0].text();
      const parsed = parseImportedAlgorithms(JSON.parse(text));
      importWithFreshIds(parsed.algorithms);
      if (parsed.sensorLayouts.length > 0) importSensorLayoutsWithFreshIds(parsed.sensorLayouts);
      setImportError(null);
      setImportNotice(
        parsed.sensorLayouts.length > 0
          ? `Imported, including ${parsed.sensorLayouts.length} sensor layout${parsed.sensorLayouts.length > 1 ? 's' : ''} — open Sensors in the simulator to select ${parsed.sensorLayouts.length > 1 ? 'them' : 'it'}.`
          : null,
      );
      refresh();
    } catch (err) {
      setImportNotice(null);
      setImportError(
        err instanceof AlgorithmImportError ? err.message : 'Could not read that file — is it a VectorTrack algorithm export?',
      );
    }
  }

  return (
    <div
      className="flex min-h-screen w-screen flex-col bg-neutral-950 text-neutral-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handleImportFiles(e.dataTransfer.files);
      }}
    >
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-base font-bold tracking-tight hover:text-sky-400">
            <Logo className="h-6 w-6 rounded-md" />
            VectorTrack
          </Link>
          <Link to="/simulator" className="text-sm text-neutral-400 hover:text-neutral-100">
            Simulator
          </Link>
          <Link to="/editor" className="text-sm text-neutral-400 hover:text-neutral-100">
            Map Maker
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">My Algorithms</h1>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => void handleImportFiles(e.target.files)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-700"
            >
              Import
            </button>
            <button
              onClick={handleExportAll}
              disabled={algorithms.length === 0}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-700 disabled:opacity-40"
            >
              Export all
            </button>
          </div>
        </div>

        {importError && <p className="text-sm text-red-400">{importError}</p>}
        {importNotice && <p className="text-sm text-emerald-400">{importNotice}</p>}

        <div className="flex items-center gap-2">
          <NewAlgorithmMenu mode={activeTab} onPick={handleCreate} />
        </div>

        <p className="-mt-2 text-xs text-neutral-500">
          Or write one with an AI instead of the built-in templates —{' '}
          <a
            href="/VectorTrack/skills/vectortrack-algorithm-author/SKILL.md"
            download
            className="text-sky-400 hover:underline"
          >
            download the VTL algorithm-author reference (SKILL.md)
          </a>
          , hand it to Claude or another model, then import the result below.
        </p>

        <div className="border-t border-neutral-800" />

        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('line')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'line' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            Line Follower
          </button>
          <button
            onClick={() => setActiveTab('maze')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'maze' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            Maze Solver
          </button>
        </div>

        {algorithms.filter((a) => a.mode === activeTab).length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">
            No custom {activeTab === 'maze' ? 'maze solvers' : 'line followers'} yet — create one above, or drag a{' '}
            <code>.vectortrack-algorithm.json</code> file here to import one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {algorithms
              .filter((a) => a.mode === activeTab)
              .map((algorithm) => (
                <li
                  key={algorithm.id}
                  className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2.5"
                >
                  <span className="shrink-0 text-lg">{algorithm.mode === 'maze' ? '▦' : '⟿'}</span>
                  <button onClick={() => goEdit(algorithm)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-neutral-100">{algorithm.name}</div>
                    <div className="truncate text-xs text-neutral-500">
                      updated {new Date(algorithm.updatedAt).toLocaleDateString()}
                      {algorithm.lastCompile && !algorithm.lastCompile.ok && (
                        <span className="ml-2 text-red-400">· compile error</span>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => goEdit(algorithm)}
                      className="rounded-md border border-sky-700 bg-sky-950/30 px-2 py-1 text-xs text-sky-300 hover:border-sky-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDuplicate(algorithm)}
                      className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-700"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => handleExportOne(algorithm)}
                      className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-700"
                    >
                      Export
                    </button>
                    {confirmDeleteId === algorithm.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(algorithm.id)}
                          className="rounded-md border border-red-800 bg-red-950/40 px-2 py-1 text-xs text-red-300"
                        >
                          Confirm delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(algorithm.id)}
                        className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:border-red-800 hover:text-red-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </main>
    </div>
  );
}
