import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { demoSearch, SUGGESTED_QUERIES } from '../demoData';
import '../../pages/Search.css';

function fakeLatency(min = 120, max = 340) {
    return new Promise((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
}

export default function DemoSearch({ addToast, collections }) {
    const [selected, setSelected] = useState(collections[0]?.name || '');
    const [query, setQuery] = useState('');
    const [k, setK] = useState(5);
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [latency, setLatency] = useState(null);

    const suggestions = SUGGESTED_QUERIES[selected] || [];

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!selected || !query.trim()) return;
        setLoading(true);
        const start = performance.now();
        await fakeLatency();
        const matches = demoSearch(selected, query, parseInt(k) || 5);
        const ms = Math.round(performance.now() - start);
        setLatency(ms);
        setResults({ matches });
        addToast(`Found ${matches.length} matches in ${ms}ms`, 'success');
        setLoading(false);
    };

    const runSuggested = (text) => {
        setQuery(text);
        if (!selected) return;
        setLoading(true);
        const start = performance.now();
        fakeLatency().then(() => {
            const matches = demoSearch(selected, text, parseInt(k) || 5);
            const ms = Math.round(performance.now() - start);
            setLatency(ms);
            setResults({ matches });
            addToast(`Found ${matches.length} matches in ${ms}ms`, 'success');
            setLoading(false);
        });
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
                                <select className="form-select" required value={selected} onChange={(e) => { setSelected(e.target.value); setResults(null); }}>
                                    <option value="">Select collection...</option>
                                    {collections.map((c) => (
                                        <option key={c.name} value={c.name}>{c.name} ({c.dimension}D)</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Search text</label>
                                <textarea
                                    className="form-textarea code-input"
                                    rows={3}
                                    required
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="e.g. wireless headphones with good battery life"
                                />
                                {suggestions.length > 0 && (
                                    <div className="demo-suggested-queries">
                                        {suggestions.map((s) => (
                                            <button key={s} type="button" className="demo-query-chip" onClick={() => runSuggested(s)}>
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Top K</label>
                                    <input className="form-input" type="number" min="1" max="12" value={k} onChange={(e) => setK(e.target.value)} />
                                </div>
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={loading || !selected || !query.trim()}>
                                    {loading ? 'Searching…' : '🔍 Search'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>

                <div className="card search-results-card">
                    <div className="card-header">
                        <h3>Results</h3>
                        {results && <span className="result-meta-info">{results.matches.length} matches · {latency}ms</span>}
                    </div>
                    <div className="card-body search-results-body">
                        {!results ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                                <p>Run a search query to see results</p>
                            </div>
                        ) : (
                            <AnimatePresence initial={false}>
                                {results.matches.map((m, i) => (
                                    <motion.div
                                        key={m.id}
                                        className="search-result-item"
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: i * 0.03, ease: [0.16, 1, 0.3, 1] }}
                                    >
                                        <div className="result-header">
                                            <span className="result-rank">#{i + 1}</span>
                                            <span className="result-id">{m.id}</span>
                                            <span className="result-distance">dist: {m.distance.toFixed(6)}</span>
                                        </div>
                                        <div className="distance-bar">
                                            <motion.div
                                                className="distance-bar-fill"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.max(5, (1 - m.distance / maxDist) * 100)}%` }}
                                                transition={{ duration: 0.5, delay: i * 0.03 + 0.1, ease: [0.16, 1, 0.3, 1] }}
                                            />
                                        </div>
                                        {m.metadata && (
                                            <div className="result-metadata">
                                                {Object.entries(m.metadata).map(([k, v]) => (
                                                    <span key={k} className="meta-tag">{k}: {String(v)}</span>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
