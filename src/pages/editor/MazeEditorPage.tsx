import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { MazeDraft } from '../../editor/maze/draft';
import { createDefaultMazeDraft, customMapToMazeDraft, mazeDraftToCustomMap } from '../../editor/maze/draft';
import { MazeLatticeCanvas } from '../../editor/maze/MazeLatticeCanvas';
import type { UndoStack } from '../../editor/shell/undoStack';
import { createUndoStack } from '../../editor/shell/undoStack';
import type { SizePreset } from '../../editor/shell/NewMapSizeDialog';
import { NewMapSizeDialog } from '../../editor/shell/NewMapSizeDialog';
import type { MazeValidationIssue } from '../../editor/validation/mazeRules';
import { validateMazePhysical, validateMazeStatic } from '../../editor/validation/mazeRules';
import { addRandomLoops, generatePerfectMaze } from '../../maps/maze/generator';
import { toCustomRuntimeId } from '../../maps/custom/toRuntimeMap';
import { getMazeRobot, mazeRobots } from '../../robots/definitions';
import { cellsToWallGrid, createBorderOnlyWallGrid, createWallGrid, wallGridToCells } from '../../sim/maze/wallGrid';
import { MapQuotaError, getCustomMap, loadCustomMapStore, saveCustomMapStore, upsertCustomMap } from '../../store/customMaps';
import { useStore } from '../../store/useStore';
import Logo from '../../ui/Logo';
import { FlagIcon, RedoIcon, ShuffleIcon, TargetIcon, TrashIcon, UndoIcon, WallIcon } from '../../editor/icons';

type PlaceMode = 'walls' | 'start' | 'goal';

const SIZE_PRESETS: SizePreset[] = [
  { label: 'Small (8×8)', cols: 8, rows: 8 },
  { label: 'Medium (12×12)', cols: 12, rows: 12 },
  { label: 'Large (16×16)', cols: 16, rows: 16 },
  { label: 'Huge (20×20)', cols: 20, rows: 20 },
];

const DEFAULT_CELL_SIZE_MM = 180;

function loadInitialDraft(id: string | undefined): MazeDraft {
  if (id && id !== 'new') {
    const existing = getCustomMap(loadCustomMapStore(), id);
    if (existing && existing.mode === 'maze') return customMapToMazeDraft(existing);
  }
  return createDefaultMazeDraft(crypto.randomUUID());
}

function ToolButton({
  active,
  onClick,
  icon,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? 'border-sky-600 bg-sky-950/40 text-sky-300' : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

const SEVERITY_STYLE: Record<MazeValidationIssue['severity'], string> = {
  error: 'border-red-900 bg-red-950/40 text-red-300',
  warning: 'border-amber-900 bg-amber-950/30 text-amber-300',
  info: 'border-neutral-800 bg-neutral-900 text-neutral-400',
};

export default function MazeEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id || id === 'new';
  const cameFromSimulator = (location.state as { from?: string } | null)?.from === 'simulator';

  const [draft, setDraft] = useState<MazeDraft>(() => loadInitialDraft(id));
  const [sizeConfirmed, setSizeConfirmed] = useState(!isNew);
  const undoRef = useRef<UndoStack<MazeDraft> | null>(null);
  if (undoRef.current === null) undoRef.current = createUndoStack(structuredClone(draft));
  // Placement (start/goal) updates draft immutably via setDraft, which doesn't
  // land until after this event handler returns — onGestureEnd (called
  // synchronously right after onPlaceStart/onPlaceGoal) needs the value that
  // was just computed, not the one-render-stale `draft` closure variable, so
  // it's handed off here rather than re-read from state.
  const pendingCommitRef = useRef<MazeDraft | null>(null);

  const [placeMode, setPlaceMode] = useState<PlaceMode>('walls');
  const [name, setName] = useState(draft.name);
  const [validationRobotId, setValidationRobotId] = useState(draft.validationRobotId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [issues, setIssues] = useState<MazeValidationIssue[]>([]);

  function handleConfirmSize(cols: number, rows: number, cellSizeMm: number) {
    const fresh = createDefaultMazeDraft(draft.id, rows, cols, cellSizeMm);
    undoRef.current = createUndoStack(structuredClone(fresh));
    setDraft(fresh);
    setName(fresh.name);
    setSizeConfirmed(true);
  }

  // The child canvas mutates draft.wallGrid/start/goal in place for
  // performance (see editor/maze/draft.ts); "commit" always re-derives a
  // fresh top-level wrapper so React notices the change, but nested objects
  // keep their identity across gestures, which is what lets onGestureEnd
  // below safely snapshot "whatever the live draft currently holds" even
  // when called from a slightly stale render closure.
  function commitMutation(mutate: (d: MazeDraft) => void) {
    mutate(draft);
    const next = { ...draft };
    undoRef.current!.push(structuredClone(next));
    setDraft(next);
  }

  function handleUndo() {
    const prev = undoRef.current!.undo();
    if (!prev) return;
    const restored = structuredClone(prev);
    setName(restored.name);
    setDraft(restored);
  }

  function handleRedo() {
    const next = undoRef.current!.redo();
    if (!next) return;
    const restored = structuredClone(next);
    setName(restored.name);
    setDraft(restored);
  }

  function handleFillAll() {
    commitMutation((d) => {
      d.wallGrid = createWallGrid(d.rows, d.cols, true);
    });
  }

  function handleClearInterior() {
    commitMutation((d) => {
      d.wallGrid = createBorderOnlyWallGrid(d.rows, d.cols);
    });
  }

  function handleGenerateRandom() {
    commitMutation((d) => {
      const seed = Math.floor(Math.random() * 1e9);
      const cells = generatePerfectMaze(d.rows, d.cols, seed);
      addRandomLoops(cells, d.rows, d.cols, seed + 1, Math.max(1, Math.floor((d.rows * d.cols) / 12)));
      d.wallGrid = cellsToWallGrid(cells, d.rows, d.cols);
    });
  }

  function handleRotateStart() {
    commitMutation((d) => {
      d.start.headingDeg = (d.start.headingDeg + 90) % 360;
    });
  }

  function handleToggleGoalSize() {
    commitMutation((d) => {
      const size = d.goal.width === 1 ? 2 : 1;
      d.goal.width = size;
      d.goal.height = size;
      d.goal.row = Math.min(d.goal.row, d.rows - size);
      d.goal.col = Math.min(d.goal.col, d.cols - size);
    });
  }

  function handlePlaceStart(row: number, col: number) {
    const next: MazeDraft = { ...draft, start: { ...draft.start, row, col } };
    pendingCommitRef.current = next;
    setDraft(next);
  }

  function handlePlaceGoal(row: number, col: number) {
    const g = draft.goal;
    const next: MazeDraft = {
      ...draft,
      goal: { ...g, row: Math.min(row, draft.rows - g.height), col: Math.min(col, draft.cols - g.width) },
    };
    pendingCommitRef.current = next;
    setDraft(next);
  }

  function handleWallsChanged() {
    setDraft((d) => ({ ...d }));
  }

  function handleGestureEnd() {
    const toCommit = pendingCommitRef.current ?? draft;
    undoRef.current!.push(structuredClone(toCommit));
    pendingCommitRef.current = null;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const cells = wallGridToCells(draft.wallGrid);
      const robot = getMazeRobot(validationRobotId);
      const staticIssues = validateMazeStatic({
        rows: draft.rows,
        cols: draft.cols,
        cellSizeMm: draft.cellSizeMm,
        wallThicknessMm: draft.wallThicknessMm,
        cells,
        start: draft.start,
        goal: draft.goal,
      });
      const physicalIssues = validateMazePhysical(draft.cellSizeMm, draft.wallThicknessMm, {
        chassisWidthMm: robot.chassisWidthMm,
        sensorRangeMm: robot.sensorRange,
      });
      setIssues([...staticIssues, ...physicalIssues]);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, validationRobotId]);

  function trySave(): MazeDraft | null {
    const finalDraft: MazeDraft = { ...draft, name, validationRobotId };
    const cells = wallGridToCells(finalDraft.wallGrid);
    const robot = getMazeRobot(validationRobotId);
    const allIssues = [
      ...validateMazeStatic({
        rows: finalDraft.rows,
        cols: finalDraft.cols,
        cellSizeMm: finalDraft.cellSizeMm,
        wallThicknessMm: finalDraft.wallThicknessMm,
        cells,
        start: finalDraft.start,
        goal: finalDraft.goal,
      }),
      ...validateMazePhysical(finalDraft.cellSizeMm, finalDraft.wallThicknessMm, {
        chassisWidthMm: robot.chassisWidthMm,
        sensorRangeMm: robot.sensorRange,
      }),
    ];
    const errors = allIssues.filter((i) => i.severity === 'error').map((i) => i.code);
    const warnings = allIssues.filter((i) => i.severity === 'warning').map((i) => i.code);
    if (errors.length > 0) {
      setSaveError(`Cannot save — fix ${errors.join(', ')} first.`);
      return null;
    }

    const map = mazeDraftToCustomMap(finalDraft);
    map.lastValidation = { ranAt: new Date().toISOString(), trials: [], errors, warnings };
    try {
      saveCustomMapStore(upsertCustomMap(loadCustomMapStore(), map));
      setDraft(finalDraft);
      setSaveError(null);
      setSavedAt(new Date().toLocaleTimeString());
      return finalDraft;
    } catch (err) {
      setSaveError(err instanceof MapQuotaError ? err.message : 'Failed to save.');
      return null;
    }
  }

  function handleSave() {
    const saved = trySave();
    if (saved && isNew) navigate(`/editor/maze/${saved.id}`, { replace: true });
  }

  function handleSimulate() {
    const saved = trySave();
    if (!saved) return;
    const store = useStore.getState();
    store.selectMode('maze');
    store.selectMap(toCustomRuntimeId(saved.id));
    navigate('/simulator');
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
      {!sizeConfirmed && (
        <NewMapSizeDialog
          title="New maze"
          description="Pick a grid size. You can zoom in on the canvas afterward for finer editing."
          sizePresets={SIZE_PRESETS}
          defaultCellSizeMm={DEFAULT_CELL_SIZE_MM}
          onConfirm={handleConfirmSize}
          onClose={() => navigate(cameFromSimulator ? '/simulator' : '/editor')}
        />
      )}
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-base font-bold tracking-tight hover:text-sky-400">
            <Logo className="h-6 w-6 rounded-md" />
            VectorTrack
          </Link>
          <Link to="/editor" className="text-sm text-neutral-400 hover:text-neutral-100">
            My Maps
          </Link>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={48}
          placeholder="Maze name"
          className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto scroll-thin border-r border-neutral-800 bg-neutral-900/40 p-3">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Place</h2>
            <div className="flex flex-wrap gap-1.5">
              <ToolButton active={placeMode === 'walls'} onClick={() => setPlaceMode('walls')} icon={<WallIcon />}>
                Walls
              </ToolButton>
              <ToolButton active={placeMode === 'start'} onClick={() => setPlaceMode('start')} icon={<FlagIcon />}>
                Start
              </ToolButton>
              <ToolButton active={placeMode === 'goal'} onClick={() => setPlaceMode('goal')} icon={<TargetIcon />}>
                Goal
              </ToolButton>
            </div>
            {placeMode === 'start' && (
              <ToolButton onClick={handleRotateStart}>Rotate start ({draft.start.headingDeg}°)</ToolButton>
            )}
            {placeMode === 'goal' && (
              <ToolButton onClick={handleToggleGoalSize}>
                Goal size: {draft.goal.width}×{draft.goal.height}
              </ToolButton>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Walls</h2>
            <div className="flex flex-wrap gap-1.5">
              <ToolButton onClick={handleFillAll} icon={<WallIcon />}>
                Fill all
              </ToolButton>
              <ToolButton onClick={handleClearInterior} icon={<TrashIcon />}>
                Clear interior
              </ToolButton>
              <ToolButton onClick={handleGenerateRandom} icon={<ShuffleIcon />}>
                Generate random
              </ToolButton>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Edit</h2>
            <div className="flex flex-wrap gap-1.5">
              <ToolButton onClick={handleUndo} icon={<UndoIcon />}>
                Undo
              </ToolButton>
              <ToolButton onClick={handleRedo} icon={<RedoIcon />}>
                Redo
              </ToolButton>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Validate for</h2>
            <select
              value={validationRobotId}
              onChange={(e) => setValidationRobotId(e.target.value)}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
            >
              {mazeRobots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Validation {issues.length > 0 ? `(${issues.length})` : ''}
            </h2>
            {issues.length === 0 ? (
              <p className="text-xs text-neutral-500">No issues found.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {issues.map((issue, i) => (
                  <li key={`${issue.code}-${i}`} className={`rounded-md border px-2 py-1.5 text-xs ${SEVERITY_STYLE[issue.severity]}`}>
                    <span className="font-semibold">{issue.code}</span> — {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-auto flex flex-col gap-1.5">
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            {savedAt && !saveError && <p className="text-xs text-emerald-400">Saved at {savedAt}</p>}
            <div className="flex gap-1.5">
              <button
                onClick={handleSave}
                className="flex-1 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
              >
                Save
              </button>
              <button
                onClick={handleSimulate}
                className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-100 hover:border-neutral-600"
              >
                Save &amp; Simulate
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-black">
          <MazeLatticeCanvas
            draft={draft}
            placeMode={placeMode}
            onWallsChanged={handleWallsChanged}
            onGestureEnd={handleGestureEnd}
            onPlaceStart={handlePlaceStart}
            onPlaceGoal={handlePlaceGoal}
          />
        </main>
      </div>
    </div>
  );
}
