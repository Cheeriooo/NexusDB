import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/Dashboard';
import Collections from './pages/Collections';
import Vectors from './pages/Vectors';
import Search from './pages/Search';
import Visualizer from './pages/Visualizer';
import Toast from './components/Toast';
import './App.css';

const VIEWS = {
  dashboard: { title: 'Dashboard', component: Dashboard },
  collections: { title: 'Collections', component: Collections },
  vectors: { title: 'Insert Vectors', component: Vectors },
  search: { title: 'Search Playground', component: Search },
  visualizer: { title: '3D Vector Explorer', component: Visualizer },
};

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const switchView = (view) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  const ActivePage = VIEWS[activeView].component;

  return (
    <>
      <Sidebar
        activeView={activeView}
        onNavigate={switchView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main-content">
        <Topbar
          title={VIEWS[activeView].title}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        <div className="view-container">
          <ActivePage navigate={switchView} addToast={addToast} />
        </div>
      </main>
      <Toast toasts={toasts} />
    </>
  );
}
