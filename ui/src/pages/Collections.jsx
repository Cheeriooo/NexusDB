import { useEffect, useState } from 'react';
import { api } from '../api';
import './Collections.css';

export default function Collections({ addToast }) {
    const [collections, setCollections] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState({ name: '', dimension: 128, metric: 'cosine' });
    const [loading, setLoading] = useState(false);

    const load = () => api.listCollections().then(setCollections).catch(() => { });
    useEffect(() => { load(); }, []);

    const handleCreate = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.createCollection({
                name: form.name,
                dimension: parseInt(form.dimension),
                metric: form.metric,
            });
            addToast(`Collection "${form.name}" created`, 'success');
            setShowModal(false);
            setForm({ name: '', dimension: 128, metric: 'cosine' });
            load();
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (name) => {
        if (!confirm(`Delete collection "${name}"? This will remove all its vectors.`)) return;
        try {
            await api.deleteCollection(name);
            addToast(`Collection "${name}" deleted`, 'success');
            load();
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    return (
        <div className="collections-page">
            <div className="view-header">
                <h2>Collections</h2>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    New Collection
                </button>
            </div>

            {collections.length === 0 ? (
                <div className="empty-state-large">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                    <h3>No collections yet</h3>
                    <p>Create your first collection to start storing vectors</p>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>Create Collection</button>
                </div>
            ) : (
                <div className="collections-grid">
                    {collections.map((col) => (
                        <div key={col.name} className="collection-card">
                            <div className="collection-card-header">
                                <h4>{col.name}</h4>
                                <button className="delete-btn" onClick={() => handleDelete(col.name)} title="Delete collection">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                </button>
                            </div>
                            <div className="collection-meta">
                                <div className="meta-item">
                                    <span className="meta-label">Dimension</span>
                                    <span className="meta-value">{col.dimension}</span>
                                </div>
                                <div className="meta-item">
                                    <span className="meta-label">Metric</span>
                                    <span className="meta-value badge">{col.metric}</span>
                                </div>
                                <div className="meta-item">
                                    <span className="meta-label">Vectors</span>
                                    <span className="meta-value">{col.count.toLocaleString()}</span>
                                </div>
                                <div className="meta-item">
                                    <span className="meta-label">Created</span>
                                    <span className="meta-value time">{new Date(col.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Create Collection</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label>Name</label>
                                    <input className="form-input" required placeholder="my-collection"
                                        value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Dimension</label>
                                    <input className="form-input" type="number" required min="1" max="4096"
                                        value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Distance Metric</label>
                                    <select className="form-select"
                                        value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                                        <option value="cosine">Cosine</option>
                                        <option value="euclidean">Euclidean (L2)</option>
                                        <option value="dot">Dot Product</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? 'Creating…' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
