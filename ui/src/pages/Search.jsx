import { useEffect, useState } from 'react';
import { api } from '../api';
import './Search.css';

export default function Search({ addToast }) {
    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState('');
    const [query, setQuery] = useState('');
    const [k, setK] = useState(10);
    const [includeMeta, setIncludeMeta] = useState(true);
    const [includeValues, setIncludeValues] = useState(false);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [latency, setLatency] = useState(null);

    useEffect(() => {
        api.listCollections().then((cols) => {
            setCollections(cols);
            if (cols.length > 0) setSelected(cols[0].name);
        }).catch(() => { });
    }, []);

    const generateRandom = () => {
        const col = collections.find((c) => c.name === selected);
        if (!col) return;
        const vals = Array.from({ length: col.dimension }, () => +(Math.random() * 2 - 1).toFixed(4));
        setQuery(vals.join(', '));
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        setLoading(true);
        const start = performance.now();
        try {
            const vector = query.split(',').map((v) => parseFloat(v.trim()));
            const res = await api.searchVectors({
                collection: selected,
                vector,
                k: parseInt(k),
                include_metadata: includeMeta,
                include_values: includeValues,
            });
            setLatency(Math.round(performance.now() - start));
            setResults(res);
            addToast(`Found ${res.matches.length} matches in ${Math.round(performance.now() - start)}ms`, 'success');
        } catch (err) {
            addToast(err.message, 'error');
            setResults(null);
        } finally {
            setLoading(false);
        }
    };

    const maxDist = results?.matches?.length ? Math.max(...results.matches.map((m) => m.distance), 0.001) : 1;

    return (
        <div className="search-page">
            <div className="view-header">
                <h2>Search Playground</h2>
            </div>

            <div className="search-layout">
                <div className="card search-form-card">
                    <div className="card-header"><h3>Query Builder</h3></div>
                    <div className="card-body">
                        <form onSubmit={handleSearch}>
                            <div className="form-group">
                                <label>Collection</label>
                                <select className="form-select" required value={selected} onChange={(e) => setSelected(e.target.value)}>
                                    <option value="">Select collection...</option>
                                    {collections.map((c) => (
                                        <option key={c.name} value={c.name}>{c.name} ({c.dimension}D)</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Query Vector (comma-separated)</label>
                                <textarea
                                    className="form-textarea code-input"
                                    rows={3}
                                    required
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="0.1, 0.2, 0.3, ..."
                                />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Top K</label>
                                    <input className="form-input" type="number" min="1" max="100"
                                        value={k} onChange={(e) => setK(e.target.value)} />
                                </div>
                                <div className="form-group checkbox-group">
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={includeMeta} onChange={(e) => setIncludeMeta(e.target.checked)} />
                                        Include Metadata
                                    </label>
                                    <label className="checkbox-label">
                                        <input type="checkbox" checked={includeValues} onChange={(e) => setIncludeValues(e.target.checked)} />
                                        Include Values
                                    </label>
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={loading || !selected}>
                                    {loading ? 'Searching…' : '🔍 Search'}
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={generateRandom} disabled={!selected}>
                                    Random Query
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div className="card search-results-card">
                    <div className="card-header">
                        <h3>Results</h3>
                        {results && (
                            <span className="result-meta-info">
                                {results.matches.length} matches · {latency}ms
                            </span>
                        )}
                    </div>
                    <div className="card-body search-results-body">
                        {!results ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                <p>Run a search query to see results</p>
                            </div>
                        ) : results.matches.length === 0 ? (
                            <div className="empty-state">
                                <p>No matches found</p>
                            </div>
                        ) : (
                            results.matches.map((m, i) => (
                                <div key={m.id} className="search-result-item">
                                    <div className="result-header">
                                        <span className="result-rank">#{i + 1}</span>
                                        <span className="result-id">{m.id}</span>
                                        <span className="result-distance">dist: {m.distance.toFixed(6)}</span>
                                    </div>
                                    <div className="distance-bar">
                                        <div
                                            className="distance-bar-fill"
                                            style={{ width: `${Math.max(5, (1 - m.distance / maxDist) * 100)}%` }}
                                        />
                                    </div>
                                    {m.metadata && (
                                        <div className="result-metadata">
                                            {Object.entries(m.metadata).map(([k, v]) => (
                                                <span key={k} className="meta-tag">{k}: {String(v)}</span>
                                            ))}
                                        </div>
                                    )}
                                    {m.values && (
                                        <div className="result-values">
                                            [{m.values.slice(0, 8).map((v) => v.toFixed(4)).join(', ')}
                                            {m.values.length > 8 ? `, … (${m.values.length}D)` : ']'}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
