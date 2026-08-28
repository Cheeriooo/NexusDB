import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api';
import './Sidebar.css';

const NAV_ITEMS = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
        ),
    },
    {
        id: 'collections',
        label: 'Collections',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
        ),
    },
    {
        id: 'vectors',
        label: 'Vectors',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" /></svg>
        ),
    },
    {
        id: 'search',
        label: 'Search',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        ),
    },
    {
        id: 'visualizer',
        label: 'Deep Field',
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
        ),
    },
];

export default function Sidebar({ activeView, onNavigate, isOpen, onClose }) {
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const check = () => {
            api.health()
                .then(() => setConnected(true))
                .catch(() => setConnected(false));
        };
        check();
        const interval = setInterval(check, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="sidebar-backdrop"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />
                )}
            </AnimatePresence>
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <Link to="/" className="logo">
                        <div className="logo-mark">
                            <svg viewBox="0 0 32 32" fill="none">
                                <circle cx="16" cy="10" r="2.2" fill="var(--accent)" />
                                <circle cx="9" cy="21" r="2.2" fill="var(--text-secondary)" />
                                <circle cx="23" cy="21" r="2.2" fill="var(--text-secondary)" />
                                <line x1="16" y1="10" x2="9" y2="21" stroke="var(--border-hover)" strokeWidth="1.2" />
                                <line x1="16" y1="10" x2="23" y2="21" stroke="var(--border-hover)" strokeWidth="1.2" />
                                <line x1="9" y1="21" x2="23" y2="21" stroke="var(--border-hover)" strokeWidth="1.2" />
                            </svg>
                        </div>
                        <div className="logo-text">
                            <span className="logo-name">NexusDB</span>
                            <span className="logo-version">rev.0.1.0</span>
                        </div>
                    </Link>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map((item) => {
                        const active = activeView === item.id;
                        return (
                            <button
                                key={item.id}
                                className={`nav-item ${active ? 'active' : ''}`}
                                onClick={() => onNavigate(item.id)}
                            >
                                {active && (
                                    <motion.span
                                        layoutId="nav-active"
                                        className="nav-active-bg"
                                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                                    />
                                )}
                                <span className="nav-item-content">
                                    {item.icon}
                                    <span>{item.label}</span>
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <div className={`server-status ${connected ? 'connected' : ''}`}>
                        <span className="status-dot" />
                        <span className="status-text">
                            {connected ? 'Link established' : 'No signal'}
                        </span>
                    </div>
                </div>
            </aside>
        </>
    );
}
