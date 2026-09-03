import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapImportError, exportAllMaps, exportMap, parseImportedMaps, slugify } from '../maps/custom/codec';
import type { CustomMap } from '../maps/custom/types';
import {
  deleteCustomMap,
  loadCustomMapStore,
  saveCustomMapStore,
  upsertCustomMap,
  listCustomMaps,
} from '../store/customMaps';
import { MapQuotaError } from '../store/customMaps';
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

function importWithFreshIds(parsed: CustomMap[]): void {
  const store = loadCustomMapStore();
  const existingNames = new Set(Object.values(store.maps).map((m) => m.name));
  let working = store;
  const now = new Date().toISOString();
  for (const m of parsed) {
    let name = m.name;
    let suffix = 2;
    while (existingNames.has(name)) name = `${m.name} (${suffix++})`;
    existingNames.add(name);
    const fresh: CustomMap = { ...m, id: crypto.randomUUID(), name, createdAt: now, updatedAt: now };
    working = upsertCustomMap(working, fresh);
  }
  saveCustomMapStore(working);
}

export default function EditorPage() {
  const navigate = useNavigate();
  const [maps, setMaps] = useState<CustomMap[]>(() => listCustomMaps(loadCustomMapStore()));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'maze' | 'line'>('maze');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setMaps(listCustomMaps(loadCustomMapStore()));
  }

  function handleDuplicate(map: CustomMap) {
    const now = new Date().toISOString();
    const copy: CustomMap = { ...map, id: crypto.randomUUID(), name: `${map.name} copy`, createdAt: now, updatedAt: now };
    try {
      saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), copy));
      refresh();
    } catch (err) {
      setImportError(err instanceof MapQuotaError ? err.message : 'Failed to duplicate.');
    }
  }

  function handleDelete(id: string) {
    saveCustomMapStore(deleteCustomMap(loadCustomMapStore(), id));
    setConfirmDeleteId(null);
    refresh();
  }

  function handleExportOne(map: CustomMap) {
    downloadJson(`${slugify(map.name)}.vectortrack.json`, exportMap(map));
  }

  function handleExportAll() {
    downloadJson('vectortrack-maps.vectortrack.json', exportAllMaps(maps));
  }

  async function handleImportFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const text = await files[0].text();
      const parsed = parseImportedMaps(JSON.parse(text));
      importWithFreshIds(parsed);
      setImportError(null);
      refresh();
    } catch (err) {
      setImportError(err instanceof MapImportError ? err.message : 'Could not read that file — is it a VectorTrack map export?');
    }
  }

  function handleOpen(map: CustomMap) {
    navigate(`/editor/${map.mode}/${map.id}`);
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
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">My Maps</h1>
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
              disabled={maps.length === 0}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-700 disabled:opacity-40"
            >
              Export all
            </button>
          </div>
        </div>

        {importError && <p className="text-sm text-red-400">{importError}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => navigate('/editor/maze/new')}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            + New Maze
          </button>
          <button
            onClick={() => navigate('/editor/line/new')}
            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
          >
            + New Line Track
          </button>
        </div>

        <p className="-mt-2 text-xs text-neutral-500">
          Or skip the canvas and let an AI build one from a description —{' '}
          <a
            href="/VectorTrack/skills/vectortrack-map-generator/SKILL.md"
            download
            className="text-sky-400 hover:underline"
          >
            download the map-generator reference (SKILL.md)
          </a>
          , hand it to Claude or another model, then import the result below.
        </p>

        <div className="border-t border-neutral-800" />

        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('maze')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'maze' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            Maze Maps
          </button>
          <button
            onClick={() => setActiveTab('line')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'line' ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            Line Tracks
          </button>
        </div>

        {maps.filter((m) => m.mode === activeTab).length === 0 ? (
          <p className="mt-1 text-sm text-neutral-500">
            No custom {activeTab === 'maze' ? 'mazes' : 'line tracks'} yet — create one above, or drag a{' '}
            <code>.vectortrack.json</code> file here to import one.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {maps.filter((m) => m.mode === activeTab).map((map) => (
              <li
                key={map.id}
                className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2.5"
              >
                <span className="shrink-0 text-lg">{map.mode === 'maze' ? '▦' : '⟿'}</span>
                <button onClick={() => handleOpen(map)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium text-neutral-100">{map.name}</div>
                  <div className="truncate text-xs text-neutral-500">
                    {map.mode === 'maze' ? `${map.rows}×${map.cols} maze` : `${map.rows}×${map.cols} line grid`} · updated{' '}
                    {new Date(map.updatedAt).toLocaleDateString()}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => handleOpen(map)}
                    className="rounded-md border border-sky-700 bg-sky-950/30 px-2 py-1 text-xs text-sky-300 hover:border-sky-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(map)}
                    className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-700"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleExportOne(map)}
                    className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-700"
                  >
                    Export
                  </button>
                  {confirmDeleteId === map.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(map.id)}
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
                      onClick={() => setConfirmDeleteId(map.id)}
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
