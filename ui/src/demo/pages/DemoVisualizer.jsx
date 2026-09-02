import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { demoVizPoints, demoVizQueryPosition, SUGGESTED_QUERIES } from '../demoData';
import DeepField from '../../components/DeepField';
import { buildPointData, SCALE } from '../../components/deepFieldMath';
import '../../pages/Visualizer.css';

export default function DemoVisualizer({ addToast, collections }) {
    const containerRef = useRef(null);
    const [selected, setSelected] = useState(collections[0]?.name || '');
    const [hover, setHover] = useState(null);
    const [autoRotate, setAutoRotate] = useState(true);
    const [containerSize, setContainerSize] = useState({ w: 999, h: 999 });
    const [queryText, setQueryText] = useState('');
    const [queryInfo, setQueryInfo] = useState(null);
    const [queryPos, setQueryPos] = useState(null);

    const pointData = useMemo(() => {
        if (!selected) return null;
        return buildPointData(demoVizPoints(selected));
    }, [selected]);

    const suggestions = SUGGESTED_QUERIES[selected] || [];

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        // Resetting query state here (rather than deriving it during render)
        // is intentional: it must run only when `selected` actually changes,
        // not on every render, and it's paired with the addToast side effect
        // below for the same change.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQueryPos(null);
        setQueryInfo(null);
        setQueryText('');
        if (selected) addToast(`Loaded ${demoVizPoints(selected).length} vectors from "${selected}"`, 'info');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);

    const handleHover = useCallback((info) => {
        if (!info) { setHover(null); return; }
        setHover({ index: info.index, sx: info.x, sy: info.y });
    }, []);

    const projectQuery = (text) => {
        if (!text.trim() || !selected) return;
        const raw = demoVizQueryPosition(selected, text);
        if (!raw) return;
        const built = pointData.pca;
        const x = ((raw.x - built.mins[0]) / built.ranges[0]) * SCALE * 2 - SCALE;
        const y = ((raw.y - built.mins[1]) / built.ranges[1]) * SCALE * 2 - SCALE;
        const z = ((raw.z - built.mins[2]) / built.ranges[2]) * SCALE * 2 - SCALE;
        setQueryPos({ x, y, z, text });
        setQueryInfo({ text });
        addToast('Query projected into field', 'success');
    };

    const handleQuery = (e) => {
        e.preventDefault();
        projectQuery(queryText);
    };

    const clearQuery = () => {
        setQueryPos(null);
        setQueryInfo(null);
        setQueryText('');
    };

    const hoveredPoint = hover && pointData ? pointData.raw[hover.index] : null;

    return (
        <div className="visualizer-page">
            <div className="view-header">
                <h2>Deep Field</h2>
                <div className="viz-controls">
                    <select className="form-select viz-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
                        <option value="">Select collection...</option>
                        {collections.map((c) => (
                            <option key={c.name} value={c.name}>{c.name} ({c.count} vectors, {c.dimension}D)</option>
                        ))}
                    </select>
                    <button className={`btn btn-ghost btn-sm ${autoRotate ? 'toggle-on' : ''}`} onClick={() => setAutoRotate((v) => !v)}>
                        {autoRotate ? '◉ Orbiting' : '○ Static'}
                    </button>
                </div>
            </div>

            <div className="visualizer-container">
                <div className="canvas-wrapper" ref={containerRef}>
                    <AnimatePresence>
                        {!selected && (
                            <motion.div className="viz-empty-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                                <h3>Vector Space Explorer</h3>
                                <p>Select a collection to project it into the field</p>
                                <span className="viz-empty-hint">Hover a point to inspect it, drag to orbit</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <DeepField data={pointData} query={queryPos} autoRotate={autoRotate} onHover={handleHover} hoveredIndex={hover?.index ?? null} />

                    {hoveredPoint && (
                        <div className="viz-tooltip" style={{ left: Math.min(hover.sx + 18, containerSize.w - 280), top: Math.min(Math.max(hover.sy - 10, 8), containerSize.h - 160) }}>
                            <div className="tt-header"><span className="tt-id">{hoveredPoint.id}</span></div>
                            {hoveredPoint.metadata && (
                                <div className="tt-body">
                                    {Object.entries(hoveredPoint.metadata).map(([k, v]) => (
                                        <div className="tt-row" key={k}><span className="tt-key">{k}</span><span className="tt-val">{String(v)}</span></div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="viz-sidebar">
                    <div className="viz-info-card">
                        <h4>Controls</h4>
                        <div className="control-hint">◈ Drag to orbit</div>
                        <div className="control-hint">◎ Scroll to zoom</div>
                        <div className="control-hint">✦ Hover to inspect</div>
                    </div>

                    <div className="viz-info-card">
                        <h4>Statistics</h4>
                        <div className="stat-row"><span>Vectors</span><span>{pointData?.count || 0}</span></div>
                        <div className="stat-row"><span>Dimensions</span><span>{collections.find((c) => c.name === selected)?.dimension || 0}</span></div>
                        <div className="stat-row"><span>Projection</span><span>PCA</span></div>
                    </div>

                    <div className="viz-info-card">
                        <h4>Legend</h4>
                        <div className="legend-item"><span className="legend-dot" style={{ background: 'linear-gradient(135deg, #6f685d, #f3eee3)' }} /> Near centroid</div>
                        <div className="legend-item"><span className="legend-dot" style={{ background: 'linear-gradient(135deg, #f3eee3, #22d3a4)' }} /> Far from centroid</div>
                        <div className="legend-item"><span className="legend-dot" style={{ background: '#22d3a4', boxShadow: '0 0 6px #22d3a4' }} /> Query point</div>
                    </div>

                    <div className="viz-info-card query-panel">
                        <h4>Semantic Query</h4>
                        <p className="query-hint">Embed text and project it into this field.</p>
                        {suggestions.length > 0 && (
                            <div className="demo-suggested-queries">
                                {suggestions.map((s) => (
                                    <button key={s} type="button" className="demo-query-chip" onClick={() => { setQueryText(s); projectQuery(s); }} disabled={!selected}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                        <form onSubmit={handleQuery} className="query-form">
                            <input type="text" className="form-input query-input" placeholder="e.g. machine learning..." value={queryText} onChange={(e) => setQueryText(e.target.value)} disabled={!selected} />
                            <div className="query-actions">
                                <button type="submit" className="btn btn-primary btn-sm" disabled={!queryText.trim() || !selected}>Project</button>
                                {queryInfo && <button type="button" className="btn btn-ghost btn-sm" onClick={clearQuery}>Clear</button>}
                            </div>
                        </form>
                        {queryInfo && <div className="query-result"><span className="query-label-chip">▸ {queryInfo.text.slice(0, 28)}</span></div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
