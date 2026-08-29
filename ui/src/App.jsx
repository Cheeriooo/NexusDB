import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Console from './Console';
import DemoConsole from './demo/DemoConsole';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app/*" element={<Console />} />
      <Route path="/demo/*" element={<DemoConsole />} />
    </Routes>
  );
}
