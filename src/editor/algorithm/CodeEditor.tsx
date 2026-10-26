// In-simulator code editor — internal-docs/Algorithms.md §3.1/§3.2/§3.3. Hand-rolled textarea +
// highlighted `<pre>` underlay (no CodeMirror/Monaco), 400ms-debounced recompile wired to
// `useStore.updateAlgorithmSource`'s three-way live-editing semantics. Renders as a small modal
// window (triggered by an "Edit Code" button in the sidebar) rather than an inline panel, with an
// explicit Save/Undo/Redo/Revert toolbar on top of the debounced autosave-on-compile.
//
// Live value inspection (hover-while-running, ghost-annotations-while-paused) is not implemented
// yet — it needs the interpreter to expose a value trace, which is a separate, larger piece of
// work; deliberately deferred rather than half-built, per internal-docs/PLAN.md's Phase I notes.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { isVtlRuntimeId, toBareVtlId } from '../../store/customAlgorithmResolvers';
import {
  clearAlgorithmDraft,
  getCustomAlgorithm,
  loadAlgorithmDraft,
  loadCustomAlgorithmStore,
  saveAlgorithmDraft,
  saveAlgorithmDraftDebounced,
} from '../../store/customAlgorithms';
import { compile } from '../../vtl/compile';
import type { TableDecl, VtlError } from '../../vtl/types';
import { highlightTokens, splitTokensIntoLines } from './highlight';
import type { HighlightTokenType } from './highlight';

const RECOMPILE_DEBOUNCE_MS = 400;
const HISTORY_LIMIT = 200;

// A leftover draft (from a session that ended mid-edit, before ever compiling) takes priority over
// the persisted source, since it represents more recent, not-yet-committed work (§4: "cleared on
// save"). Read once as this component's initial state — the parent remounts us via `key={algorithmId}`
// on algorithm change, so there's no need to re-derive this in an effect.
function initialSource(algorithmId: string): string {
  if (!isVtlRuntimeId(algorithmId)) return '';
  const bareId = toBareVtlId(algorithmId);
  const draft = loadAlgorithmDraft(bareId);
  const persisted = getCustomAlgorithm(loadCustomAlgorithmStore(), bareId);
  return draft?.source ?? persisted?.source ?? '';
}

// v0.3.1.md §H.2: a `table` whose length is a perfect square (25 -> 5x5, 49 -> 7x7) previews as a
// labelled grid, since that's what makes a Sugeno-style rule table legible — the same 25 numbers as
// a flat run are not. Non-square lengths intentionally fall back to the plain source view; don't
// guess at other factorings (e.g. 5x6) per the spec. Recompiled straight from the live editor text
// on every render, independent of the debounced store update, the same way `highlightTokens` is.
function squareTablesIn(source: string, mode: 'line' | 'maze'): TableDecl[] {
  const result = compile(source, mode);
  if (!result.ok) return [];
  return result.program.tables.filter((t) => {
    const size = Math.sqrt(t.values.length);
    return Number.isInteger(size) && size > 1;
  });
}

function TableGridPreview({ table }: { table: TableDecl }) {
  const size = Math.sqrt(table.values.length);
  const cells: ReactNode[] = [];
  cells.push(<div key="corner" />);
  for (let c = 0; c < size; c++) {
    cells.push(
      <div key={`c${c}`} className="px-1 text-center text-[10px] text-neutral-500">
        {c}
      </div>,
    );
  }
  for (let r = 0; r < size; r++) {
    cells.push(
      <div key={`r${r}`} className="pr-1 text-right text-[10px] text-neutral-500">
        {r}
      </div>,
    );
    for (let c = 0; c < size; c++) {
      cells.push(
        <div key={`${r}-${c}`} className="rounded bg-neutral-800 px-1 py-0.5 text-center text-neutral-100">
          {table.values[r * size + c]}
        </div>,
      );
    }
  }
  return (
    <div>
      <div className="mb-1 text-neutral-400">
        {table.name} ({size}×{size})
      </div>
      <div
        className="inline-grid gap-0.5 font-mono"
        style={{ gridTemplateColumns: `auto repeat(${size}, minmax(1.5rem, auto))` }}
      >
        {cells}
      </div>
    </div>
  );
}

const TOKEN_CLASS: Record<HighlightTokenType, string> = {
  keyword: 'text-sky-400',
  builtin: 'text-emerald-400',
  constant: 'text-amber-400',
  ident: 'text-neutral-100',
  number: 'text-fuchsia-400',
  string: 'text-lime-400',
  comment: 'text-neutral-500 italic',
  operator: 'text-neutral-300',
  whitespace: '',
  newline: '',
};

export function CodeEditor({
  open,
  onClose,
  onOpenSensorEditor,
}: {
  open: boolean;
  onClose: () => void;
  // Algorithms.md §2.2: the sensor editor is also reachable from here, not just the simulator
  // sidebar. Owned by the parent (SimulatorPage) since it also owns the sensor editor's open state.
  onOpenSensorEditor?: () => void;
}) {
  const algorithmId = useStore((s) => s.algorithmId);
  const updateAlgorithmSource = useStore((s) => s.updateAlgorithmSource);
  const mode = useStore((s) => s.mode);

  const [text, setText] = useState(() => initialSource(algorithmId));
  const [history, setHistory] = useState<string[]>(() => [text]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [errors, setErrors] = useState<VtlError[]>([]);
  const [cursorLine, setCursorLine] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  // Cancels pending timers on unmount — the parent remounts this component (via `key={algorithmId}`)
  // whenever the selected algorithm changes, so "unmount" doubles as "switched to a different algorithm."
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (flashRef.current) clearTimeout(flashRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const squareTables = useMemo(() => squareTablesIn(text, mode), [text, mode]);

  if (!isVtlRuntimeId(algorithmId) || !open) return null;
  const bareId = toBareVtlId(algorithmId);

  function applyUpdate(newText: string): void {
    const result = updateAlgorithmSource(newText);
    setErrors(result.ok ? [] : result.errors);
    return;
  }

  function scheduleUpdate(newText: string): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyUpdate(newText), RECOMPILE_DEBOUNCE_MS);
  }

  function handleChange(newText: string): void {
    setText(newText);
    saveAlgorithmDraftDebounced(bareId, newText);
    scheduleUpdate(newText);

    const truncated = history.slice(0, historyIndex + 1);
    const next = [...truncated, newText];
    const overflow = next.length - HISTORY_LIMIT;
    const trimmed = overflow > 0 ? next.slice(overflow) : next;
    setHistory(trimmed);
    setHistoryIndex(trimmed.length - 1);
  }

  function jumpHistory(newIndex: number): void {
    if (newIndex < 0 || newIndex >= history.length) return;
    const newText = history[newIndex];
    setHistoryIndex(newIndex);
    setText(newText);
    saveAlgorithmDraftDebounced(bareId, newText);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyUpdate(newText);
  }

  function handleSave(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyUpdate(text);
    if (flashRef.current) clearTimeout(flashRef.current);
    setSavedFlash(true);
    flashRef.current = setTimeout(() => setSavedFlash(false), 1200);
  }

  function handleRevert(): void {
    const persisted = getCustomAlgorithm(loadCustomAlgorithmStore(), bareId)?.source ?? '';
    if (debounceRef.current) clearTimeout(debounceRef.current);
    clearAlgorithmDraft(bareId);
    saveAlgorithmDraft(bareId, persisted);
    setText(persisted);
    setHistory([persisted]);
    setHistoryIndex(0);
    applyUpdate(persisted);
  }

  function syncScroll(): void {
    const ta = textareaRef.current;
    if (!ta) return;
    if (overlayRef.current) {
      overlayRef.current.scrollTop = ta.scrollTop;
      overlayRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }

  function syncCursorLine(): void {
    const ta = textareaRef.current;
    if (!ta) return;
    setCursorLine(ta.value.slice(0, ta.selectionStart).split('\n').length - 1);
  }

  const lines = splitTokensIntoLines(highlightTokens(text));
  const errorLinesMessages = new Map<number, string>();
  for (const e of errors) if (!errorLinesMessages.has(e.line - 1)) errorLinesMessages.set(e.line - 1, e.message);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex h-[32rem] w-[42rem] max-w-full flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
          <span className="text-sm font-semibold text-neutral-200">Edit Code</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close code editor"
            className="rounded px-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-1.5 border-b border-neutral-800 px-3 py-1.5">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => jumpHistory(historyIndex - 1)}
            disabled={!canUndo}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-30 disabled:hover:border-neutral-700 disabled:hover:text-neutral-300"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => jumpHistory(historyIndex + 1)}
            disabled={!canRedo}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-30 disabled:hover:border-neutral-700 disabled:hover:text-neutral-300"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={handleRevert}
            className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-600 hover:text-neutral-100"
          >
            Revert to saved
          </button>
          {onOpenSensorEditor && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenSensorEditor();
              }}
              className="ml-auto rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-sky-400 hover:border-neutral-600 hover:text-sky-300"
            >
              Sensors
            </button>
          )}
          {savedFlash && <span className="ml-1 text-xs text-emerald-400">Saved ✓</span>}
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden text-xs">
          <div
            ref={gutterRef}
            aria-hidden
            className="w-8 shrink-0 overflow-hidden bg-neutral-900/60 py-1 text-right font-mono leading-5 text-neutral-600 select-none"
          >
            {lines.map((_, i) => (
              <div key={i} className={`px-1 ${i === cursorLine ? 'text-neutral-300' : ''}`}>
                {i + 1}
              </div>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            <div ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute left-0 h-5 w-full bg-neutral-800/50"
                style={{ top: `${cursorLine * 1.25}rem` }}
              />
              <pre className="relative m-0 min-w-full px-2 py-1 font-mono leading-5 whitespace-pre">
                {lines.map((lineTokens, i) => (
                  <div key={i} className={errorLinesMessages.has(i) ? 'bg-red-950/40' : undefined}>
                    {lineTokens.length === 0
                      ? ' '
                      : lineTokens.map((t, j) => (
                          <span key={j} className={TOKEN_CLASS[t.type]}>
                            {t.text}
                          </span>
                        ))}
                  </div>
                ))}
              </pre>
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              spellCheck={false}
              autoFocus
              onChange={(e) => handleChange(e.target.value)}
              onScroll={syncScroll}
              onSelect={syncCursorLine}
              onKeyUp={syncCursorLine}
              onClick={syncCursorLine}
              className="absolute inset-0 resize-none overflow-auto bg-transparent px-2 py-1 font-mono leading-5 whitespace-pre text-transparent caret-white outline-none"
            />
          </div>
        </div>

        {squareTables.length > 0 && (
          <div className="flex max-h-40 flex-wrap gap-4 overflow-y-auto scroll-thin border-t border-neutral-800 px-3 py-2 text-xs">
            {squareTables.map((t) => (
              <TableGridPreview key={t.name} table={t} />
            ))}
          </div>
        )}

        {errors.length > 0 && (
          <ul className="flex max-h-24 flex-col gap-0.5 overflow-y-auto scroll-thin border-t border-neutral-800 px-3 py-1.5 text-xs text-red-400">
            {errors.map((e, i) => (
              <li key={i}>
                {e.code} (line {e.line}): {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
