// Sensor placement editor — internal-docs/Algorithms.md §2.2. Renders as a modal over the
// simulator (same pattern as `editor/algorithm/CodeEditor.tsx`), reached from the simulator
// sidebar's "Sensors" button and from the algorithm editor.
//
// Canvas coordinate convention (local to this file only): `forwardMm` maps to screen "up"
// (canvasY = -forwardMm) and `lateralMm` maps to screen "right" (canvasX = lateralMm), matching
// `sim/sensors/placement.ts`'s body-frame convention (positive lateral = robot's right) with the
// robot drawn nose-up, the usual top-down vehicle-editor orientation.
import { useEffect, useRef, useState } from 'react';
import type { Pose2D } from '../../sim/core/types';
import type { LineRobotSpec, MazeRobotSpec } from '../../sim/core/types';
import type { LineBitmap } from '../../sim/sensors/reflectance';
import type { SensorPlacement } from '../../sim/sensors/placement';
import { DEFAULT_SPOT_RADIUS_MM, orderSensorsLeftToRight } from '../../sim/sensors/placement';
import { computeTransform, toScreen, toWorld } from '../../render2d/transform';
import type { Transform } from '../../render2d/transform';
import type { CanvasView } from '../shell/canvasView';
import { effectiveTransform, initialCanvasView, panBy, resetCanvasView, zoomTowardPoint } from '../shell/canvasView';
import { bitmapToImageBitmapCanvas } from '../../render2d/bitmapCanvas';
import { getLineMap } from '../../maps/line';
import { rasterizeLineMap } from '../../maps/line/rasterize';
import { isCustomRuntimeId, resolveCustomLineMap } from '../../store/customMapResolvers';
import { getLineRobot, getMazeRobot } from '../../robots/definitions';
import type { SensorLayoutPreset } from '../../robots/layouts';
import { defaultLineLayout, defaultMazeLayout } from '../../robots/layouts';
import { generateSensorArray, generateStaggeredSensorArray, SENSOR_ARRAY_PRESETS } from './arrayHelper';
import type { SensorValidationIssue } from '../validation/sensorRules';
import { findBlindGaps, validateSensorLayout } from '../validation/sensorRules';
import type { UndoStack } from '../shell/undoStack';
import { createUndoStack } from '../shell/undoStack';
import { FitScreenIcon, RedoIcon, TrashIcon, UndoIcon, ZoomInIcon, ZoomOutIcon } from '../icons';
import { useStore } from '../../store/useStore';
import { isSensorLayoutRuntimeId, toBareSensorLayoutId, toSensorLayoutRuntimeId } from '../../store/customAlgorithmResolvers';
import {
  AlgorithmQuotaError,
  getCustomSensorLayout,
  listCustomSensorLayouts,
  loadCustomAlgorithmStore,
  saveCustomAlgorithmStore,
  upsertCustomSensorLayout,
} from '../../store/customAlgorithms';

const HIT_RADIUS_PX = 14;
const GRID_SNAP_MM = 1;
const MAX_RAY_DISPLAY_MM = 200;

function isLineRobot(r: LineRobotSpec | MazeRobotSpec): r is LineRobotSpec {
  return r.kind === 'line';
}

// Custom line maps (maps/custom/types.ts's CustomLineMap) have no `trackWidthMm` field — they're a
// freeform painted grid, not a fixed-width centerline loop — so there's nothing exact to read.
// Every built-in map is 20mm; used here as a documented approximation for SP003/SP004 until custom
// maps grow a real line-width concept.
const CUSTOM_MAP_TRACK_WIDTH_FALLBACK_MM = 20;

interface LinePreview {
  bitmap: LineBitmap;
  startPose: Pose2D;
  trackWidthMm: number;
}

function resolveLinePreview(mapId: string): LinePreview {
  if (isCustomRuntimeId(mapId)) {
    const source = resolveCustomLineMap(mapId);
    return { bitmap: source.bitmap, startPose: source.startPose, trackWidthMm: CUSTOM_MAP_TRACK_WIDTH_FALLBACK_MM };
  }
  const mapDef = getLineMap(mapId);
  return { bitmap: rasterizeLineMap(mapDef), startPose: mapDef.startPose, trackWidthMm: mapDef.trackWidthMm };
}

function loadInitialSensors(mode: 'line' | 'maze', robotId: string, layoutId: string): { sensors: SensorPlacement[]; baseLayoutId: string | null; name: string } {
  if (isSensorLayoutRuntimeId(layoutId)) {
    const custom = getCustomSensorLayout(loadCustomAlgorithmStore(), toBareSensorLayoutId(layoutId));
    if (custom && custom.mode === mode) {
      return { sensors: structuredClone(custom.sensors), baseLayoutId: custom.id, name: custom.name };
    }
  }
  const preset = mode === 'line' ? defaultLineLayout(getLineRobot(robotId)) : defaultMazeLayout(getMazeRobot(robotId));
  return { sensors: structuredClone(preset.sensors), baseLayoutId: null, name: `${preset.name.replace(' (default)', '')} custom` };
}

// Includes the user's own saved layouts (runtime `layout:${id}` ids) alongside the built-in
// presets, so a layout saved earlier — or imported via the algorithm-export codec — is selectable
// again (previously this only listed built-ins, ISSUES.md's Phase J follow-up).
function presetsFor(mode: 'line' | 'maze'): SensorLayoutPreset[] {
  const builtins =
    mode === 'line'
      ? [...SENSOR_ARRAY_PRESETS, defaultLineLayout(getLineRobot('lf-scout')), defaultLineLayout(getLineRobot('lf-ranger'))]
      : [defaultMazeLayout(getMazeRobot('mz-probe')), defaultMazeLayout(getMazeRobot('mz-sprint'))];
  const saved: SensorLayoutPreset[] = listCustomSensorLayouts(loadCustomAlgorithmStore())
    .filter((l) => l.mode === mode)
    .map((l) => ({ id: toSensorLayoutRuntimeId(l.id), name: l.name, mode: l.mode, sensors: l.sensors }));
  return [...builtins, ...saved];
}

function newSensorId(): string {
  return `sensor-${crypto.randomUUID().slice(0, 8)}`;
}

function snap(mm: number, free: boolean): number {
  return free ? mm : Math.round(mm / GRID_SNAP_MM) * GRID_SNAP_MM;
}

const SEVERITY_STYLE: Record<SensorValidationIssue['severity'], string> = {
  error: 'border-red-900 bg-red-950/40 text-red-300',
  warning: 'border-amber-900 bg-amber-950/30 text-amber-300',
  info: 'border-neutral-800 bg-neutral-900 text-neutral-400',
};

interface DragState {
  id: string;
  mirrorId: string | null;
  offsetForwardMm: number;
  offsetLateralMm: number;
}

export function SensorLayoutCanvas({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mode = useStore((s) => s.mode);
  const mapId = useStore((s) => s.mapId);
  const robotId = useStore((s) => s.robotId);
  const layoutId = useStore((s) => s.layoutId);
  const selectSensorLayout = useStore((s) => s.selectSensorLayout);

  const robot = mode === 'line' ? getLineRobot(robotId) : getMazeRobot(robotId);
  const requiredType = mode === 'line' ? 'reflectance' : 'rangefinder';
  const [minCount, maxCount] = mode === 'line' ? [1, 12] : [1, 6];

  const initial = loadInitialSensors(mode, robotId, layoutId);
  const [sensors, setSensors] = useState<SensorPlacement[]>(initial.sensors);
  const [baseLayoutId, setBaseLayoutId] = useState<string | null>(initial.baseLayoutId);
  const [name, setName] = useState(initial.name);
  const [mirrorMode, setMirrorMode] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [arraySpanMm, setArraySpanMm] = useState(60);
  const [arrayForwardMm, setArrayForwardMm] = useState(isLineRobot(robot) ? robot.sensorForwardOffset : 60);
  const [arrayStaggerMm, setArrayStaggerMm] = useState(12);
  const [staggered, setStaggered] = useState(false);
  const [presetId, setPresetId] = useState('');
  const [view, setView] = useState<CanvasView>(initialCanvasView());

  const undoRef = useRef<UndoStack<SensorPlacement[]> | null>(null);
  if (undoRef.current === null) undoRef.current = createUndoStack(structuredClone(initial.sensors));
  // Synced via an effect (not written directly during render) so drag-end can read the latest
  // committed sensors without triggering the react(refs) "no ref access during render" lint rule.
  const sensorsRef = useRef(sensors);
  useEffect(() => {
    sensorsRef.current = sensors;
  }, [sensors]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const bitmapCanvasRef = useRef<{ mapId: string; canvas: HTMLCanvasElement } | null>(null);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceResize] = useState(0);

  useEffect(() => {
    return () => {
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !open) return;
    const ro = new ResizeObserver(() => forceResize((n) => n + 1));
    ro.observe(container);
    return () => ro.disconnect();
  }, [open]);

  const linePreview = open && mode === 'line' ? resolveLinePreview(mapId) : null;

  function commit(next: SensorPlacement[]): void {
    undoRef.current!.push(structuredClone(next));
    setSensors(next);
  }

  function handleUndo(): void {
    const prev = undoRef.current!.undo();
    if (!prev) return;
    setSensors(structuredClone(prev));
  }

  function handleRedo(): void {
    const next = undoRef.current!.redo();
    if (!next) return;
    setSensors(structuredClone(next));
  }

  function handleAddSensor(): void {
    if (sensors.length >= maxCount) return;
    const maxLateral = sensors.length > 0 ? Math.max(...sensors.map((s) => s.lateralMm)) : -10;
    const avgForward = sensors.length > 0 ? sensors.reduce((sum, s) => sum + s.forwardMm, 0) / sensors.length : arrayForwardMm;
    const fresh: SensorPlacement =
      requiredType === 'reflectance'
        ? { id: newSensorId(), type: 'reflectance', forwardMm: avgForward, lateralMm: maxLateral + 15, headingDeg: 0, spotRadiusMm: DEFAULT_SPOT_RADIUS_MM }
        : {
            id: newSensorId(),
            type: 'rangefinder',
            forwardMm: avgForward,
            lateralMm: maxLateral + 15,
            headingDeg: 0,
            maxRangeMm: (robot as MazeRobotSpec).sensorRange,
          };
    commit(orderSensorsLeftToRight([...sensors, fresh]));
  }

  function handleRemoveSensor(id: string): void {
    if (sensors.length <= minCount) return;
    commit(sensors.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function applyPreset(preset: SensorLayoutPreset): void {
    commit(structuredClone(preset.sensors));
    setSelectedId(null);
    // A saved-layout preset (runtime `layout:${id}`) re-attaches to that same saved layout, so
    // "Save" below updates it in place rather than silently forking a new one under its name.
    if (isSensorLayoutRuntimeId(preset.id)) {
      setBaseLayoutId(toBareSensorLayoutId(preset.id));
      setName(preset.name);
      selectSensorLayout(preset.id);
    }
  }

  function handleGenerateArray(): void {
    const count = Math.min(maxCount, Math.max(minCount, sensors.length || 5));
    const generated = staggered
      ? generateStaggeredSensorArray(count, arraySpanMm, arrayForwardMm, arrayStaggerMm)
      : generateSensorArray(count, arraySpanMm, arrayForwardMm);
    commit(generated);
    setSelectedId(null);
  }

  function handleResetToDefault(): void {
    const preset = mode === 'line' ? defaultLineLayout(robot as LineRobotSpec) : defaultMazeLayout(robot as MazeRobotSpec);
    commit(structuredClone(preset.sensors));
    setBaseLayoutId(null);
    setName(`${preset.name.replace(' (default)', '')} custom`);
    setSelectedId(null);
    selectSensorLayout(robotId);
  }

  const issues = validateSensorLayout({
    mode,
    sensors,
    trackWidthMm: linePreview?.trackWidthMm ?? CUSTOM_MAP_TRACK_WIDTH_FALLBACK_MM,
    chassisWidthMm: robot.chassisWidthMm,
    wheelBase: robot.wheelBase,
  });
  const hasErrors = issues.some((i) => i.severity === 'error');

  function handleSave(): void {
    if (hasErrors) return;
    const id = baseLayoutId ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = getCustomSensorLayout(loadCustomAlgorithmStore(), id);
    const layout = {
      id,
      name: name.trim() || `${robot.name} custom`,
      mode,
      basedOnRobotId: robotId,
      sensors: orderSensorsLeftToRight(sensors),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      saveCustomAlgorithmStore(upsertCustomSensorLayout(loadCustomAlgorithmStore(), layout));
      setBaseLayoutId(id);
      setSaveError(null);
      selectSensorLayout(toSensorLayoutRuntimeId(id));
      if (flashRef.current) clearTimeout(flashRef.current);
      setSavedFlash(true);
      flashRef.current = setTimeout(() => setSavedFlash(false), 1200);
    } catch (err) {
      setSaveError(err instanceof AlgorithmQuotaError ? err.message : 'Failed to save.');
    }
  }

  // ---- Canvas geometry ----

  const viewHalfMm = Math.max(150, robot.wheelBase * 1.8, robot.chassisWidthMm * 1.2, ...sensors.map((s) => Math.max(Math.abs(s.forwardMm), Math.abs(s.lateralMm)) + 30));
  const worldW = viewHalfMm * 2;
  const worldH = viewHalfMm * 2;

  function getTransform(): { w: number; h: number; fit: Transform; t: Transform } | null {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const fit = computeTransform(w, h, worldW, worldH);
    return { w, h, fit, t: effectiveTransform(fit, view) };
  }

  // Layout-mm (forwardMm, lateralMm) -> screen px, via the local canvasX=lateral/canvasY=-forward
  // convention described at the top of this file.
  function layoutToScreen(t: Transform, forwardMm: number, lateralMm: number): [number, number] {
    return toScreen(t, lateralMm + viewHalfMm, -forwardMm + viewHalfMm);
  }

  function screenToLayout(t: Transform, sx: number, sy: number): { forwardMm: number; lateralMm: number } {
    const [wx, wy] = toWorld(t, sx, sy);
    return { forwardMm: -(wy - viewHalfMm), lateralMm: wx - viewHalfMm };
  }

  function handlePointerDown(e: React.PointerEvent): void {
    if (e.button === 1) {
      panRef.current = { lastX: e.clientX, lastY: e.clientY };
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    const g = getTransform();
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    let hit: SensorPlacement | null = null;
    let hitDist = Infinity;
    for (const s of sensors) {
      const [scx, scy] = layoutToScreen(g.t, s.forwardMm, s.lateralMm);
      const d = Math.hypot(scx - sx, scy - sy);
      if (d < HIT_RADIUS_PX && d < hitDist) {
        hit = s;
        hitDist = d;
      }
    }

    if (!hit) {
      setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);

    let mirrorId: string | null = null;
    if (mirrorMode) {
      const sorted = orderSensorsLeftToRight(sensors);
      const idx = sorted.findIndex((s) => s.id === hit!.id);
      const pairedIdx = sorted.length - 1 - idx;
      if (pairedIdx !== idx) mirrorId = sorted[pairedIdx].id;
    }
    const layoutPos = screenToLayout(g.t, sx, sy);
    dragRef.current = {
      id: hit.id,
      mirrorId,
      offsetForwardMm: hit.forwardMm - layoutPos.forwardMm,
      offsetLateralMm: hit.lateralMm - layoutPos.lateralMm,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent): void {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.lastX;
      const dy = e.clientY - panRef.current.lastY;
      panRef.current = { lastX: e.clientX, lastY: e.clientY };
      setView((v) => panBy(v, dx, dy));
      return;
    }
    if (!dragRef.current) return;
    const g = getTransform();
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const layoutPos = screenToLayout(g.t, sx, sy);
    const free = e.shiftKey;
    const newForward = snap(layoutPos.forwardMm + dragRef.current.offsetForwardMm, free);
    const newLateral = snap(layoutPos.lateralMm + dragRef.current.offsetLateralMm, free);

    setSensors((prev) =>
      prev.map((s) => {
        if (s.id === dragRef.current!.id) return { ...s, forwardMm: newForward, lateralMm: newLateral };
        if (dragRef.current!.mirrorId && s.id === dragRef.current!.mirrorId) return { ...s, forwardMm: newForward, lateralMm: -newLateral };
        return s;
      }),
    );
  }

  function handlePointerUp(): void {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (!dragRef.current) return;
    dragRef.current = null;
    // Read via the ref rather than a functional setState updater: React StrictMode
    // double-invokes updater functions, which would double-push this undo entry.
    const ordered = orderSensorsLeftToRight(sensorsRef.current);
    undoRef.current!.push(structuredClone(ordered));
    setSensors(ordered);
  }

  function handleWheel(e: React.WheelEvent): void {
    const g = getTransform();
    const canvas = canvasRef.current;
    if (!g || !canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => zoomTowardPoint(g.fit, v, sx, sy, factor));
  }

  function zoomButton(factor: number): void {
    const g = getTransform();
    if (!g) return;
    setView((v) => zoomTowardPoint(g.fit, v, g.w / 2, g.h / 2, factor));
  }

  // ---- Draw ----
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

    // Live preview: the current map's line-track bitmap, transformed into this robot-local
    // (forward-up, lateral-right) frame as seen from the map's start pose — the exact inverse of
    // `sensorWorldPosition`'s body->world transform, so what's drawn under a sensor here is exactly
    // what that sensor would read at the starting line.
    if (linePreview) {
      if (bitmapCanvasRef.current?.mapId !== mapId) {
        bitmapCanvasRef.current = { mapId, canvas: bitmapToImageBitmapCanvas(linePreview.bitmap) };
      }
      const { x: x0, y: y0, theta } = linePreview.startPose;
      ctx.save();
      ctx.translate(t.offsetX, t.offsetY);
      ctx.scale(t.scale, t.scale);
      ctx.translate(viewHalfMm, viewHalfMm);
      ctx.rotate(-theta - Math.PI / 2);
      ctx.translate(-x0, -y0);
      ctx.scale(linePreview.bitmap.mmPerPixel, linePreview.bitmap.mmPerPixel);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bitmapCanvasRef.current.canvas, 0, 0);
      ctx.restore();
    } else {
      ctx.fillStyle = '#18181b';
      const [ox, oy] = toScreen(t, 0, 0);
      ctx.fillRect(ox, oy, worldW * t.scale, worldH * t.scale);
    }

    // Grid, every 10mm.
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let mm = -viewHalfMm; mm <= viewHalfMm; mm += 10) {
      const [x1, y1] = layoutToScreen(t, viewHalfMm, mm);
      const [x2, y2] = layoutToScreen(t, -viewHalfMm, mm);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [x3, y3] = layoutToScreen(t, mm, -viewHalfMm);
      const [x4, y4] = layoutToScreen(t, mm, viewHalfMm);
      ctx.beginPath();
      ctx.moveTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.stroke();
    }

    // Chassis footprint — same bounds sensorRules.ts's SP005 checks against.
    const halfWidth = robot.chassisWidthMm / 2;
    const rearBoundMm = -robot.wheelBase * 0.75;
    const frontBoundMm = robot.wheelBase * 1.5;
    const [fx1, fy1] = layoutToScreen(t, frontBoundMm, -halfWidth);
    const [fx2, fy2] = layoutToScreen(t, rearBoundMm, halfWidth);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(Math.min(fx1, fx2), Math.min(fy1, fy2), Math.abs(fx2 - fx1), Math.abs(fy2 - fy1));

    // Wheel axis (forwardMm = 0) and centerline (lateralMm = 0).
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const [ax1, ay1] = layoutToScreen(t, 0, -halfWidth * 1.4);
    const [ax2, ay2] = layoutToScreen(t, 0, halfWidth * 1.4);
    ctx.moveTo(ax1, ay1);
    ctx.lineTo(ax2, ay2);
    ctx.stroke();
    ctx.beginPath();
    const [cx1, cy1] = layoutToScreen(t, rearBoundMm, 0);
    const [cx2, cy2] = layoutToScreen(t, frontBoundMm, 0);
    ctx.moveTo(cx1, cy1);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nose marker.
    const [nx, ny] = layoutToScreen(t, frontBoundMm, 0);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx - 6, ny + 10);
    ctx.lineTo(nx + 6, ny + 10);
    ctx.closePath();
    ctx.fill();

    // Blind gaps (SP003), rendered directly rather than just described.
    if (mode === 'line' && linePreview) {
      const gaps = findBlindGaps(sensors, linePreview.trackWidthMm);
      for (const gap of gaps) {
        const a = sensors.find((s) => s.id === gap.aId)!;
        const b = sensors.find((s) => s.id === gap.bId)!;
        const midForward = (a.forwardMm + b.forwardMm) / 2;
        const [gx1, gy1] = layoutToScreen(t, midForward + 8, a.lateralMm);
        const [gx2, gy2] = layoutToScreen(t, midForward - 8, b.lateralMm);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fillRect(Math.min(gx1, gx2), Math.min(gy1, gy2), Math.abs(gx2 - gx1), Math.abs(gy2 - gy1));
      }
    }

    // Sensors.
    for (const s of sensors) {
      const [scx, scy] = layoutToScreen(t, s.forwardMm, s.lateralMm);
      const selected = s.id === selectedId;
      if (s.type === 'reflectance') {
        const rPx = Math.max(4, (s.spotRadiusMm ?? DEFAULT_SPOT_RADIUS_MM) * t.scale);
        ctx.fillStyle = selected ? '#38bdf8' : '#e5e5e5';
        ctx.strokeStyle = selected ? '#0ea5e9' : '#525252';
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(scx, scy, rPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        const headingRad = (s.headingDeg * Math.PI) / 180;
        const dirLateral = Math.sin(headingRad);
        const dirForward = -Math.cos(headingRad);
        const rangeMm = Math.min(s.maxRangeMm ?? MAX_RAY_DISPLAY_MM, MAX_RAY_DISPLAY_MM);
        const [rx, ry] = toScreen(t, s.lateralMm + viewHalfMm + dirLateral * rangeMm, -s.forwardMm + viewHalfMm + dirForward * rangeMm);
        ctx.strokeStyle = selected ? '#38bdf8' : 'rgba(244, 114, 182, 0.6)';
        ctx.lineWidth = selected ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(scx, scy);
        ctx.lineTo(rx, ry);
        ctx.stroke();
        ctx.fillStyle = selected ? '#38bdf8' : '#f472b6';
        ctx.beginPath();
        ctx.arc(scx, scy, selected ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });

  if (!open) return null;

  const availablePresets = presetsFor(mode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex h-[42rem] w-[72rem] max-w-full flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
          <span className="text-sm font-semibold text-neutral-200">Sensor layout — {robot.name}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sensor editor"
            className="rounded px-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div ref={containerRef} className="relative min-w-0 flex-1 bg-black">
            <canvas
              ref={canvasRef}
              className="block h-full w-full cursor-crosshair"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
            />
            <div className="absolute bottom-3 right-3 flex gap-1 rounded-md border border-neutral-800 bg-neutral-900/90 p-1 shadow-lg">
              <button type="button" title="Zoom out" onClick={() => zoomButton(1 / 1.4)} className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white">
                <ZoomOutIcon />
              </button>
              <button type="button" title="Reset zoom" onClick={() => setView(resetCanvasView())} className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white">
                <FitScreenIcon />
              </button>
              <button type="button" title="Zoom in" onClick={() => zoomButton(1.4)} className="rounded p-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white">
                <ZoomInIcon />
              </button>
            </div>
            <p className="absolute left-3 top-3 max-w-xs rounded-md border border-neutral-800 bg-neutral-900/90 px-2 py-1 text-[11px] text-neutral-400">
              Drag a sensor to move it (1mm snap, Shift for free placement). Middle-drag to pan, wheel to zoom.
            </p>
          </div>

          <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto scroll-thin border-l border-neutral-800 bg-neutral-900/40 p-3 text-xs">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-neutral-300">
                <input type="checkbox" checked={mirrorMode} onChange={(e) => setMirrorMode(e.target.checked)} />
                Mirror mode
              </label>
              <div className="flex gap-1.5">
                <button type="button" onClick={handleUndo} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-neutral-600">
                  <UndoIcon /> Undo
                </button>
                <button type="button" onClick={handleRedo} className="flex flex-1 items-center justify-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-neutral-300 hover:border-neutral-600">
                  <RedoIcon /> Redo
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Presets</h2>
              <select
                value={presetId}
                onChange={(e) => {
                  setPresetId(e.target.value);
                  const preset = availablePresets.find((p) => p.id === e.target.value);
                  if (preset) applyPreset(preset);
                }}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-100"
              >
                <option value="">Choose a preset…</option>
                <optgroup label="Built-in">
                  {availablePresets
                    .filter((p) => !isSensorLayoutRuntimeId(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </optgroup>
                {availablePresets.some((p) => isSensorLayoutRuntimeId(p.id)) && (
                  <optgroup label="Your saved layouts">
                    {availablePresets
                      .filter((p) => isSensorLayoutRuntimeId(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </div>

            {mode === 'line' && (
              <div className="flex flex-col gap-1.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Array helper</h2>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex flex-col gap-0.5 text-neutral-500">
                    Span (mm)
                    <input type="number" value={arraySpanMm} onChange={(e) => setArraySpanMm(Number(e.target.value))} className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-neutral-100" />
                  </label>
                  <label className="flex flex-col gap-0.5 text-neutral-500">
                    Forward offset (mm)
                    <input type="number" value={arrayForwardMm} onChange={(e) => setArrayForwardMm(Number(e.target.value))} className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-neutral-100" />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-neutral-400">
                  <input type="checkbox" checked={staggered} onChange={(e) => setStaggered(e.target.checked)} />
                  Staggered two-row
                </label>
                {staggered && (
                  <label className="flex flex-col gap-0.5 text-neutral-500">
                    Stagger (mm)
                    <input type="number" value={arrayStaggerMm} onChange={(e) => setArrayStaggerMm(Number(e.target.value))} className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-neutral-100" />
                  </label>
                )}
                <button type="button" onClick={handleGenerateArray} className="rounded-md border border-neutral-700 px-2 py-1.5 text-neutral-300 hover:border-neutral-600">
                  Generate {sensors.length || 5}-sensor array
                </button>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  Sensors ({sensors.length}/{maxCount})
                </h2>
                <button type="button" onClick={handleAddSensor} disabled={sensors.length >= maxCount} className="rounded-md border border-neutral-700 px-2 py-0.5 text-neutral-300 hover:border-neutral-600 disabled:opacity-30">
                  + Add
                </button>
              </div>
              <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto scroll-thin">
                {orderSensorsLeftToRight(sensors).map((s) => (
                  <li
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-md border px-2 py-1 ${
                      s.id === selectedId ? 'border-sky-600 bg-sky-950/40 text-sky-300' : 'border-neutral-800 text-neutral-400'
                    }`}
                  >
                    <span>
                      {s.id} · fwd {s.forwardMm.toFixed(0)}mm, lat {s.lateralMm.toFixed(0)}mm
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSensor(s.id);
                      }}
                      disabled={sensors.length <= minCount}
                      aria-label={`Remove ${s.id}`}
                      className="text-neutral-500 hover:text-red-400 disabled:opacity-30"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Validation {issues.length > 0 ? `(${issues.length})` : ''}
              </h2>
              {issues.length === 0 ? (
                <p className="text-neutral-500">No issues found.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {issues.map((issue, i) => (
                    <li key={`${issue.code}-${i}`} className={`rounded-md border px-2 py-1 ${SEVERITY_STYLE[issue.severity]}`}>
                      <span className="font-semibold">{issue.code}</span> — {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-auto flex flex-col gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={48}
                placeholder="Layout name"
                className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-neutral-100 focus:border-sky-600 focus:outline-none"
              />
              {saveError && <p className="text-red-400">{saveError}</p>}
              {hasErrors && !saveError && <p className="text-red-400">Fix the error(s) above before saving.</p>}
              {savedFlash && !saveError && <p className="text-emerald-400">Saved ✓</p>}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={hasErrors}
                  className="flex-1 rounded-md bg-sky-600 px-3 py-1.5 font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save
                </button>
                <button type="button" onClick={handleResetToDefault} className="flex-1 rounded-md border border-neutral-700 px-3 py-1.5 font-semibold text-neutral-100 hover:border-neutral-600">
                  Reset to default
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
