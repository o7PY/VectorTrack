import { useEffect, useRef, useState } from 'react';
import type { MazeDraft } from './draft';
import { applySegmentEdit, hitTestSegment, sameSegment, startDragMode } from './interaction';
import type { DragMode, SegmentHit } from './interaction';
import { getHWall, getVWall } from '../../sim/maze/wallGrid';
import { computeTransform, toScreen, toWorld } from '../../render2d/transform';
import { isInGoal } from '../../sim/maze/grid';
import type { CanvasView } from '../shell/canvasView';
import { effectiveTransform, initialCanvasView, panBy, resetCanvasView, zoomTowardPoint } from '../shell/canvasView';
import { FitScreenIcon, ZoomInIcon, ZoomOutIcon } from '../icons';

type PlaceMode = 'walls' | 'start' | 'goal';

interface Props {
  draft: MazeDraft;
  placeMode: PlaceMode;
  /** Called after every mutation (including each step of a drag) to trigger a re-render/dirty flag. */
  onWallsChanged: () => void;
  /** Called exactly once at the end of a gesture (drag release, or a single start/goal click) — the parent pushes exactly one undo entry here, not one per cell. */
  onGestureEnd: () => void;
  onPlaceStart: (row: number, col: number) => void;
  onPlaceGoal: (row: number, col: number) => void;
}

const HEADING_VECTOR: Record<number, [number, number]> = {
  0: [1, 0],
  90: [0, 1],
  180: [-1, 0],
  270: [0, -1],
};

export function MazeLatticeCanvas({ draft, placeMode, onWallsChanged, onGestureEnd, onPlaceStart, onPlaceGoal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceResize] = useState(0);
  const dragRef = useRef<{ mode: DragMode; last: SegmentHit | null } | null>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const [hover, setHover] = useState<SegmentHit | null>(null);
  const [view, setView] = useState<CanvasView>(initialCanvasView());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => forceResize((n) => n + 1));
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const worldW = draft.cols * draft.cellSizeMm;
  const worldH = draft.rows * draft.cellSizeMm;

  function getTransform(): { w: number; h: number; fit: ReturnType<typeof computeTransform>; t: ReturnType<typeof computeTransform> } | null {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const fit = computeTransform(w, h, worldW, worldH);
    return { w, h, fit, t: effectiveTransform(fit, view) };
  }

  function pointerToCell(e: React.PointerEvent): { row: number; col: number } | null {
    const canvas = canvasRef.current;
    const g = getTransform();
    if (!canvas || !g) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [xMm, yMm] = toWorld(g.t, sx, sy);
    const col = Math.min(draft.cols - 1, Math.max(0, Math.floor(xMm / draft.cellSizeMm)));
    const row = Math.min(draft.rows - 1, Math.max(0, Math.floor(yMm / draft.cellSizeMm)));
    return { row, col };
  }

  function pointerToSegment(e: React.PointerEvent): SegmentHit | null {
    const canvas = canvasRef.current;
    const g = getTransform();
    if (!canvas || !g) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [xMm, yMm] = toWorld(g.t, sx, sy);
    return hitTestSegment(draft.rows, draft.cols, draft.cellSizeMm, xMm, yMm);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button === 1) {
      panRef.current = { lastX: e.clientX, lastY: e.clientY };
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (placeMode === 'start') {
      const cell = pointerToCell(e);
      if (cell) {
        onPlaceStart(cell.row, cell.col);
        onGestureEnd();
      }
      return;
    }
    if (placeMode === 'goal') {
      const cell = pointerToCell(e);
      if (cell) {
        onPlaceGoal(cell.row, cell.col);
        onGestureEnd();
      }
      return;
    }
    const hit = pointerToSegment(e);
    if (!hit || hit.isBorder) return;
    const mode = startDragMode(draft.wallGrid, hit);
    applySegmentEdit(draft.wallGrid, hit, mode);
    dragRef.current = { mode, last: hit };
    onWallsChanged();
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.lastX;
      const dy = e.clientY - panRef.current.lastY;
      panRef.current = { lastX: e.clientX, lastY: e.clientY };
      setView((v) => panBy(v, dx, dy));
      return;
    }

    if (placeMode !== 'walls') return;
    const hit = pointerToSegment(e);
    setHover(hit);
    if (!dragRef.current || !hit || hit.isBorder) return;
    if (sameSegment(hit, dragRef.current.last)) return;
    applySegmentEdit(draft.wallGrid, hit, dragRef.current.mode);
    dragRef.current.last = hit;
    onWallsChanged();
  }

  function handlePointerUp() {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    const wasDragging = dragRef.current !== null;
    dragRef.current = null;
    if (wasDragging) onGestureEnd();
  }

  function handleWheel(e: React.WheelEvent) {
    const canvas = canvasRef.current;
    const g = getTransform();
    if (!canvas || !g) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => zoomTowardPoint(g.fit, v, sx, sy, factor));
  }

  function zoomButton(factor: number) {
    const g = getTransform();
    if (!g) return;
    setView((v) => zoomTowardPoint(g.fit, v, g.w / 2, g.h / 2, factor));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0a0b';
    ctx.fillRect(0, 0, w, h);

    const fit = computeTransform(w, h, worldW, worldH);
    const t = effectiveTransform(fit, view);

    // Posts
    ctx.fillStyle = '#3f3f46';
    for (let r = 0; r <= draft.rows; r++) {
      for (let c = 0; c <= draft.cols; c++) {
        const [x, y] = toScreen(t, c * draft.cellSizeMm, r * draft.cellSizeMm);
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const wallPx = Math.max(2, draft.wallThicknessMm * t.scale);

    // Horizontal walls
    for (let r = 0; r <= draft.rows; r++) {
      for (let c = 0; c < draft.cols; c++) {
        if (!getHWall(draft.wallGrid, r, c)) continue;
        const isBorder = r === 0 || r === draft.rows;
        const isHover = hover?.kind === 'h' && hover.r === r && hover.c === c;
        ctx.strokeStyle = isHover ? '#38bdf8' : isBorder ? 'rgba(228,228,231,0.35)' : '#e4e4e7';
        ctx.lineWidth = wallPx;
        ctx.lineCap = 'square';
        const [x1, y1] = toScreen(t, c * draft.cellSizeMm, r * draft.cellSizeMm);
        const [x2, y2] = toScreen(t, (c + 1) * draft.cellSizeMm, r * draft.cellSizeMm);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Vertical walls
    for (let r = 0; r < draft.rows; r++) {
      for (let c = 0; c <= draft.cols; c++) {
        if (!getVWall(draft.wallGrid, r, c)) continue;
        const isBorder = c === 0 || c === draft.cols;
        const isHover = hover?.kind === 'v' && hover.r === r && hover.c === c;
        ctx.strokeStyle = isHover ? '#38bdf8' : isBorder ? 'rgba(228,228,231,0.35)' : '#e4e4e7';
        ctx.lineWidth = wallPx;
        ctx.lineCap = 'square';
        const [x1, y1] = toScreen(t, c * draft.cellSizeMm, r * draft.cellSizeMm);
        const [x2, y2] = toScreen(t, c * draft.cellSizeMm, (r + 1) * draft.cellSizeMm);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Goal region
    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
    const [gx, gy] = toScreen(t, draft.goal.col * draft.cellSizeMm, draft.goal.row * draft.cellSizeMm);
    ctx.fillRect(gx, gy, draft.goal.width * draft.cellSizeMm * t.scale, draft.goal.height * draft.cellSizeMm * t.scale);

    // Start marker + heading
    const [sx, sy] = toScreen(t, (draft.start.col + 0.5) * draft.cellSizeMm, (draft.start.row + 0.5) * draft.cellSizeMm);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(sx, sy, draft.cellSizeMm * t.scale * 0.18, 0, Math.PI * 2);
    ctx.fill();
    const [hvx, hvy] = HEADING_VECTOR[draft.start.headingDeg] ?? [1, 0];
    ctx.strokeStyle = '#052e16';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + hvx * draft.cellSizeMm * t.scale * 0.3, sy + hvy * draft.cellSizeMm * t.scale * 0.3);
    ctx.stroke();

    if (isInGoal(draft.start, draft.goal)) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, draft.cellSizeMm * t.scale * 0.28, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${placeMode === 'walls' ? 'cursor-crosshair' : 'cursor-pointer'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setHover(null)}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute bottom-3 right-3 flex gap-1 rounded-md border border-neutral-800 bg-neutral-900/90 p-1 shadow-lg">
        <button
          type="button"
          title="Zoom out"
          onClick={() => zoomButton(1 / 1.4)}
          className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
        >
          <ZoomOutIcon />
        </button>
        <button
          type="button"
          title="Reset zoom"
          onClick={() => setView(resetCanvasView())}
          className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
        >
          <FitScreenIcon />
        </button>
        <button
          type="button"
          title="Zoom in"
          onClick={() => zoomButton(1.4)}
          className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white"
        >
          <ZoomInIcon />
        </button>
      </div>
    </div>
  );
}
