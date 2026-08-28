import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api';
import './Dashboard.css';

const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
};

const item = {
    hidden: { opacity: 0, y: 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function Dashboard({ navigate }) {
    const [health, setHealth] = useState(null);
    const [collections, setCollections] = useState([]);

    useEffect(() => {
        api.health().then(setHealth).catch(() => { });
        api.listCollections().then(setCollections).catch(() => { });
    }, []);

    const totalVectors = collections.reduce((sum, c) => sum + c.count, 0);

    return (
        <motion.div className="dashboard" variants={container} initial="hidden" animate="show">
            {/* Metrics */}
            <div className="metrics-grid">
                <MetricCard
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>}
                    value={collections.length}
                    label="Collections"
                />
                <MetricCard
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>}
                    value={totalVectors.toLocaleString()}
                    label="Total Vectors"
                    accent
                />
                <MetricCard
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>}
                    value={health?.status === 'ok' ? 'Online' : '—'}
                    label="Server Status"
                    live={health?.status === 'ok'}
                />
                <MetricCard
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                    value={health?.version || '—'}
                    label="Version"
                />
            </div>

            {/* Grid */}
            <div className="dashboard-grid">
                <motion.div className="card" variants={item}>
                    <div className="card-header">
                        <h3>Collections Overview</h3>
                        <button className="btn btn-sm btn-primary" onClick={() => navigate('collections')}>View All</button>
                    </div>
                    <div className="card-body">
                        {collections.length === 0 ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                                <p>No collections yet</p>
                                <button className="btn btn-sm btn-primary" onClick={() => navigate('collections')}>Create one</button>
                            </div>
                        ) : (
                            collections.map((col) => (
                                <div key={col.name} className="dash-collection-item">
                                    <span className="dash-col-name">{col.name}</span>
                                    <div className="dash-col-meta">
                                        <span className="badge">{col.metric}</span>
                                        <span className="dash-col-count">{col.count} vectors</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>

                <motion.div className="card" variants={item}>
                    <div className="card-header">
                        <h3>Quick Actions</h3>
                    </div>
                    <div className="card-body">
                        <ActionButton
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
                            title="New Collection"
                            desc="Create a vector collection"
                            onClick={() => navigate('collections')}
                        />
                        <ActionButton
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>}
                            title="Insert Vectors"
                            desc="Add vectors to a collection"
                            onClick={() => navigate('vectors')}
                        />
                        <ActionButton
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}
                            title="Search Vectors"
                            desc="Find nearest neighbors"
                            onClick={() => navigate('search')}
                        />
                        <ActionButton
                            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /></svg>}
                            title="Deep Field"
                            desc="Visualize vector spaces"
                            onClick={() => navigate('visualizer')}
                        />
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

function MetricCard({ icon, value, label, accent, live }) {
    return (
        <motion.div className={`metric-card ${accent ? 'metric-accent' : ''}`} variants={item} whileHover={{ y: -3 }}>
            <div className="metric-icon">{icon}</div>
            <div className="metric-info">
                <span className="metric-value">
                    {value}
                    {live && <span className="metric-live-dot" />}
                </span>
                <span className="metric-label">{label}</span>
            </div>
        </motion.div>
    );
}

function ActionButton({ icon, title, desc, onClick }) {
    return (
        <motion.button className="action-btn" onClick={onClick} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
            {icon}
            <div>
                <strong>{title}</strong>
                <small>{desc}</small>
            </div>
        </motion.button>
    );
}
