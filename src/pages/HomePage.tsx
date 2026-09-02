import { Link } from 'react-router-dom';
import { TrackAnimation } from './home/TrackAnimation';
import { MazeDiagram } from './home/MazeDiagram';
import { ScreenshotFrame } from './home/ScreenshotFrame';

const REPO_URL = 'https://github.com/o7PY/VectorTrack';

// HashRouter owns the URL hash for routing ("/", "/simulator") — a plain
// <a href="#modes"> would make the browser navigate to that hash, which
// HashRouter reads as a route change to a path that doesn't exist, blanking
// the page. Scrolling to an in-page section has to go through the DOM
// directly instead, never touching location.hash.
function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <span className="flex items-center gap-1.5 text-base font-bold tracking-tight">
          <span aria-hidden className="text-sky-500">
            ▸
          </span>
          VectorTrack
        </span>
        <nav className="hidden items-center gap-6 text-sm text-neutral-400 sm:flex">
          <button onClick={() => scrollToId('modes')} className="hover:text-neutral-100">
            Modes
          </button>
          <button onClick={() => scrollToId('features')} className="hover:text-neutral-100">
            Features
          </button>
          <Link to="/docs" className="hover:text-neutral-100">
            Docs
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-neutral-100">
            <GithubMark />
            GitHub
          </a>
        </nav>
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

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-20 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:gap-6">
      <div>
        <span className="inline-block rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-neutral-500">
          v0.1.0
        </span>
        <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight text-neutral-50 sm:text-5xl">
          Tune the controller.
          <br />
          Watch it drive.
        </h1>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-neutral-400">
          VectorTrack is an in-browser robotics simulator for line-following and maze-solving
          algorithms. Drag a PID gain and watch the correction happen on the next tick — or pit
          flood fill against wall-following on a maze built specifically to defeat one of them.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            to="/simulator"
            className="rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-sky-400"
          >
            Launch Simulator →
          </Link>
          <button
            onClick={() => scrollToId('modes')}
            className="rounded-md border border-neutral-700 px-5 py-2.5 text-sm font-semibold text-neutral-300 transition-colors hover:border-neutral-500 hover:text-neutral-100"
          >
            See what's inside
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2">
        <div className="aspect-[16/9]">
          <TrackAnimation />
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="border-t border-neutral-800 bg-neutral-900/30">
      <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-500">About VectorTrack</h2>
        <p className="mt-3 text-lg leading-relaxed text-neutral-300">
          A small, honest simulation core drives everything: differential-drive kinematics, sensor
          models, and five control algorithms — all pure TypeScript with no dependency on the
          renderer. Two separate views (a 2D debug canvas and a full 3D scene) read the exact same
          state, so switching between them never resets a run.
        </p>
        <p className="mt-4 leading-relaxed text-neutral-400">
          It exists to make control-loop tuning tangible: instead of reading about proportional,
          integral, and derivative terms, you drag a slider and watch oscillation appear — then
          disappear — in real time.
        </p>
      </div>
    </section>
  );
}

function ModesShowcase() {
  return (
    <section id="modes" className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-500">Two modes</h2>
      <p className="mt-2 max-w-lg text-neutral-400">Pick a discipline, pick a map, watch an algorithm try to solve it.</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <div className="mb-5 aspect-[16/9] rounded-md border border-neutral-800 bg-neutral-950 p-3">
            <TrackAnimation />
          </div>
          <h3 className="text-lg font-bold text-neutral-100">Line Follower</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
            A reflectance sensor array reads a black line on white floor. Three algorithms of
            increasing sophistication — Bang-Bang, Proportional, and full PID — try to hold the
            centerline across five tracks, from a gentle warm-up oval to a mixed-difficulty "Grand
            Circuit."
          </p>
          <ul className="mt-4 flex flex-wrap gap-1.5 text-xs">
            {['Bang-Bang', 'Proportional', 'PID'].map((a) => (
              <li key={a} className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-neutral-400">
                {a}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
          <div className="mb-5 aspect-[16/9] rounded-md border border-neutral-800 bg-neutral-950 p-3">
            <MazeDiagram />
          </div>
          <h3 className="text-lg font-bold text-neutral-100">Maze Solver</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
            Front/left/right rangefinders navigate a grid of walls. Wall-following is simple and
            usually works — until a map with a deliberate loop defeats it completely, and flood
            fill's global knowledge solves it anyway.
          </p>
          <ul className="mt-4 flex flex-wrap gap-1.5 text-xs">
            {['Wall Follower', 'Flood Fill'].map((a) => (
              <li key={a} className="rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-neutral-400">
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

interface Feature {
  title: string;
  body: string;
  screenshot: { src: string; path: string; caption: string };
}

const FEATURES: Feature[] = [
  {
    title: 'Live PID tuning',
    body: 'Drag Kp, Ki, or Kd mid-run and the next simulation tick applies it immediately — no restart. Watch overshoot show up and settle out as you turn a single knob.',
    screenshot: { src: '/VectorTrack/screenshots/pid-panel.jpg', path: 'VectorTrack/#/simulator', caption: 'The PID panel: slider + numeric input per gain, reset to defaults.' },
  },
  {
    title: 'Two view modes',
    body: 'A 2D canvas for debugging — sensor readings, raycasts, trajectory trail — and a full 3D scene with Isometric, Top-Down, and Chase camera presets. Same state, zero resets when you switch.',
    screenshot: { src: '/VectorTrack/screenshots/line-follower-2d.jpg', path: 'VectorTrack/#/simulator', caption: '2D debug view — trajectory trail, sensor dots, live telemetry.' },
  },
  {
    title: 'Five algorithms',
    body: 'Bang-Bang, Proportional, and PID for line following; Wall Follower and Flood Fill for maze solving — each with the parameters real implementations expose.',
    screenshot: { src: '/VectorTrack/screenshots/maze-solver-2d.jpg', path: 'VectorTrack/#/simulator', caption: 'Wall-follower raycasts, visualized live as the algorithm decides.' },
  },
  {
    title: 'Ten built-in maps',
    body: 'Five line tracks and five mazes, including one hand-built with a loop specifically to demonstrate where wall-following breaks down and flood fill doesn’t.',
    screenshot: { src: '/VectorTrack/screenshots/line-follower-3d.jpg', path: 'VectorTrack/#/simulator', caption: 'The Warm-Up Oval, one of five line tracks, in the 3D view.' },
  },
  {
    title: 'Deterministic simulation',
    body: 'A fixed 120 Hz physics step, decoupled from render rate. Same map, robot, algorithm, and gains always produce the identical trajectory, every time you reload.',
    screenshot: { src: '/VectorTrack/screenshots/maze-solver-3d.jpg', path: 'VectorTrack/#/simulator', caption: 'Extruded maze walls in the 3D isometric view.' },
  },
];

function Features() {
  return (
    <section id="features" className="border-t border-neutral-800 bg-neutral-900/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-500">Features</h2>
        <div className="mt-8 flex flex-col gap-16">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`grid grid-cols-1 items-center gap-8 md:grid-cols-2 ${i % 2 === 1 ? 'md:[&>*:first-child]:order-2' : ''}`}>
              <ScreenshotFrame src={f.screenshot.src} path={f.screenshot.path} caption={f.screenshot.caption} />
              <div>
                <h3 className="text-xl font-bold text-neutral-100">{f.title}</h3>
                <p className="mt-2.5 leading-relaxed text-neutral-400">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-800">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-neutral-500">
        <span>VectorTrack v0.1.0 — a kinematic simulator.</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-neutral-300">
          <GithubMark />
          Source on GitHub
        </a>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Nav />
      <main>
        <Hero />
        <About />
        <ModesShowcase />
        <Features />
      </main>
      <Footer />
    </div>
  );
}
