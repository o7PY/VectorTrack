import { Suspense, lazy } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';

// Lazy-loaded so the simulator's engine (canvas rasterization, Three.js,
// zustand store) never initializes just from visiting the homepage.
const SimulatorPage = lazy(() => import('./pages/SimulatorPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));

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
      </Routes>
    </HashRouter>
  );
}
