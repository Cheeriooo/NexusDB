import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  visualizer: { title: 'Deep Field', component: Visualizer },
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
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            className="view-container"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <ActivePage navigate={switchView} addToast={addToast} />
          </motion.div>
        </AnimatePresence>
      </main>
      <Toast toasts={toasts} />
    </>
  );
}
