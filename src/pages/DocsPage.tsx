import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CodeBlock, SectionHeading, SubSection } from './docs/DocsShared';
import { LineFollowerDocs } from './docs/LineFollowerDocs';
import { MazeSolverDocs } from './docs/MazeSolverDocs';
import { MapMakerDocs } from './docs/MapMakerDocs';
import Logo from '../ui/Logo';

// HashRouter owns the URL hash for routing — an <a href="#id"> anchor would
// be read as a route change and blank the page. Scroll via the DOM instead.
function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const TOC: { id: string; label: string; children?: { id: string; label: string }[] }[] = [
  { id: 'simulator', label: 'Simulator' },
  {
    id: 'line-follower',
    label: 'Line Follower',
    children: [
      { id: 'line-algorithm', label: 'Algorithm' },
      { id: 'line-robot', label: 'Robot' },
      { id: 'line-map', label: 'Map' },
      { id: 'line-utility', label: 'Utility' },
    ],
  },
  {
    id: 'maze-solver',
    label: 'Maze Solver',
    children: [
      { id: 'maze-algorithm', label: 'Algorithm' },
      { id: 'maze-robot', label: 'Robot' },
      { id: 'maze-map', label: 'Map' },
      { id: 'maze-utility', label: 'Utility' },
    ],
  },
  {
    id: 'map-maker',
    label: 'Map Maker',
    children: [
      { id: 'map-maker-list', label: 'My Maps' },
      { id: 'map-maker-maze-editor', label: 'Maze editor' },
      { id: 'map-maker-line-editor', label: 'Line editor' },
      { id: 'map-maker-validation', label: 'Validation' },
      { id: 'map-maker-import-export', label: 'Import / export' },
      { id: 'map-maker-simulator', label: 'Running custom maps' },
      { id: 'map-maker-ai-generation', label: 'AI map generation' },
    ],
  },
];

// Flattened once at module scope so the effect below has a stable list to
// depend on — a literal array recreated every render would resubscribe the
// scroll listener on every render.
const ALL_SECTION_IDS: string[] = TOC.flatMap((s) => [s.id, ...(s.children?.map((c) => c.id) ?? [])]);

/** Tracks which heading is currently at (or just above) the top of the viewport. */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);

  useEffect(() => {
    const topOffset = 96; // sticky nav height + breathing room
    function updateActive() {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - topOffset <= 0) current = id;
      }
      setActive(current);
    }
    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
    return () => {
      window.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, [ids]);

  return active;
}

function Sidebar() {
  const activeId = useActiveSection(ALL_SECTION_IDS);

  return (
    <nav className="sticky top-16 hidden max-h-[calc(100vh-5rem)] w-52 shrink-0 flex-col gap-4 overflow-y-auto py-8 pr-4 text-sm lg:flex">
      {TOC.map((section) => {
        const sectionActive = section.id === activeId || (section.children?.some((c) => c.id === activeId) ?? false);
        return (
          <div key={section.id}>
            <button
              onClick={() => scrollToId(section.id)}
              className={`text-left font-semibold transition-colors ${sectionActive ? 'text-sky-400' : 'text-neutral-200 hover:text-sky-400'}`}
            >
              {section.label}
            </button>
            {section.children && (
              <div className={`mt-1 flex flex-col gap-1 border-l pl-3 transition-colors ${sectionActive ? 'border-sky-500/50' : 'border-neutral-800'}`}>
                {section.children.map((c) => {
                  const childActive = c.id === activeId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => scrollToId(c.id)}
                      className={`text-left transition-colors ${childActive ? 'font-medium text-sky-400' : 'text-neutral-500 hover:text-neutral-200'}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link to="/" className="flex items-center gap-2 text-base font-bold tracking-tight hover:text-sky-400">
          <Logo className="h-6 w-6 rounded-md" />
          VectorTrack
          <span className="ml-1.5 rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
            Docs
          </span>
        </Link>
        <Link
          to="/simulator"
          className="rounded-md bg-sky-500 px-3.5 py-1.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-sky-400"
        >
          Launch Simulator
        </Link>
      </div>
    </header>
  );
}

function SimulatorOverview() {
  return (
    <>
      <SectionHeading id="simulator" eyebrow="Guide" title="Simulator" />
      <p className="pt-4 text-[15px] leading-relaxed text-neutral-300">
        Both modes share one engine: a deterministic, fixed-timestep sim core and a pair of renderers that read
        the exact same state. This page documents each mode's algorithms, robots, maps, and controls in depth —
        see the <Link to="/" className="text-sky-400 hover:underline">homepage</Link>.
      </p>

      <SubSection id="simulator-loop" title="Simulation loop">
        <p>
          A fixed-timestep accumulator ticks the sim core at exactly 120 Hz, decoupled from the browser's render
          rate — the same run produces the same trajectory whether your display is 60 Hz or 144 Hz. The playback
          speed multiplier (0.25×–4×) changes how many of those fixed ticks run per animation frame, not the size
          of a tick.
        </p>
        <CodeBlock
          title="src/ui/useSimulationLoop.ts (concept)"
          code={`const DT = 1 / 120;
accumulator += Math.min(0.25, now - lastFrame); // clamp: avoid a "spiral of death" after a stall
while (accumulator >= DT) {
  if (!document.hidden) tick(DT);               // skip entirely while the tab is backgrounded
  accumulator -= DT;
}`}
        />
      </SubSection>

      <SubSection id="simulator-motion" title="Motion model">
        <p>
          Every robot is a differential-drive chassis: two independently-driven wheels, no slip, no acceleration
          ramp. Wheel speeds are clamped to <code>±maxWheelSpeed</code>, then integrated straight into pose each
          tick — a kinematic model chosen deliberately for a fully deterministic, easy-to-reason-about simulation
          over a physically exhaustive one:
        </p>
        <CodeBlock
          title="src/sim/core/kinematics.ts (concept)"
          code={`const v     = (vLeft + vRight) / 2;
const omega = (vRight - vLeft) / wheelBase;

x     += v * Math.cos(theta) * dt;
y     += v * Math.sin(theta) * dt;
theta += omega * dt;`}
        />
      </SubSection>

      <SubSection id="simulator-determinism" title="Determinism">
        <p>
          The sim core (kinematics, sensor models, all five algorithms) is pure TypeScript with no dependency on
          the DOM, React, or Three.js — and no source of randomness once a map is generated. Same map, robot,
          algorithm, and gains always produce the identical trajectory, every reload.
        </p>
      </SubSection>

      <SubSection id="simulator-rendering" title="Dual rendering">
        <p>
          A 2D debug canvas (sensor readings, raycasts, trajectory trail) and a full 3D scene (chassis, extruded
          maze walls or a textured line-track plane, Isometric/Top-Down/Chase cameras) both read the same zustand
          store. Switching between them mid-run never resets state.
        </p>
      </SubSection>

      <SubSection id="simulator-persistence" title="Persistence">
        <p>
          Tuned gains, best times, and map-completion state are written to <code>localStorage</code> under a
          versioned <code>vectortrack.v2</code> schema, debounced 500ms after the last change, with a corrupt-data
          fallback to defaults (an older <code>vectortrack.v1</code> save is migrated in place on first load). A
          confirm-gated "reset all progress" action clears it entirely. Custom maps built in the{' '}
          <Link to="/editor" className="text-sky-400 hover:underline">Map Maker</Link> live under a separate{' '}
          <code>vectortrack.maps.v1</code> key with its own lifecycle, so resetting progress never touches them.
        </p>
      </SubSection>

      <SubSection id="simulator-offline" title="Self-hosting & offline use">
        <p>
          Everything above runs client-side — no backend, no API calls, no account. Once the project's
          dependencies are installed (the one step that needs a network connection), the app never makes another
          network request; it can be used on a machine with no internet access at all.
        </p>
        <CodeBlock
          title="terminal"
          code={`git clone <this repo>
cd vectortrack
npm install        # one-time, needs a network connection
npm run build      # production build to dist/
npm run preview    # serves dist/ locally, fully offline from here on`}
        />
        <p>
          <code>npm run dev</code> works the same way for day-to-day development. Progress, tuned gains, and best
          times persist locally regardless of which of these you use, since they all read and write the same{' '}
          <code>localStorage</code> key.
        </p>
      </SubSection>
    </>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Nav />
      <div className="mx-auto flex max-w-6xl gap-10 px-6">
        <Sidebar />
        <main className="min-w-0 flex-1 pb-24">
          <SimulatorOverview />
          <LineFollowerDocs />
          <MazeSolverDocs />
          <MapMakerDocs />
        </main>
      </div>
    </div>
  );
}
