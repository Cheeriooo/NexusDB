import { useEffect, useState } from 'react';
import { api } from '../api';
import './Vectors.css';

const EMBED_MODELS = [
    { id: 'all-MiniLM-L6-v2', dim: 384, label: 'all-MiniLM-L6-v2', desc: 'Fast, good quality' },
    { id: 'all-MiniLM-L12-v2', dim: 384, label: 'all-MiniLM-L12-v2', desc: 'Better quality' },
    { id: 'all-mpnet-base-v2', dim: 768, label: 'all-mpnet-base-v2', desc: 'Best quality, slower' },
    { id: 'paraphrase-MiniLM-L6-v2', dim: 384, label: 'paraphrase-MiniLM-L6-v2', desc: 'Paraphrase tasks' },
    { id: 'BAAI/bge-small-en-v1.5', dim: 384, label: 'bge-small-en-v1.5', desc: 'BGE small English' },
    { id: 'BAAI/bge-base-en-v1.5', dim: 768, label: 'bge-base-en-v1.5', desc: 'BGE base English' },
    { id: 'BAAI/bge-large-en-v1.5', dim: 1024, label: 'bge-large-en-v1.5', desc: 'BGE large English' },
];

export default function Vectors({ addToast }) {
    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState('');
    const [mode, setMode] = useState('json');   // 'json' | 'embed'

    // JSON mode
    const [vectors, setVectors] = useState('');

    // Embed mode
    const [textInput, setTextInput] = useState('');
    const [idPrefix, setIdPrefix] = useState('');
    const [embedModel, setEmbedModel] = useState(EMBED_MODELS[0].id);

    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        api.listCollections().then((cols) => {
            setCollections(cols);
            if (cols.length > 0) setSelected(cols[0].name);
        }).catch(() => {});
    }, []);

    const selectedCol = collections.find((c) => c.name === selected);
    const currentModel = EMBED_MODELS.find(m => m.id === embedModel) || EMBED_MODELS[0];
    const dimMismatch = mode === 'embed' && selectedCol && selectedCol.dimension !== currentModel.dim;

    const generateSample = () => {
        if (!selectedCol) return;
        const dim = selectedCol.dimension;
        const vecs = Array.from({ length: 5 }, (_, i) => ({
            id: `vec_${String(i + 1).padStart(3, '0')}`,
            values: Array.from({ length: dim }, () => +(Math.random() * 2 - 1).toFixed(4)),
            metadata: { label: `sample-${i + 1}`, category: ['A', 'B', 'C'][i % 3] },
        }));
        setVectors(JSON.stringify(vecs, null, 2));
    };

    const handleJsonUpsert = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const parsed = JSON.parse(vectors);
            const res = await api.upsertVectors({ collection: selected, vectors: parsed });
            setResult(res);
            addToast(`Inserted ${res.count} vectors`, 'success');
        } catch (err) {
            addToast(err.message, 'error');
            setResult(null);
        } finally {
            setLoading(false);
        }
    };

    const handleEmbedUpsert = async (e) => {
        e.preventDefault();
        const lines = textInput.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
            addToast('Enter at least one line of text', 'error');
            return;
        }
        setLoading(true);
        try {
            const texts = lines.map((text, i) => ({
                text,
                id: idPrefix ? `${idPrefix}${i + 1}` : undefined,
                metadata: {},
            }));
            const res = await api.embedUpsert({
                collection: selected,
                texts,
                model: embedModel,
            });
            setResult(res);
            addToast(`Embedded & inserted ${res.count} vectors`, 'success');
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
                    {/* Mode tabs */}
                    <div className="mode-tabs">
                        <button
                            type="button"
                            className={`mode-tab ${mode === 'json' ? 'active' : ''}`}
                            onClick={() => { setMode('json'); setResult(null); }}
                        >
                            JSON / Raw vectors
                        </button>
                        <button
                            type="button"
                            className={`mode-tab ${mode === 'embed' ? 'active' : ''}`}
                            onClick={() => { setMode('embed'); setResult(null); }}
                        >
                            ✦ Text Embed
                        </button>
                    </div>

                    {/* Collection selector (shared) */}
                    <div className="form-group" style={{ marginTop: '16px' }}>
                        <label>Collection</label>
                        <select
                            className="form-select"
                            required
                            value={selected}
                            onChange={(e) => setSelected(e.target.value)}
                        >
                            <option value="">Select a collection...</option>
                            {collections.map((c) => (
                                <option key={c.name} value={c.name}>
                                    {c.name} ({c.dimension}D, {c.metric})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* ---- JSON mode ---- */}
                    {mode === 'json' && (
                        <form onSubmit={handleJsonUpsert}>
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
                    )}

                    {/* ---- Embed mode ---- */}
                    {mode === 'embed' && (
                        <form onSubmit={handleEmbedUpsert}>
                            {/* Model selector */}
                            <div className="form-group" style={{ marginTop: '16px' }}>
                                <label>Embedding Model</label>
                                <select
                                    className="form-select"
                                    value={embedModel}
                                    onChange={(e) => setEmbedModel(e.target.value)}
                                >
                                    {EMBED_MODELS.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.label} — {m.dim}D — {m.desc}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Model info banner */}
                            <div className="embed-info-banner">
                                <strong>Model:</strong> {currentModel.label} &nbsp;|&nbsp;
                                <strong>Output dim:</strong> {currentModel.dim} &nbsp;|&nbsp;
                                <strong>{currentModel.desc}</strong>
                                <br />
                                Each line of text below will be embedded into a {currentModel.dim}-dim vector and upserted.
                            </div>

                            {/* Dimension warning */}
                            {dimMismatch && (
                                <div className="embed-warn-banner">
                                    ⚠ Collection <strong>{selected}</strong> has dimension {selectedCol.dimension}, but{' '}
                                    {currentModel.label} produces {currentModel.dim}-dim vectors.{' '}
                                    Create a collection with dimension={currentModel.dim}, or pick a different model.
                                </div>
                            )}

                            <div className="form-group">
                                <label>Texts to embed <span className="label-hint">(one per line)</span></label>
                                <textarea
                                    className="form-textarea"
                                    rows={10}
                                    required
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    placeholder={"machine learning\nneural networks\nvector databases\nnatural language processing"}
                                    disabled={dimMismatch}
                                />
                            </div>

                            <div className="form-group">
                                <label>ID prefix <span className="label-hint">(optional — e.g. "doc_" → "doc_1", "doc_2"…)</span></label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={idPrefix}
                                    onChange={(e) => setIdPrefix(e.target.value)}
                                    placeholder="doc_"
                                    disabled={dimMismatch}
                                />
                            </div>

                            <div className="form-actions">
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={loading || !selected || dimMismatch || !textInput.trim()}
                                >
                                    {loading ? 'Embedding…' : '✦ Embed & Upsert'}
                                </button>
                            </div>
                        </form>
                    )}
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
