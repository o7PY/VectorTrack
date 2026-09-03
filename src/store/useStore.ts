import { create } from 'zustand';
import type { Pose2D, RunStatus } from '../sim/core/types';
import { getDefaultParams } from '../algorithms/registry';
import { advanceEngine, buildLine, buildMaze, getLoop, stepEngineOnce } from './engine';
import type { EngineSnapshot } from './engine';
import { clearSaveData, loadSaveData, saveSaveDataDebounced } from './persistence';
import type { SaveData } from './persistence';

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
  trail: { x: number; y: number }[];
  resultBannerDismissed: boolean;

  tunedParams: Record<string, Record<string, number | string>>;
  bestRuns: Record<string, { completed: boolean; timeMs: number; achievedAt: string }>;
  completedMaps: string[];

  selectMode: (mode: Mode) => void;
  selectMap: (mapId: string) => void;
  selectRobot: (robotId: string) => void;
  selectAlgorithm: (algorithmId: string) => void;
  setParam: (key: string, value: number | string) => void;
  resetParamsToDefault: () => void;

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

function runKey(mapId: string, robotId: string, algorithmId: string): string {
  return `${mapId}:${robotId}:${algorithmId}`;
}

function buildEngineFor(mode: Mode, mapId: string, robotId: string, algorithmId: string): EngineSnapshot {
  return mode === 'line' ? buildLine(mapId, robotId, algorithmId) : buildMaze(mapId, robotId, algorithmId);
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
);
const initialParamsKey = paramsKey(initialSave.lastSession.robotId, initialSave.lastSession.algorithmId);
const initialParams =
  initialSave.tunedParams[initialParamsKey] ?? getDefaultParams(initialSave.lastSession.robotId, initialSave.lastSession.algorithmId);

export const useStore = create<StoreState>((set, get) => {
  function persist(): void {
    const s = get();
    const data: SaveData = {
      schemaVersion: 2,
      lastSession: { mode: s.mode, mapId: s.mapId, robotId: s.robotId, algorithmId: s.algorithmId },
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

  function rebuild(mode: Mode, mapId: string, robotId: string, algorithmId: string): void {
    getLoop().pause();
    const snapshot = buildEngineFor(mode, mapId, robotId, algorithmId);
    set({
      mode,
      mapId,
      robotId,
      algorithmId,
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
    const key = runKey(s.mapId, s.robotId, s.algorithmId);
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
      rebuild(mode, mapId, robotId, algorithmId);
      persist();
    },
    selectMap(mapId) {
      const s = get();
      if (mapId === s.mapId) return;
      rebuild(s.mode, mapId, s.robotId, s.algorithmId);
      persist();
    },
    selectRobot(robotId) {
      const s = get();
      if (robotId === s.robotId) return;
      rebuild(s.mode, s.mapId, robotId, s.algorithmId);
      persist();
    },
    selectAlgorithm(algorithmId) {
      const s = get();
      if (algorithmId === s.algorithmId) return;
      rebuild(s.mode, s.mapId, s.robotId, algorithmId);
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
      const { baseSpeed, ...rest } = s.params;
      const snapshot = stepEngineOnce(rest, Number(baseSpeed) || 0);
      const patch = applySnapshot(snapshot, s.mode, s.trail, s.lineTelemetry?.errorHistory ?? []);
      set(patch);
      maybeFinalizeRun();
    },
    reset() {
      const s = get();
      rebuild(s.mode, s.mapId, s.robotId, s.algorithmId);
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
      rebuild(s.mode, s.mapId, s.robotId, s.algorithmId);
    },

    tick(realDtSeconds) {
      const s = get();
      if (!s.playing) return;
      const { baseSpeed, ...rest } = s.params;
      getLoop().speedMultiplier = s.speedMultiplier;
      const snapshot = advanceEngine(realDtSeconds, rest, Number(baseSpeed) || 0);
      const patch = applySnapshot(snapshot, s.mode, s.trail, s.lineTelemetry?.errorHistory ?? []);
      set(patch);
      maybeFinalizeRun();
    },
  };
});
