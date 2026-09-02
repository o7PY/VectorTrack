// @vitest-environment jsdom
//
// jsdom has no real <canvas> 2D context (that needs the native `canvas`
// package, which we don't depend on), and line-follower maps rasterize a
// bitmap via canvas at build time — so every scenario here stays in maze
// mode, which needs no canvas at all. Line-mode rendering/rasterization is
// left to manual browser verification (see ISSUES.md #10).
import { beforeEach, describe, expect, it, vi } from 'vitest';

function seedMazeSession(): void {
  localStorage.setItem(
    'vectortrack.v1',
    JSON.stringify({
      schemaVersion: 1,
      lastSession: { mode: 'maze', mapId: 'mz-intro', robotId: 'mz-probe', algorithmId: 'wallFollower' },
      tunedParams: {},
      bestRuns: {},
      completedMaps: [],
      settings: { viewMode: '2d', cameraPreset: 'iso', speedMultiplier: 1, showSensorOverlay: true },
    }),
  );
}

describe('store + engine smoke test (jsdom, maze mode only — see file header)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('boots, switches selections, and ticks without throwing', async () => {
    seedMazeSession();
    const { useStore } = await import('./useStore');

    expect(useStore.getState().mode).toBe('maze');
    expect(useStore.getState().status.outcome).toBe('idle');

    useStore.getState().selectMap('mz-island');
    expect(useStore.getState().mapId).toBe('mz-island');

    useStore.getState().selectRobot('mz-sprint');
    expect(useStore.getState().robotId).toBe('mz-sprint');

    useStore.getState().selectAlgorithm('floodFill');
    expect(useStore.getState().algorithmId).toBe('floodFill');

    useStore.getState().play();
    expect(useStore.getState().playing).toBe(true);

    for (let i = 0; i < 300; i++) {
      useStore.getState().tick(1 / 60);
    }

    const s = useStore.getState();
    expect(s.mazeTelemetry).not.toBeNull();
    expect(s.simTime).toBeGreaterThan(0);
    expect(Number.isFinite(s.pose.x)).toBe(true);
    expect(Number.isFinite(s.pose.y)).toBe(true);

    useStore.getState().pause();
    expect(useStore.getState().playing).toBe(false);

    useStore.getState().reset();
    expect(useStore.getState().simTime).toBe(0);
  });

  it('persists tuned params across a reload (fresh store instance)', async () => {
    seedMazeSession();
    vi.resetModules();
    const mod1 = await import('./useStore');
    mod1.useStore.getState().selectAlgorithm('wallFollower');
    mod1.useStore.getState().setParam('hand', 'left');

    // flush the debounced localStorage write
    await new Promise((r) => setTimeout(r, 600));

    vi.resetModules();
    const mod2 = await import('./useStore');
    const s2 = mod2.useStore.getState();
    expect(s2.mode).toBe('maze');
    expect(s2.params.hand).toBe('left');
  });

  it('discards corrupt saved data instead of crashing (persistence layer directly)', async () => {
    // Exercised at the persistence layer, not through the full store/engine:
    // the store's default session is line mode, whose engine build needs a
    // real canvas 2D context (unavailable in jsdom) — orthogonal to what
    // this test checks (SPEC 8: "corrupt data discarded silently").
    localStorage.setItem('vectortrack.v1', '{not json');
    const { loadSaveData, defaultSaveData } = await import('./persistence');
    expect(loadSaveData()).toEqual(defaultSaveData);
  });
});
