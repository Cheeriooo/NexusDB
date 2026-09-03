import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Toast from '../components/Toast';
import DemoDashboard from './pages/DemoDashboard';
import DemoCollections from './pages/DemoCollections';
import DemoVectors from './pages/DemoVectors';
import DemoSearch from './pages/DemoSearch';
import DemoVisualizer from './pages/DemoVisualizer';
import DemoTour from './DemoTour';
import { TOUR_SEEN_KEY } from './tourSteps';
import { DEMO_COLLECTIONS_INIT } from './demoData';
import '../App.css';
import '../components/Sidebar.css';
import '../components/Topbar.css';
import './Demo.css';

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', title: 'Dashboard', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
    { id: 'collections', label: 'Collections', title: 'Collections', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg> },
    { id: 'vectors', label: 'Vectors', title: 'Insert Vectors', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg> },
    { id: 'search', label: 'Search', title: 'Search Playground', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> },
    { id: 'visualizer', label: 'Deep Field', title: 'Deep Field', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg> },
];

const PAGES = {
    dashboard: DemoDashboard,
    collections: DemoCollections,
    vectors: DemoVectors,
    search: DemoSearch,
    visualizer: DemoVisualizer,
};

const REPO_URL = 'https://github.com/Cheeriooo/NexusDB';

export default function DemoConsole() {
    const [activeView, setActiveView] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [collections, setCollections] = useState(DEMO_COLLECTIONS_INIT);
    const [tourActive, setTourActive] = useState(false);
    const [tourKey, setTourKey] = useState(0);
    const [showWelcome, setShowWelcome] = useState(false);

    useEffect(() => {
        let seen = true;
        try { seen = localStorage.getItem(TOUR_SEEN_KEY) === '1'; } catch { /* storage unavailable */ }
        if (!seen) {
            const t = setTimeout(() => setShowWelcome(true), 500);
            return () => clearTimeout(t);
        }
        return undefined;
    }, []);

    const addToast = (message, type = 'info') => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    };

    const startTour = () => {
        setShowWelcome(false);
        setTourKey((k) => k + 1);
        setTourActive(true);
    };

    const dismissWelcome = () => {
        try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
        setShowWelcome(false);
    };

    const switchView = (view) => {
        setActiveView(view);
        setSidebarOpen(false);
    };

    const ActivePage = PAGES[activeView];
    const active = NAV_ITEMS.find((n) => n.id === activeView);

    return (
        <>
            <div className="demo-banner">
                <span>
                    <strong>You're viewing a demo</strong> — sample data, scripted results, no live backend.
                </span>
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="demo-banner-link">
                    Self-host the real thing on GitHub →
                </a>
            </div>

            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                )}
            </AnimatePresence>
            <aside className={`sidebar demo-sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <Link to="/" className="logo">
                        <div className="logo-mark">
                            <svg viewBox="0 0 32 32" fill="none">
                                <line x1="16" y1="16" x2="16" y2="5" stroke="var(--accent)" strokeWidth="1.1" strokeLinecap="round" />
                                <line x1="16" y1="16" x2="26.45" y2="12.6" stroke="var(--border-hover)" strokeWidth="0.9" strokeLinecap="round" />
                                <line x1="16" y1="16" x2="22.45" y2="24.9" stroke="var(--border-hover)" strokeWidth="0.9" strokeLinecap="round" />
                                <line x1="16" y1="16" x2="9.55" y2="24.9" stroke="var(--border-hover)" strokeWidth="0.9" strokeLinecap="round" />
                                <line x1="16" y1="16" x2="5.55" y2="12.6" stroke="var(--border-hover)" strokeWidth="0.9" strokeLinecap="round" />
                                <circle cx="26.45" cy="12.6" r="1.7" fill="var(--text-secondary)" />
                                <circle cx="22.45" cy="24.9" r="1.7" fill="var(--text-secondary)" />
                                <circle cx="9.55" cy="24.9" r="1.7" fill="var(--text-secondary)" />
                                <circle cx="5.55" cy="12.6" r="1.7" fill="var(--text-secondary)" />
                                <circle cx="16" cy="5" r="2.1" fill="var(--accent)" />
                                <circle cx="16" cy="16" r="2.8" fill="var(--accent)" />
                            </svg>
                        </div>
                        <div className="logo-text">
                            <span className="logo-name">NexusDB</span>
                            <span className="logo-version">demo mode</span>
                        </div>
                    </Link>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map((item) => {
                        const isActive = activeView === item.id;
                        return (
                            <button key={item.id} className={`nav-item ${isActive ? 'active' : ''}`} onClick={() => switchView(item.id)}>
                                {isActive && <motion.span layoutId="demo-nav-active" className="nav-active-bg" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                                <span className="nav-item-content">{item.icon}<span>{item.label}</span></span>
                            </button>
                        );
                    })}
                </nav>

                <div className="sidebar-footer demo-sidebar-footer">
                    <a href={REPO_URL} target="_blank" rel="noreferrer" className="demo-github-btn">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18.92-.26 1.9-.38 2.88-.39.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.39-5.27 5.67.42.36.78 1.08.78 2.17 0 1.56-.02 2.83-.02 3.21 0 .3.21.66.79.55A10.52 10.52 0 0023.5 12c0-6.35-5.15-11.5-11.5-11.5z" /></svg>
                        Clone on GitHub
                    </a>
                    <div className="server-status connected">
                        <span className="status-dot" />
                        <span className="status-text">Demo mode</span>
                    </div>
                </div>
            </aside>

            <main className="main-content demo-main-content">
                <header className="topbar">
                    <button className="menu-toggle" onClick={() => setSidebarOpen((v) => !v)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
                    </button>
                    <motion.h1 key={active.title} className="page-title" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
                        {active.title}
                    </motion.h1>
                    <div className="topbar-actions">
                        <button className="btn btn-ghost btn-sm tour-trigger-btn" onClick={startTour}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.5 9.5a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                            Guide me
                        </button>
                        <span className="topbar-badge">NEXUSDB · DEMO</span>
                    </div>
                </header>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeView}
                        className="view-container"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <ActivePage
                            navigate={switchView}
                            addToast={addToast}
                            collections={collections}
                            setCollections={setCollections}
                        />
                    </motion.div>
                </AnimatePresence>
            </main>
            <Toast toasts={toasts} />

            <AnimatePresence>
                {showWelcome && (
                    <motion.div className="tour-welcome-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <motion.div
                            className="tour-welcome-card"
                            initial={{ opacity: 0, y: 16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.98 }}
                            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        >
                            <div className="tour-welcome-icon">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.5 9.5a2.5 2.5 0 115 .5c0 1.5-2.5 2-2.5 3.5" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                            </div>
                            <h3>New to NexusDB?</h3>
                            <p>
                                Take a 90-second guided tour of the core workflow — create a collection,
                                insert vectors, search, and visualize — with prompts at every step.
                            </p>
                            <div className="tour-welcome-actions">
                                <button className="btn btn-primary" onClick={startTour}>Start guided tour</button>
                                <button className="btn btn-ghost" onClick={dismissWelcome}>Skip, I'll explore myself</button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <DemoTour key={tourKey} active={tourActive} activeView={activeView} switchView={switchView} onFinish={() => setTourActive(false)} />
        </>
    );
}
