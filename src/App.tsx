import { Suspense, lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';

// Lazy-loaded so the simulator's engine (canvas rasterization, Three.js,
// zustand store) never initializes just from visiting the homepage.
const SimulatorPage = lazy(() => import('./pages/SimulatorPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const MazeEditorPage = lazy(() => import('./pages/editor/MazeEditorPage'));
const LineEditorPage = lazy(() => import('./pages/editor/LineEditorPage'));

function LazyFallback({ label }: { label: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-500">
      {label}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/simulator"
          element={
            <Suspense fallback={<LazyFallback label="Loading simulator…" />}>
              <SimulatorPage />
            </Suspense>
          }
        />
        <Route
          path="/docs"
          element={
            <Suspense fallback={<LazyFallback label="Loading docs…" />}>
              <DocsPage />
            </Suspense>
          }
        />
        <Route
          path="/editor"
          element={
            <Suspense fallback={<LazyFallback label="Loading editor…" />}>
              <EditorPage />
            </Suspense>
          }
        />
        <Route
          path="/editor/maze/:id"
          element={
            <Suspense fallback={<LazyFallback label="Loading maze editor…" />}>
              <MazeEditorPage />
            </Suspense>
          }
        />
        <Route
          path="/editor/line/:id"
          element={
            <Suspense fallback={<LazyFallback label="Loading line editor…" />}>
              <LineEditorPage />
            </Suspense>
          }
        />
      </Routes>
    </HashRouter>
  );
}
