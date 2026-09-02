import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
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

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-base font-bold tracking-tight hover:text-sky-400">
            <span aria-hidden className="text-sky-500">
              ▸
            </span>
            VectorTrack
          </Link>
          <ModeTabs />
        </div>
        <SettingsButton />
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto scroll-thin border-r border-neutral-800 bg-neutral-900/40 p-3">
          <Section title="Map">
            <MapList />
          </Section>
          <Section title="Robot">
            <RobotSelect />
          </Section>
          <Section title="Algorithm">
            <AlgorithmSelect />
          </Section>
          <Section title="Parameters">
            <ParamPanel />
          </Section>
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
    </div>
  );
}
