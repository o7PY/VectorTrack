import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { LineDraft } from '../../editor/line/draft';
import { createDefaultLineDraft, customMapToLineDraft, lineDraftToCustomMap } from '../../editor/line/draft';
import type { LineTool } from '../../editor/line/PaintCanvas';
import { PaintCanvas } from '../../editor/line/PaintCanvas';
import { createEmptyPaintBits } from '../../editor/line/paint';
import type { UndoStack } from '../../editor/shell/undoStack';
import { createUndoStack } from '../../editor/shell/undoStack';
import type { SizePreset, CellSizePreset } from '../../editor/shell/NewMapSizeDialog';
import { NewMapSizeDialog } from '../../editor/shell/NewMapSizeDialog';
import type { LineValidationIssue } from '../../editor/validation/lineRules';
import { validateLineStatic } from '../../editor/validation/lineRules';
import { toCustomRuntimeId } from '../../maps/custom/toRuntimeMap';
import { lineRobots } from '../../robots/definitions';
import { MapQuotaError, getCustomMap, loadCustomMapStore, saveCustomMapStore, upsertCustomMap } from '../../store/customMaps';
import { useStore } from '../../store/useStore';
import Logo from '../../ui/Logo';
import {
  EllipseIcon,
  EraserIcon,
  FlagIcon,
  GridIcon,
  LineToolIcon,
  PencilIcon,
  RectangleIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from '../../editor/icons';

// Sized so a Medium track at Standard resolution lands around 2200x1400mm —
// the same ballpark as the built-in tracks (2000x1200 to 2400x1500mm). The
// old presets (20x14 up to 40x26) produced tracks as small as 400x280mm,
// which made every robot (70-100mm chassis) look comically oversized.
const SIZE_PRESETS: SizePreset[] = [
  { label: 'Small (80×50)', cols: 80, rows: 50 },
  { label: 'Medium (110×70)', cols: 110, rows: 70 },
  { label: 'Large (140×90)', cols: 140, rows: 90 },
];

const CELL_SIZE_PRESETS: CellSizePreset[] = [
  { label: 'Fine (10mm)', mm: 10 },
  { label: 'Standard (20mm)', mm: 20 },
  { label: 'Coarse (30mm)', mm: 30 },
];

function loadInitialDraft(id: string | undefined): LineDraft {
  if (id && id !== 'new') {
    const existing = getCustomMap(loadCustomMapStore(), id);
    if (existing && existing.mode === 'line') return customMapToLineDraft(existing);
  }
  return createDefaultLineDraft(crypto.randomUUID());
}

/** maxGapMm is the max painted-track gap that still counts as one connected loop (MapMaker.md LF003/LF004). */
function clearanceParamsFor(): { maxGapMm: number } {
  return { maxGapMm: 200 };
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

const SEVERITY_STYLE: Record<LineValidationIssue['severity'], string> = {
  error: 'border-red-900 bg-red-950/40 text-red-300',
  warning: 'border-amber-900 bg-amber-950/30 text-amber-300',
  info: 'border-neutral-800 bg-neutral-900 text-neutral-400',
};

export default function LineEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = !id || id === 'new';
  const cameFromSimulator = (location.state as { from?: string } | null)?.from === 'simulator';

  const [draft, setDraft] = useState<LineDraft>(() => loadInitialDraft(id));
  const [sizeConfirmed, setSizeConfirmed] = useState(!isNew);
  const undoRef = useRef<UndoStack<LineDraft> | null>(null);
  if (undoRef.current === null) undoRef.current = createUndoStack(structuredClone(draft));
  const pendingCommitRef = useRef<LineDraft | null>(null);

  const [tool, setTool] = useState<LineTool>('pencil');
  const [brushWidthCells, setBrushWidthCells] = useState(2);
  const [showGrid, setShowGrid] = useState(true);
  const [name, setName] = useState(draft.name);
  const [validationRobotId, setValidationRobotId] = useState(draft.validationRobotId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [issues, setIssues] = useState<LineValidationIssue[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  function handleConfirmSize(cols: number, rows: number, cellSizeMm: number) {
    const fresh = createDefaultLineDraft(draft.id, cols, rows, cellSizeMm);
    undoRef.current = createUndoStack(structuredClone(fresh));
    setDraft(fresh);
    setName(fresh.name);
    setSizeConfirmed(true);
  }

  function commitMutation(mutate: (d: LineDraft) => void) {
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

  function handleClear() {
    commitMutation((d) => {
      d.bits = createEmptyPaintBits(d.cols, d.rows);
      d.start = null;
    });
    setConfirmClear(false);
  }

  function handleRotateStart() {
    commitMutation((d) => {
      if (!d.start) return;
      d.start.headingDeg = (d.start.headingDeg + 45) % 360;
    });
  }

  function handlePlaceStart(xMm: number, yMm: number) {
    const next: LineDraft = { ...draft, start: { xMm, yMm, headingDeg: draft.start?.headingDeg ?? 0 } };
    pendingCommitRef.current = next;
    setDraft(next);
  }

  function handleChanged() {
    setDraft((d) => ({ ...d }));
  }

  function handleGestureEnd() {
    const toCommit = pendingCommitRef.current ?? draft;
    undoRef.current!.push(structuredClone(toCommit));
    pendingCommitRef.current = null;
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const { maxGapMm } = clearanceParamsFor();
      setIssues(
        validateLineStatic({
          cols: draft.cols,
          rows: draft.rows,
          cellSizeMm: draft.cellSizeMm,
          bits: draft.bits,
          start: draft.start,
          maxGapMm,
        }),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, validationRobotId]);

  function trySave(): LineDraft | null {
    const finalDraft: LineDraft = { ...draft, name, validationRobotId };
    const { maxGapMm } = clearanceParamsFor();
    const allIssues = validateLineStatic({
      cols: finalDraft.cols,
      rows: finalDraft.rows,
      cellSizeMm: finalDraft.cellSizeMm,
      bits: finalDraft.bits,
      start: finalDraft.start,
      maxGapMm,
    });
    const errors = allIssues.filter((i) => i.severity === 'error').map((i) => i.code);
    const warnings = allIssues.filter((i) => i.severity === 'warning').map((i) => i.code);
    if (errors.length > 0) {
      setSaveError(`Cannot save — fix ${errors.join(', ')} first.`);
      return null;
    }

    const map = lineDraftToCustomMap(finalDraft);
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
    if (saved && isNew) navigate(`/editor/line/${saved.id}`, { replace: true });
  }

  function handleSimulate() {
    const saved = trySave();
    if (!saved) return;
    const store = useStore.getState();
    store.selectMode('line');
    store.selectMap(toCustomRuntimeId(saved.id));
    navigate('/simulator');
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
      {!sizeConfirmed && (
        <NewMapSizeDialog
          title="New line track"
          description="Pick a canvas size and cell resolution. You can zoom in on the canvas afterward for finer editing."
          sizePresets={SIZE_PRESETS}
          cellSizePresets={CELL_SIZE_PRESETS}
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
          placeholder="Track name"
          className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto scroll-thin border-r border-neutral-800 bg-neutral-900/40 p-3">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Tools</h2>
            <div className="flex flex-wrap gap-1.5">
              <ToolButton active={tool === 'pencil'} onClick={() => setTool('pencil')} icon={<PencilIcon />}>
                Pencil
              </ToolButton>
              <ToolButton active={tool === 'eraser'} onClick={() => setTool('eraser')} icon={<EraserIcon />}>
                Eraser
              </ToolButton>
              <ToolButton active={tool === 'line'} onClick={() => setTool('line')} icon={<LineToolIcon />}>
                Line
              </ToolButton>
              <ToolButton active={tool === 'rect'} onClick={() => setTool('rect')} icon={<RectangleIcon />}>
                Rectangle
              </ToolButton>
              <ToolButton active={tool === 'ellipse'} onClick={() => setTool('ellipse')} icon={<EllipseIcon />}>
                Ellipse
              </ToolButton>
              <ToolButton active={tool === 'start'} onClick={() => setTool('start')} icon={<FlagIcon />}>
                Start
              </ToolButton>
            </div>
            {tool === 'start' && draft.start && (
              <ToolButton onClick={handleRotateStart}>Rotate start ({draft.start.headingDeg}°)</ToolButton>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Brush width</h2>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3].map((w) => (
                <ToolButton key={w} active={brushWidthCells === w} onClick={() => setBrushWidthCells(w)}>
                  {w} cell{w > 1 ? 's' : ''} ({w * draft.cellSizeMm}mm)
                </ToolButton>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Canvas</h2>
            <div className="flex flex-wrap gap-1.5">
              <ToolButton active={showGrid} onClick={() => setShowGrid((v) => !v)} icon={<GridIcon />}>
                Grid overlay
              </ToolButton>
              {confirmClear ? (
                <>
                  <ToolButton onClick={handleClear}>Confirm clear</ToolButton>
                  <ToolButton onClick={() => setConfirmClear(false)}>Cancel</ToolButton>
                </>
              ) : (
                <ToolButton onClick={() => setConfirmClear(true)} icon={<TrashIcon />}>
                  Clear canvas
                </ToolButton>
              )}
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
              {lineRobots.map((r) => (
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
          <PaintCanvas
            draft={draft}
            tool={tool}
            brushWidthCells={brushWidthCells}
            showGrid={showGrid}
            onChanged={handleChanged}
            onGestureEnd={handleGestureEnd}
            onPlaceStart={handlePlaceStart}
          />
        </main>
      </div>
    </div>
  );
}
