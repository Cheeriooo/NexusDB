import { useEffect, useState } from 'react';
import { api } from '../api';
import './Vectors.css';

export default function Vectors({ addToast }) {
    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState('');
    const [vectors, setVectors] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        api.listCollections().then((cols) => {
            setCollections(cols);
            if (cols.length > 0) setSelected(cols[0].name);
        }).catch(() => { });
    }, []);

    const generateSample = () => {
        const col = collections.find((c) => c.name === selected);
        if (!col) return;
        const dim = col.dimension;
        const vecs = Array.from({ length: 5 }, (_, i) => ({
            id: `vec_${String(i + 1).padStart(3, '0')}`,
            values: Array.from({ length: dim }, () => +(Math.random() * 2 - 1).toFixed(4)),
            metadata: { label: `sample-${i + 1}`, category: ['A', 'B', 'C'][i % 3] },
        }));
        setVectors(JSON.stringify(vecs, null, 2));
    };

    const handleUpsert = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const parsed = JSON.parse(vectors);
            const res = await api.upsertVectors({
                collection: selected,
                vectors: parsed,
            });
            setResult(res);
            addToast(`Inserted ${res.count} vectors`, 'success');
        } catch (err) {
            addToast(err.message, 'error');
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="vectors-page">
            <div className="view-header">
                <h2>Insert Vectors</h2>
            </div>

            <div className="card">
                <div className="card-body">
                    <form onSubmit={handleUpsert}>
                        <div className="form-group">
                            <label>Collection</label>
                            <select className="form-select" required value={selected} onChange={(e) => setSelected(e.target.value)}>
                                <option value="">Select a collection...</option>
                                {collections.map((c) => (
                                    <option key={c.name} value={c.name}>{c.name} ({c.dimension}D, {c.metric})</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Vectors (JSON array)</label>
                            <textarea
                                className="form-textarea code-input"
                                rows={14}
                                required
                                value={vectors}
                                onChange={(e) => setVectors(e.target.value)}
                                placeholder={`[\n  {\n    "id": "vec_001",\n    "values": [0.1, 0.2, 0.3, ...],\n    "metadata": {"label": "example"}\n  }\n]`}
                            />
                        </div>
                        <div className="form-actions">
                            <button type="submit" className="btn btn-primary" disabled={loading || !selected}>
                                {loading ? 'Inserting…' : '⬆ Upsert Vectors'}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={generateSample} disabled={!selected}>
                                Generate Sample
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {result && (
                <div className="card result-card">
                    <div className="card-header"><h3>Result</h3></div>
                    <div className="card-body">
                        <pre className="result-pre">{JSON.stringify(result, null, 2)}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}
