# VectorTrack

A browser-based robotics simulator for two classic control problems — **line following** and
**maze solving** — built to actually watch and tune, not just read about. Everything runs
client-side: no backend, no accounts, no network calls after the initial page load.

## What it does

Pick a mode, a map, a robot, and an algorithm, then watch the run happen in real time:

- **Line Follower** — 3 control algorithms (bang-bang, proportional, full PID) racing 2 robot
  chassis around 5 tracks. Drag a PID gain slider mid-run and the very next simulation tick
  applies it — no restart needed.
- **Maze Solver** — 2 pathfinding strategies (left/right-hand wall following, flood fill) racing
  2 robot chassis through 5 mazes, each built to exercise a different failure mode (a single long
  corridor, a loop that traps a hand-follower, a corner-to-corner traversal that a "retrace 3x"
  algorithm can't finish in time).

Every run is deterministic — the same map, robot, algorithm, and gains reproduce the exact same
trajectory every time, since the simulation core has no randomness once a map is generated and no
dependency on frame rate (fixed 120 Hz timestep, decoupled from the display).

Both modes share the same engine underneath: a pure-TypeScript sim core (kinematics, sensor
models, algorithms — no DOM/React/Three imports anywhere in it) driving two renderers that read
identical state — a 2D debug canvas (sensor rays, trajectory trail) and a full 3D scene
(React Three Fiber, camera presets, shadows). Switching between them mid-run never resets
anything. Tuned gains, best times, and per-map completion are saved to `localStorage` and survive
a reload.

The app's own `/docs` route (`npm run dev` then open `#/docs`) is the full technical
breakdown — every algorithm's source excerpt, every robot's spec table, every map's construction,
and what each telemetry readout means.

## Running locally

```sh
git clone https://github.com/o7PY/VectorTrack.git
cd VectorTrack
npm install        # the only step that needs a network connection
npm run dev         # dev server → http://localhost:5173/VectorTrack/
```

Or build once and run fully offline from then on:

```sh
npm run build       # production build to dist/
npm run preview      # serves dist/ locally, no network needed
```

Other scripts:

```sh
npm run test:run    # full vitest suite (unit + end-to-end simulation integration tests)
npm run lint        # oxlint
npm run build       # tsc -b && vite build
```

## Project layout

```
src/
  sim/        # pure TS simulation core — kinematics, sensors, algorithms. No DOM/React/Three imports.
  maps/       # line-track and maze content (procedurally generated, deterministic per seed)
  robots/     # robot spec definitions
  algorithms/ # UI-facing algorithm/param metadata
  store/      # Zustand store, persistence, and the non-serializable sim engine instance
  render2d/   # Canvas 2D renderer (debug view)
  render3d/   # React Three Fiber renderer (default view)
  ui/         # simulator panels and controls
  pages/      # top-level routes: HomePage (marketing), SimulatorPage (the app), DocsPage (reference)
```

The simulator and docs page are each lazy-loaded behind their own client-side route (`#/simulator`,
`#/docs`), so visiting the homepage never pays for Three.js or the sim engine.

## Tech stack

Vite · React 19 · TypeScript (strict) · Tailwind CSS v4 · Zustand · Three.js / React Three Fiber ·
Vitest · oxlint

## Deployment

GitHub Actions builds and deploys `dist/` to GitHub Pages on every push to `main`
(`.github/workflows/deploy.yml`), running the full test suite first. The Vite `base` is set to
`/VectorTrack/` to match the Pages subpath (this must exactly match the repo name's casing — GitHub
Pages serves paths case-sensitively), and routing uses a hash router (`#/...`) so it works from a
static host with no server-side rewrites.

## Process docs

`SPEC.md`, `PLAN.md`, `ISSUES.md`, and `INSIGHTS.md` are development-process documents (design
spec, build plan, bug log, lessons learned) kept locally during development — intentionally
gitignored, not shipped product docs.
