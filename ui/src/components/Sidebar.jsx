import { useEffect, useState } from 'react';
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
        label: '3D Explorer',
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
            {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo">
                        <div className="logo-icon">
                            <svg viewBox="0 0 32 32" fill="none">
                                <circle cx="16" cy="16" r="14" stroke="url(#lg)" strokeWidth="2" />
                                <circle cx="16" cy="10" r="3" fill="url(#lg)" />
                                <circle cx="10" cy="20" r="3" fill="url(#lg)" />
                                <circle cx="22" cy="20" r="3" fill="url(#lg)" />
                                <line x1="16" y1="10" x2="10" y2="20" stroke="url(#lg)" strokeWidth="1.5" opacity="0.6" />
                                <line x1="16" y1="10" x2="22" y2="20" stroke="url(#lg)" strokeWidth="1.5" opacity="0.6" />
                                <line x1="10" y1="20" x2="22" y2="20" stroke="url(#lg)" strokeWidth="1.5" opacity="0.6" />
                                <defs>
                                    <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
                                        <stop offset="0%" stopColor="#6366f1" />
                                        <stop offset="100%" stopColor="#a855f7" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                        <div className="logo-text">
                            <span className="logo-name">NexusDB</span>
                            <span className="logo-version">v0.1.0</span>
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {NAV_ITEMS.map((item) => (
                        <button
                            key={item.id}
                            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
                            onClick={() => onNavigate(item.id)}
                        >
                            {item.icon}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className={`server-status ${connected ? 'connected' : ''}`}>
                        <span className="status-dot" />
                        <span className="status-text">
                            {connected ? 'Server Online' : 'Disconnected'}
                        </span>
                    </div>
                </div>
            </aside>
        </>
    );
}
