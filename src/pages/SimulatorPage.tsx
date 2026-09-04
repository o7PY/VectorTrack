import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useSimulationLoop } from '../ui/useSimulationLoop';
import { ModeTabs } from '../ui/ModeTabs';
import { MapList } from '../ui/MapList';
import { RobotSelect } from '../ui/RobotSelect';
import { AlgorithmSelect } from '../ui/AlgorithmSelect';
import { ParamPanel } from '../ui/ParamPanel';
import { PlaybackBar } from '../ui/PlaybackBar';
import { TelemetryPanel } from '../ui/TelemetryPanel';
import { ResultBanner } from '../ui/ResultBanner';
import { SettingsButton } from '../ui/SettingsButton';
import { Canvas2D } from '../render2d/Canvas2D';
import { Scene3D } from '../render3d/Scene3D';
import Logo from '../ui/Logo';
import { getCustomAlgorithm, loadCustomAlgorithmStore } from '../store/customAlgorithms';
import { isVtlRuntimeId, toBareVtlId } from '../store/customAlgorithmResolvers';
import { CodeEditor } from '../editor/algorithm/CodeEditor';
import { SensorLayoutCanvas } from '../editor/sensors/SensorLayoutCanvas';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </div>
  );
}

export default function SimulatorPage() {
  useSimulationLoop();
  const viewMode = useStore((s) => s.viewMode);
  const mode = useStore((s) => s.mode);
  const robotId = useStore((s) => s.robotId);
  const layoutId = useStore((s) => s.layoutId);
  const algorithmId = useStore((s) => s.algorithmId);
  const selectMode = useStore((s) => s.selectMode);
  const selectAlgorithm = useStore((s) => s.selectAlgorithm);
  const [searchParams, setSearchParams] = useSearchParams();
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);
  const [sensorEditorOpen, setSensorEditorOpen] = useState(false);

  // Consumes the `?algorithm=vtl:<id>` hook written by AlgorithmsPage.tsx's "+ New"/"Edit" actions
  // (Algorithms.md §3.1) — one-shot on mount, then the param is stripped so it never re-fires on a
  // later in-page navigation or re-render. Since that hook only ever fires from a "+ New"/"Edit"
  // click, it also opens the code editor window directly, rather than landing on the simulator with
  // the algorithm merely selected.
  useEffect(() => {
    const requested = searchParams.get('algorithm');
    if (!requested || !isVtlRuntimeId(requested)) return;
    const custom = getCustomAlgorithm(loadCustomAlgorithmStore(), toBareVtlId(requested));
    if (custom && custom.mode !== useStore.getState().mode) selectMode(custom.mode);
    selectAlgorithm(requested);
    setCodeEditorOpen(true);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-base font-bold tracking-tight hover:text-sky-400">
            <Logo className="h-6 w-6 rounded-md" />
            VectorTrack
          </Link>
          <ModeTabs />
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/editor"
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-sky-400 hover:border-neutral-700 hover:text-sky-300"
          >
            Map Maker
          </Link>
          <Link
            to="/algorithms"
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-sky-400 hover:border-neutral-700 hover:text-sky-300"
          >
            My Algorithms
          </Link>
          <SettingsButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto scroll-thin border-r border-neutral-800 bg-neutral-900/40 p-3">
          <Section title="Map">
            <MapList />
          </Section>
          <Section title="Robot">
            <RobotSelect />
            <button
              type="button"
              onClick={() => setSensorEditorOpen(true)}
              className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-sky-400 hover:border-neutral-700 hover:text-sky-300"
            >
              Sensors
            </button>
          </Section>
          <Section title="Algorithm">
            <AlgorithmSelect />
          </Section>
          <Section title="Parameters">
            <ParamPanel />
          </Section>
          {isVtlRuntimeId(algorithmId) && (
            <button
              type="button"
              onClick={() => setCodeEditorOpen(true)}
              className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-sky-400 hover:border-neutral-700 hover:text-sky-300"
            >
              Edit Code
            </button>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-black">
            {viewMode === '3d' ? <Scene3D /> : <Canvas2D />}
            <ResultBanner />
          </div>
          <PlaybackBar />
          <TelemetryPanel />
        </main>
      </div>

      <CodeEditor
        key={algorithmId}
        open={codeEditorOpen}
        onClose={() => setCodeEditorOpen(false)}
        onOpenSensorEditor={() => setSensorEditorOpen(true)}
      />
      <SensorLayoutCanvas key={`${mode}:${robotId}:${layoutId}`} open={sensorEditorOpen} onClose={() => setSensorEditorOpen(false)} />
    </div>
  );
}
