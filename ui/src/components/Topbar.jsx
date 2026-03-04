import './Topbar.css';

export default function Topbar({ title, onMenuToggle }) {
    return (
        <header className="topbar">
            <button className="menu-toggle" onClick={onMenuToggle}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
            </button>
            <h1 className="page-title">{title}</h1>
            <div className="topbar-actions">
                <span className="topbar-badge">NexusDB Console</span>
            </div>
        </header>
    );
}
