import { create } from 'zustand';
import type { Pose2D, RunStatus } from '../sim/core/types';
import { getAlgorithmMeta, getDefaultParams } from '../algorithms/registry';
import type { AlgorithmMeta } from '../algorithms/registry';
import { advanceEngine, buildLine, buildMaze, getLoop, hotSwapVtlAlgorithm, stepEngineOnce } from './engine';
import type { EngineSnapshot } from './engine';
import { clearSaveData, loadSaveData, saveSaveDataDebounced } from './persistence';
import type { SaveData } from './persistence';
import { isVtlRuntimeId, toBareVtlId } from './customAlgorithmResolvers';
import { compile } from '../vtl/compile';
import type { CompileResult } from '../vtl/types';
import { clearAlgorithmDraft, getCustomAlgorithm, loadCustomAlgorithmStore, saveCustomAlgorithmStore, upsertCustomAlgorithm } from './customAlgorithms';
import type { CustomAlgorithm } from '../algorithms/custom/types';

// Native controllers take `baseSpeed` as a separate positional argument (see engine.ts's
// `tickOnce`), so it must be split out of `params` before reaching them. VTL programs have no such
// concept — `drive()` takes explicit wheel speeds — so a `vtl:${id}` algorithm that happens to
// declare its own `param baseSpeed` must see it via the `params` dict like any other param, never
// silently stripped.
function splitBaseSpeed(algorithmId: string, params: Record<string, number | string>): { rest: Record<string, number | string>; baseSpeed: number } {
  if (isVtlRuntimeId(algorithmId)) return { rest: params, baseSpeed: 0 };
  const { baseSpeed, ...rest } = params;
  return { rest, baseSpeed: Number(baseSpeed) || 0 };
}

export type Mode = 'line' | 'maze';
export type ViewMode = '2d' | '3d';
export type CameraPreset = 'iso' | 'top' | 'chase';

const ERROR_HISTORY_LEN = 240; // ~12s at 20Hz
const TRAIL_MAX_POINTS = 600;

export interface LineTelemetry {
  sensors: number[];
  error: number;
  p: number;
  i: number;
  d: number;
  errorHistory: number[];
}

export interface MazeTelemetry {
  sensors: { front: number; left: number; right: number };
  cell: { row: number; col: number };
  cellsVisited: number;
  phase: string;
}

interface StoreState {
  mode: Mode;
  mapId: string;
  robotId: string;
  algorithmId: string;
  layoutId: string;
  params: Record<string, number | string>;

  playing: boolean;
  speedMultiplier: number;
  viewMode: ViewMode;
  cameraPreset: CameraPreset;
  showSensorOverlay: boolean;

  pose: Pose2D;
  vLeft: number;
  vRight: number;
  simTime: number;
  status: RunStatus;
  lineTelemetry: LineTelemetry | null;
  mazeTelemetry: MazeTelemetry | null;
  vtlError: string | null;
  trail: { x: number; y: number }[];
  resultBannerDismissed: boolean;

  tunedParams: Record<string, Record<string, number | string>>;
  bestRuns: Record<string, { completed: boolean; timeMs: number; achievedAt: string }>;
  completedMaps: string[];

  selectMode: (mode: Mode) => void;
  selectMap: (mapId: string) => void;
  selectRobot: (robotId: string) => void;
  selectAlgorithm: (algorithmId: string) => void;
  selectSensorLayout: (layoutId: string) => void;
  setParam: (key: string, value: number | string) => void;
  resetParamsToDefault: () => void;
  updateAlgorithmSource: (newSource: string) => CompileResult;

  play: () => void;
  pause: () => void;
  step: () => void;
  reset: () => void;
  setSpeedMultiplier: (v: number) => void;
  setViewMode: (v: ViewMode) => void;
  setCameraPreset: (v: CameraPreset) => void;
  toggleSensorOverlay: () => void;
  dismissResultBanner: () => void;
  resetAllProgress: () => void;

  tick: (realDtSeconds: number) => void;
}

function paramsKey(robotId: string, algorithmId: string): string {
  return `${robotId}:${algorithmId}`;
}

// Keyed `${mapId}:${robotId}:${algorithmId}:${layoutId}` since schemaVersion 3 (Algorithms.md §6 /
// Amendment A4) — sensor placement changes results, so a best time isn't comparable across layouts.
// `layoutId` defaults to `robotId` (a robot's own implicit default layout) — must match
// `store/persistence.ts`'s `migrateBestRunKeysV2ToV3` assumption exactly.
function runKey(mapId: string, robotId: string, algorithmId: string, layoutId: string = robotId): string {
  return `${mapId}:${robotId}:${algorithmId}:${layoutId}`;
}

function buildEngineFor(mode: Mode, mapId: string, robotId: string, algorithmId: string, layoutId: string): EngineSnapshot {
  return mode === 'line' ? buildLine(mapId, robotId, algorithmId, layoutId) : buildMaze(mapId, robotId, algorithmId, layoutId);
}

// Algorithms.md §3.2: "Param declarations changing (new param, changed range) rebuilds the control
// panel, keeping values for params whose name/range still match." A param whose range moved, or
// that's new, falls back to its freshly-declared default rather than an old value that may now be
// out of bounds or nonsensical.
function mergeParamsOnDeclarationChange(
  oldParams: Record<string, number | string>,
  oldMeta: AlgorithmMeta,
  newMeta: AlgorithmMeta,
  newDefaults: Record<string, number | string>,
): Record<string, number | string> {
  const next: Record<string, number | string> = {};
  for (const p of newMeta.params) {
    const oldSpec = oldMeta.params.find((op) => op.key === p.key);
    const rangeMatches = oldSpec && oldSpec.min === p.min && oldSpec.max === p.max;
    next[p.key] = rangeMatches && p.key in oldParams ? oldParams[p.key] : newDefaults[p.key];
  }
  for (const cp of newMeta.choiceParams ?? []) {
    const oldCp = oldMeta.choiceParams?.find((o) => o.key === cp.key);
    const optionsMatch = oldCp && oldCp.options.length === cp.options.length && oldCp.options.every((o, i) => o.value === cp.options[i]?.value);
    const oldValue = oldParams[cp.key];
    next[cp.key] = optionsMatch && typeof oldValue === 'string' && cp.options.some((o) => o.value === oldValue) ? oldValue : newDefaults[cp.key];
  }
  return next;
}

interface EnginePatch {
  pose: Pose2D;
  vLeft: number;
  vRight: number;
  simTime: number;
  status: RunStatus;
  trail: { x: number; y: number }[];
  lineTelemetry: LineTelemetry | null;
  mazeTelemetry: MazeTelemetry | null;
  vtlError: string | null;
}

function applySnapshot(snapshot: EngineSnapshot, mode: Mode, trail: { x: number; y: number }[], prevErrorHistory: number[]): EnginePatch {
  const nextTrail = trail.length >= TRAIL_MAX_POINTS ? trail.slice(1) : trail;

  let lineTelemetry: LineTelemetry | null = null;
  let mazeTelemetry: MazeTelemetry | null = null;
  if (mode === 'line' && snapshot.line) {
    const history = prevErrorHistory.length >= ERROR_HISTORY_LEN ? prevErrorHistory.slice(1) : prevErrorHistory;
    lineTelemetry = {
      sensors: snapshot.line.sensors,
      error: snapshot.line.error,
      p: snapshot.line.p,
      i: snapshot.line.i,
      d: snapshot.line.d,
      errorHistory: [...history, snapshot.line.error],
    };
  } else if (mode === 'maze' && snapshot.maze) {
    mazeTelemetry = {
      sensors: snapshot.maze.sensors,
      cell: snapshot.maze.cell,
      cellsVisited: snapshot.maze.cellsVisited,
      phase: snapshot.maze.phase,
    };
  }

  return {
    pose: snapshot.pose,
    vLeft: snapshot.vLeft,
    vRight: snapshot.vRight,
    simTime: snapshot.simTime,
    status: snapshot.status,
    trail: [...nextTrail, { x: snapshot.pose.x, y: snapshot.pose.y }],
    lineTelemetry,
    mazeTelemetry,
    vtlError: snapshot.vtlError ?? null,
  };
}

const initialSave: SaveData = loadSaveData();

// Computed eagerly (not inside the zustand creator) because `get()` can't
// read the state being constructed during the creator's own invocation —
// without this, a fresh load whose saved selection already matches the
// defaults would never trigger rebuild() (which only fires on a *change*),
// leaving params/pose/engine state stuck at empty placeholders forever.
const initialSnapshot = buildEngineFor(
  initialSave.lastSession.mode,
  initialSave.lastSession.mapId,
  initialSave.lastSession.robotId,
  initialSave.lastSession.algorithmId,
  initialSave.lastSession.layoutId,
);
const initialParamsKey = paramsKey(initialSave.lastSession.robotId, initialSave.lastSession.algorithmId);
const initialParams =
  initialSave.tunedParams[initialParamsKey] ?? getDefaultParams(initialSave.lastSession.robotId, initialSave.lastSession.algorithmId);

export const useStore = create<StoreState>((set, get) => {
  function persist(): void {
    const s = get();
    const data: SaveData = {
      schemaVersion: 3,
      lastSession: { mode: s.mode, mapId: s.mapId, robotId: s.robotId, algorithmId: s.algorithmId, layoutId: s.layoutId },
      tunedParams: s.tunedParams,
      bestRuns: s.bestRuns,
      completedMaps: s.completedMaps,
      settings: {
        viewMode: s.viewMode,
        cameraPreset: s.cameraPreset,
        speedMultiplier: s.speedMultiplier,
        showSensorOverlay: s.showSensorOverlay,
      },
    };
    saveSaveDataDebounced(data);
  }

  function loadParamsFor(robotId: string, algorithmId: string): Record<string, number | string> {
    const key = paramsKey(robotId, algorithmId);
    const tuned = get().tunedParams[key];
    return tuned ? { ...tuned } : getDefaultParams(robotId, algorithmId);
  }

  function rebuild(mode: Mode, mapId: string, robotId: string, algorithmId: string, layoutId: string): void {
    getLoop().pause();
    const snapshot = buildEngineFor(mode, mapId, robotId, algorithmId, layoutId);
    set({
      mode,
      mapId,
      robotId,
      algorithmId,
      layoutId,
      params: loadParamsFor(robotId, algorithmId),
      playing: false,
      resultBannerDismissed: false,
      ...applySnapshot(snapshot, mode, [], []),
    });
  }

  function maybeFinalizeRun(): void {
    const s = get();
    if (s.status.outcome !== 'success' && s.status.outcome !== 'failed') return;
    getLoop().pause();
    if (s.status.outcome !== 'success') {
      set({ playing: false });
      return;
    }
    const key = runKey(s.mapId, s.robotId, s.algorithmId, s.layoutId);
    const existing = s.bestRuns[key];
    const timeMs = s.status.elapsedMs;
    const isBest = !existing || !existing.completed || timeMs < existing.timeMs;
    const nextBestRuns = isBest
      ? { ...s.bestRuns, [key]: { completed: true, timeMs, achievedAt: new Date().toISOString() } }
      : s.bestRuns;
    const nextCompleted = s.completedMaps.includes(s.mapId) ? s.completedMaps : [...s.completedMaps, s.mapId];
    set({ bestRuns: nextBestRuns, completedMaps: nextCompleted, playing: false });
    persist();
  }

  return {
    mode: initialSave.lastSession.mode,
    mapId: initialSave.lastSession.mapId,
    robotId: initialSave.lastSession.robotId,
    algorithmId: initialSave.lastSession.algorithmId,
    layoutId: initialSave.lastSession.layoutId,
    params: initialParams,

    playing: false,
    speedMultiplier: initialSave.settings.speedMultiplier,
    viewMode: initialSave.settings.viewMode,
    cameraPreset: initialSave.settings.cameraPreset,
    showSensorOverlay: initialSave.settings.showSensorOverlay,

    resultBannerDismissed: false,
    ...applySnapshot(initialSnapshot, initialSave.lastSession.mode, [], []),

    tunedParams: initialSave.tunedParams,
    bestRuns: initialSave.bestRuns,
    completedMaps: initialSave.completedMaps,

    selectMode(mode) {
      if (mode === get().mode) return;
      const robotId = mode === 'line' ? 'lf-scout' : 'mz-probe';
      const mapId = mode === 'line' ? 'lf-oval' : 'mz-intro';
      const algorithmId = mode === 'line' ? 'pid' : 'wallFollower';
      rebuild(mode, mapId, robotId, algorithmId, robotId);
      persist();
    },
    selectMap(mapId) {
      const s = get();
      if (mapId === s.mapId) return;
      rebuild(s.mode, mapId, s.robotId, s.algorithmId, s.layoutId);
      persist();
    },
    selectRobot(robotId) {
      const s = get();
      if (robotId === s.robotId) return;
      // A custom layout is fit to a specific chassis (`basedOnRobotId`) — switching robots resets
      // to the new robot's own default layout rather than carrying over one that may not apply.
      rebuild(s.mode, s.mapId, robotId, s.algorithmId, robotId);
      persist();
    },
    selectAlgorithm(algorithmId) {
      const s = get();
      if (algorithmId === s.algorithmId) return;
      rebuild(s.mode, s.mapId, s.robotId, algorithmId, s.layoutId);
      persist();
    },
    selectSensorLayout(layoutId) {
      const s = get();
      if (layoutId === s.layoutId) return;
      rebuild(s.mode, s.mapId, s.robotId, s.algorithmId, layoutId);
      persist();
    },
    setParam(key, value) {
      const s = get();
      const nextParams = { ...s.params, [key]: value };
      const tunedKey = paramsKey(s.robotId, s.algorithmId);
      set({
        params: nextParams,
        tunedParams: { ...s.tunedParams, [tunedKey]: nextParams },
      });
      persist();
    },
    resetParamsToDefault() {
      const s = get();
      const defaults = getDefaultParams(s.robotId, s.algorithmId);
      const tunedKey = paramsKey(s.robotId, s.algorithmId);
      const nextTuned = { ...s.tunedParams };
      delete nextTuned[tunedKey];
      set({ params: defaults, tunedParams: nextTuned });
      persist();
    },
    // Algorithms.md §3.2's "source edit that compiles" / "source edit that fails" split. A saved
    // `CustomAlgorithm.source` is expected to always compile (customAlgorithmResolvers.ts's own
    // doc comment) — so on failure, nothing is persisted and nothing in the running sim changes;
    // only the in-progress broken text lives in the editor's own draft autosave. On success, the
    // real store is updated (clearing that draft), the running controller is hot-swapped in place
    // preserving matching `state`, and the param panel is rebuilt preserving matching `param`s.
    updateAlgorithmSource(newSource) {
      const s = get();
      if (!isVtlRuntimeId(s.algorithmId)) return { ok: false, errors: [] };

      const result = compile(newSource, s.mode);
      if (!result.ok) return result;

      const oldMeta = getAlgorithmMeta(s.algorithmId);

      const bareId = toBareVtlId(s.algorithmId);
      const store = loadCustomAlgorithmStore();
      const existing = getCustomAlgorithm(store, bareId);
      const now = new Date().toISOString();
      const updated: CustomAlgorithm = {
        id: bareId,
        name: existing?.name ?? bareId,
        mode: s.mode,
        source: newSource,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastCompile: { ok: true, codes: [] },
      };
      saveCustomAlgorithmStore(upsertCustomAlgorithm(store, updated));
      clearAlgorithmDraft(bareId);

      hotSwapVtlAlgorithm(result.program);

      const newMeta = getAlgorithmMeta(s.algorithmId);
      const newDefaults = getDefaultParams(s.robotId, s.algorithmId);
      const nextParams = mergeParamsOnDeclarationChange(s.params, oldMeta, newMeta, newDefaults);
      const tunedKey = paramsKey(s.robotId, s.algorithmId);
      set({ params: nextParams, tunedParams: { ...s.tunedParams, [tunedKey]: nextParams }, vtlError: null });

      return result;
    },

    play() {
      if (get().status.outcome === 'success' || get().status.outcome === 'failed') return;
      getLoop().play();
      set({ playing: true, resultBannerDismissed: false });
    },
    pause() {
      getLoop().pause();
      set({ playing: false });
    },
    step() {
      const s = get();
      if (s.status.outcome === 'success' || s.status.outcome === 'failed') return;
      const { rest, baseSpeed } = splitBaseSpeed(s.algorithmId, s.params);
      const snapshot = stepEngineOnce(rest, baseSpeed);
      const patch = applySnapshot(snapshot, s.mode, s.trail, s.lineTelemetry?.errorHistory ?? []);
      set(patch);
      maybeFinalizeRun();
    },
    reset() {
      const s = get();
      rebuild(s.mode, s.mapId, s.robotId, s.algorithmId, s.layoutId);
    },
    setSpeedMultiplier(v) {
      set({ speedMultiplier: v });
      persist();
    },
    setViewMode(v) {
      set({ viewMode: v });
      persist();
    },
    setCameraPreset(v) {
      set({ cameraPreset: v });
      persist();
    },
    toggleSensorOverlay() {
      set((s) => ({ showSensorOverlay: !s.showSensorOverlay }));
      persist();
    },
    dismissResultBanner() {
      set({ resultBannerDismissed: true });
    },
    resetAllProgress() {
      clearSaveData();
      set({
        tunedParams: {},
        bestRuns: {},
        completedMaps: [],
      });
      const s = get();
      rebuild(s.mode, s.mapId, s.robotId, s.algorithmId, s.layoutId);
    },

    tick(realDtSeconds) {
      const s = get();
      if (!s.playing) return;
      const { rest, baseSpeed } = splitBaseSpeed(s.algorithmId, s.params);
      getLoop().speedMultiplier = s.speedMultiplier;
      const snapshot = advanceEngine(realDtSeconds, rest, baseSpeed);
      const patch = applySnapshot(snapshot, s.mode, s.trail, s.lineTelemetry?.errorHistory ?? []);
      set(patch);
      maybeFinalizeRun();
    },
  };
});
