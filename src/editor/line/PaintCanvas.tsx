import { useEffect, useRef, useState } from 'react';
import type { LineDraft } from './draft';
import { paintEllipseOutline, paintLine, paintRectOutline, stampBrush } from './paint';
import type { PaintGridBits } from './paint';
import { computeTransform, toScreen, toWorld } from '../../render2d/transform';
import type { CanvasView } from '../shell/canvasView';
import { effectiveTransform, initialCanvasView, panBy, resetCanvasView, zoomTowardPoint } from '../shell/canvasView';
import { FitScreenIcon, ZoomInIcon, ZoomOutIcon } from '../icons';

export type LineTool = 'pencil' | 'eraser' | 'line' | 'rect' | 'ellipse' | 'start';

interface Props {
  draft: LineDraft;
  tool: LineTool;
  brushWidthCells: number;
  showGrid: boolean;
  /** Called after every mutation (including each step of a drag) to trigger a re-render/dirty flag. */
  onChanged: () => void;
  /** Called exactly once at the end of a gesture — the parent pushes exactly one undo entry here. */
  onGestureEnd: () => void;
  onPlaceStart: (xMm: number, yMm: number) => void;
}

function cellOf(draft: LineDraft, xMm: number, yMm: number): { r: number; c: number } {
  const c = Math.min(draft.cols - 1, Math.max(0, Math.floor(xMm / draft.cellSizeMm)));
  const r = Math.min(draft.rows - 1, Math.max(0, Math.floor(yMm / draft.cellSizeMm)));
  return { r, c };
}

export function PaintCanvas({ draft, tool, brushWidthCells, showGrid, onChanged, onGestureEnd, onPlaceStart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, forceResize] = useState(0);
  const dragRef = useRef<{ lastR: number; lastC: number; anchorR: number; anchorC: number; snapshot: Uint8Array } | null>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const [previewCell, setPreviewCell] = useState<{ r: number; c: number } | null>(null);
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

  function pointerToMm(e: React.PointerEvent): [number, number] | null {
    const canvas = canvasRef.current;
    const g = getTransform();
    if (!canvas || !g) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return toWorld(g.t, sx, sy);
  }

  function grid(): PaintGridBits {
    return { cols: draft.cols, rows: draft.rows, bits: draft.bits };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button === 1) {
      panRef.current = { lastX: e.clientX, lastY: e.clientY };
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    const mm = pointerToMm(e);
    if (!mm) return;
    const { r, c } = cellOf(draft, mm[0], mm[1]);

    if (tool === 'start') {
      onPlaceStart((c + 0.5) * draft.cellSizeMm, (r + 0.5) * draft.cellSizeMm);
      onGestureEnd();
      return;
    }

    const snapshot = draft.bits.slice();
    if (tool === 'pencil' || tool === 'eraser') {
      stampBrush(grid(), r, c, brushWidthCells, tool === 'pencil' ? 1 : 0);
      onChanged();
    }
    dragRef.current = { lastR: r, lastC: c, anchorR: r, anchorC: c, snapshot };
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

    const mm = pointerToMm(e);
    if (!mm) return;
    const { r, c } = cellOf(draft, mm[0], mm[1]);
    setPreviewCell({ r, c });
    if (!dragRef.current) return;

    if (tool === 'pencil' || tool === 'eraser') {
      if (r === dragRef.current.lastR && c === dragRef.current.lastC) return;
      paintLine(grid(), dragRef.current.lastR, dragRef.current.lastC, r, c, brushWidthCells, tool === 'pencil' ? 1 : 0);
      dragRef.current.lastR = r;
      dragRef.current.lastC = c;
      onChanged();
    } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      // Live preview: redraw from the pre-gesture snapshot, then stamp the shape at the current cursor position.
      draft.bits.set(dragRef.current.snapshot);
      const { anchorR, anchorC } = dragRef.current;
      if (tool === 'line') paintLine(grid(), anchorR, anchorC, r, c, brushWidthCells, 1);
      else if (tool === 'rect') paintRectOutline(grid(), anchorR, anchorC, r, c, brushWidthCells, 1);
      else paintEllipseOutline(grid(), anchorR, anchorC, r, c, brushWidthCells, 1);
      onChanged();
    }
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

    // White floor / black line — the same convention a real reflectance sensor sees.
    ctx.fillStyle = '#ffffff';
    const [fx, fy] = toScreen(t, 0, 0);
    ctx.fillRect(fx, fy, worldW * t.scale, worldH * t.scale);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= draft.cols; c++) {
        const [x1, y1] = toScreen(t, c * draft.cellSizeMm, 0);
        const [x2, y2] = toScreen(t, c * draft.cellSizeMm, worldH);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      for (let r = 0; r <= draft.rows; r++) {
        const [x1, y1] = toScreen(t, 0, r * draft.cellSizeMm);
        const [x2, y2] = toScreen(t, worldW, r * draft.cellSizeMm);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    const cellPx = draft.cellSizeMm * t.scale;
    ctx.fillStyle = '#000000';
    for (let r = 0; r < draft.rows; r++) {
      for (let c = 0; c < draft.cols; c++) {
        if (!draft.bits[r * draft.cols + c]) continue;
        const [x, y] = toScreen(t, c * draft.cellSizeMm, r * draft.cellSizeMm);
        ctx.fillRect(x, y, cellPx + 0.5, cellPx + 0.5);
      }
    }

    if (previewCell && tool !== 'start') {
      const [x, y] = toScreen(t, previewCell.c * draft.cellSizeMm, previewCell.r * draft.cellSizeMm);
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, cellPx, cellPx);
    }

    if (draft.start) {
      const [sx, sy] = toScreen(t, draft.start.xMm, draft.start.yMm);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(4, cellPx * 0.6), 0, Math.PI * 2);
      ctx.fill();
      const theta = (draft.start.headingDeg * Math.PI) / 180;
      ctx.strokeStyle = '#052e16';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(theta) * cellPx * 1.4, sy + Math.sin(theta) * cellPx * 1.4);
      ctx.stroke();
    }
  });

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className={`block h-full w-full ${tool === 'start' ? 'cursor-pointer' : 'cursor-crosshair'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setPreviewCell(null)}
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
