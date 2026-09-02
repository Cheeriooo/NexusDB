import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

// Each route is a separate chunk: the landing page (what most visitors hit
// first) shouldn't have to download the console's three.js visualizer, and
// vice versa.
const Landing = lazy(() => import('./pages/Landing'));
const Console = lazy(() => import('./Console'));
const DemoConsole = lazy(() => import('./demo/DemoConsole'));

export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app/*" element={<Console />} />
        <Route path="/demo/*" element={<DemoConsole />} />
      </Routes>
    </Suspense>
  );
}
