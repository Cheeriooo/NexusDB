import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html, Billboard } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import * as THREE from 'three';
import { api } from '../api';
import './Visualizer.css';

// Map collection dimensions to appropriate embedding models
const DIMENSION_TO_MODELS = {
    384: { model: 'all-MiniLM-L6-v2', label: 'MiniLM (384D)' },
    768: { model: 'all-mpnet-base-v2', label: 'MPNet (768D)' },
    1024: { model: 'BAAI/bge-large-en-v1.5', label: 'BGE-Large (1024D)' },
    1536: { model: 'text-embedding-3-small', label: 'OpenAI ada-002 (1536D)' },
    3072: { model: 'text-embedding-3-large', label: 'OpenAI 3-large (3072D)' },
};

function getModelForDimension(dim) {
    return DIMENSION_TO_MODELS[dim] || null;
}

const SCALE = 32;
const NEAR = new THREE.Color('#6f685d');
const MID = new THREE.Color('#f3eee3');
const FAR = new THREE.Color('#22d3a4');

/* ---- Build render-ready point data from raw PCA vectors ---- */
function buildPointData(vecs) {
    const n = vecs.length;
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    vecs.forEach((v) => {
        for (let d = 0; d < 3; d++) {
            if (v.projected[d] < mins[d]) mins[d] = v.projected[d];
            if (v.projected[d] > maxs[d]) maxs[d] = v.projected[d];
        }
    });
    const ranges = mins.map((m, i) => maxs[i] - m || 1);

    const positions = new Float32Array(n * 3);
    const sc = (val, d) => ((val - mins[d]) / ranges[d]) * SCALE * 2 - SCALE;
    const raw = new Array(n);
    for (let i = 0; i < n; i++) {
        const v = vecs[i];
        const x = sc(v.projected[0], 0), y = sc(v.projected[1], 1), z = sc(v.projected[2], 2);
        positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
        raw[i] = { id: v.id, metadata: v.metadata, x, y, z };
    }

    const center = [0, 0, 0];
    for (let i = 0; i < n; i++) {
        center[0] += positions[i * 3]; center[1] += positions[i * 3 + 1]; center[2] += positions[i * 3 + 2];
    }
    center.forEach((c, i) => (center[i] = c / n));

    let maxDist = 0;
    const dists = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const dx = positions[i * 3] - center[0], dy = positions[i * 3 + 1] - center[1], dz = positions[i * 3 + 2] - center[2];
        dists[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dists[i] > maxDist) maxDist = dists[i];
    }
    const dr = maxDist || 1;

    const colors = new Float32Array(n * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
        const t = dists[i] / dr;
        if (t < 0.5) tmp.copy(NEAR).lerp(MID, t / 0.5);
        else tmp.copy(MID).lerp(FAR, (t - 0.5) / 0.5);
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }

    return {
        positions, colors, raw, count: n,
        pca: { mins, ranges },
    };
}

/* ---- Point cloud with grow-in animation + hover raycasting ---- */
function PointCloud({ data, onHover }) {
    const pointsRef = useRef();
    const matRef = useRef();
    const growth = useRef(0);
    const targetSize = Math.max(2.6, Math.min(5, 260 / Math.sqrt(data.count)));

    useEffect(() => { growth.current = 0; }, [data]);

    useFrame(() => {
        if (!matRef.current) return;
        growth.current += (1 - growth.current) * 0.09;
        matRef.current.size = targetSize * growth.current;
        matRef.current.opacity = 0.92 * growth.current;
    });

    return (
        <points
            ref={pointsRef}
            onPointerMove={(e) => { e.stopPropagation(); if (e.index != null) onHover(e.index, e.nativeEvent); }}
            onPointerOut={() => onHover(null)}
        >
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
                <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
            </bufferGeometry>
            <pointsMaterial
                ref={matRef}
                vertexColors
                transparent
                opacity={0}
                size={0}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    );
}

function HoverMarker({ position }) {
    const ref = useRef();
    useFrame(({ clock }) => {
        if (!ref.current) return;
        const s = 1 + Math.sin(clock.elapsedTime * 5) * 0.1;
        ref.current.scale.set(s, s, s);
    });
    return (
        <group position={position}>
            <mesh>
                <sphereGeometry args={[1.1, 20, 20]} />
                <meshBasicMaterial color="#f3eee3" transparent opacity={0.16} />
            </mesh>
            <Billboard>
                <mesh ref={ref}>
                    <ringGeometry args={[1.6, 1.85, 32]} />
                    <meshBasicMaterial color="#22d3a4" transparent opacity={0.85} side={THREE.DoubleSide} />
                </mesh>
            </Billboard>
        </group>
    );
}

function QueryMarker({ position, text }) {
    const ref = useRef();
    useFrame(({ clock }) => {
        if (!ref.current) return;
        const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.14;
        ref.current.scale.set(s, s, s);
    });
    return (
        <group position={position}>
            <mesh ref={ref}>
                <sphereGeometry args={[1.3, 24, 24]} />
                <meshStandardMaterial color="#22d3a4" emissive="#22d3a4" emissiveIntensity={1.1} toneMapped={false} />
            </mesh>
            <Html distanceFactor={26} position={[0, 3.2, 0]} center occlude={false}>
                <div className="query-flag">▸ {text.length > 26 ? text.slice(0, 24) + '…' : text}</div>
            </Html>
        </group>
    );
}

const DUST_POSITIONS = (() => {
    const arr = new Float32Array(400 * 3);
    for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() - 0.5) * 140;
    return arr;
})();

function DustField() {
    const positions = DUST_POSITIONS;
    return (
        <points>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#6f685d" size={0.1} transparent opacity={0.25} sizeAttenuation depthWrite={false} />
        </points>
    );
}

function Rig({ autoRotate }) {
    const controls = useRef();
    return (
        <OrbitControls
            ref={controls}
            enableDamping
            dampingFactor={0.08}
            autoRotate={autoRotate}
            autoRotateSpeed={0.4}
            minDistance={14}
            maxDistance={170}
            makeDefault
        />
    );
}

function Scene({ data, query, onHover, autoRotate }) {
    return (
        <>
            <color attach="background" args={['#08070a']} />
            <fogExp2 attach="fog" args={['#08070a', 0.0055]} />
            <ambientLight intensity={0.65} />
            <pointLight position={[60, 55, 40]} intensity={60} color="#22d3a4" />
            <pointLight position={[-50, 30, -50]} intensity={40} color="#f3eee3" />

            <Grid
                args={[220, 220]}
                position={[0, -34, 0]}
                cellSize={6}
                cellThickness={0.5}
                cellColor="#2a2622"
                sectionSize={30}
                sectionThickness={1}
                sectionColor="#3d372f"
                fadeDistance={130}
                fadeStrength={1.5}
                infiniteGrid={false}
            />

            <DustField />
            {data && <PointCloud data={data} onHover={onHover} />}
            {query && <QueryMarker position={[query.x, query.y, query.z]} text={query.text} />}

            <Rig autoRotate={autoRotate} />
        </>
    );
}

export default function Visualizer({ addToast }) {
    const containerRef = useRef(null);
    const loadingRef = useRef(false);
    const toastRef = useRef(addToast);
    const pcaMetaRef = useRef(null);

    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState('');
    const [pointData, setPointData] = useState(null);
    const [loadingViz, setLoadingViz] = useState(false);
    const [stats, setStats] = useState({ count: 0, dim: 0, evr: [], method: '' });
    const [hover, setHover] = useState(null); // { index, sx, sy }
    const [autoRotate, setAutoRotate] = useState(true);
    const [containerSize, setContainerSize] = useState({ w: 999, h: 999 });

    const [queryText, setQueryText] = useState('');
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryInfo, setQueryInfo] = useState(null);
    const [queryPos, setQueryPos] = useState(null);
    const [queryModel, setQueryModel] = useState('auto');

    useEffect(() => { toastRef.current = addToast; }, [addToast]);
    useEffect(() => { api.listCollections().then(setCollections).catch(() => {}); }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const handleHover = useCallback((index, nativeEvent) => {
        if (index == null) { setHover(null); return; }
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setHover({ index, sx: nativeEvent.clientX - rect.left, sy: nativeEvent.clientY - rect.top });
    }, []);

    /* ---- Load vectors when collection changes ---- */
    useEffect(() => {
        const load = async () => {
            if (loadingRef.current || !selected) return;
            loadingRef.current = true;
            setLoadingViz(true);
            setPointData(null);
            setQueryInfo(null);
            setQueryPos(null);
            pcaMetaRef.current = null;

            try {
                const col = collections.find((c) => c.name === selected);
                if (!col || col.count === 0) {
                    setStats({ count: 0, dim: col?.dimension || 0, evr: [], method: '' });
                    return;
                }
                const res = await api.visualizeCollection(selected, Math.min(col.count, 500));
                if (!res.vectors?.length) return;

                const built = buildPointData(res.vectors);
                pcaMetaRef.current = { components: res.pca_components, mean: res.pca_mean, ...built.pca };
                setPointData(built);
                setStats({ count: built.count, dim: res.dimension, evr: res.explained_variance_ratio || [], method: res.projection_method });
                toastRef.current(`Loaded ${built.count} vectors from "${selected}"`, 'info');
            } catch (err) {
                toastRef.current(`Failed: ${err.message}`, 'error');
            } finally {
                loadingRef.current = false;
                setLoadingViz(false);
            }
        };
        load();
    }, [selected, collections]);

    /* ---- Semantic query ---- */
    const handleQuery = async (e) => {
        e.preventDefault();
        const text = queryText.trim();
        if (!text || !pcaMetaRef.current) return;
        setQueryLoading(true);

        try {
            let modelToUse = 'all-MiniLM-L6-v2';
            if (queryModel === 'auto' && stats.dim) {
                const modelCfg = getModelForDimension(stats.dim);
                modelToUse = modelCfg ? modelCfg.model : 'all-MiniLM-L6-v2';
            } else if (queryModel !== 'auto') {
                modelToUse = queryModel;
            }

            const emb = await api.embedTexts([text], modelToUse);
            const vec = emb.embeddings[0];
            const { components, mean, mins, ranges } = pcaMetaRef.current;

            if (vec.length !== mean.length) {
                throw new Error(`Embedding dim (${vec.length}) != collection dim (${mean.length}). Using model: ${modelToUse}.`);
            }

            const pca = components.map((pc) => pc.reduce((s, v, j) => s + (vec[j] - mean[j]) * v, 0));
            const x = ((pca[0] - mins[0]) / ranges[0]) * SCALE * 2 - SCALE;
            const y = ((pca[1] - mins[1]) / ranges[1]) * SCALE * 2 - SCALE;
            const z = ((pca[2] - mins[2]) / ranges[2]) * SCALE * 2 - SCALE;

            setQueryPos({ x, y, z, text });
            setQueryInfo({ text, dim: vec.length });
            toastRef.current('Query projected into field', 'success');
        } catch (err) {
            toastRef.current(err.message, 'error');
        } finally {
            setQueryLoading(false);
        }
    };

    const clearQuery = () => {
        setQueryPos(null);
        setQueryInfo(null);
        setQueryText('');
    };

    const fmtPct = (v) => (v != null ? (v * 100).toFixed(1) + '%' : '—');
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
                    <button
                        className={`btn btn-ghost btn-sm ${autoRotate ? 'toggle-on' : ''}`}
                        onClick={() => setAutoRotate((v) => !v)}
                    >
                        {autoRotate ? '◉ Orbiting' : '○ Static'}
                    </button>
                </div>
            </div>

            <div className="visualizer-container">
                <div className="canvas-wrapper" ref={containerRef} style={{ cursor: hover ? 'pointer' : 'grab' }}>
                    <AnimatePresence>
                        {!selected && (
                            <motion.div
                                className="viz-empty-overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                                <h3>Vector Space Explorer</h3>
                                <p>Select a collection to project it into the field</p>
                                <span className="viz-empty-hint">Hover a point to inspect it, drag to orbit</span>
                            </motion.div>
                        )}
                        {selected && loadingViz && (
                            <motion.div className="viz-loading-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <span className="viz-loading-dot" />
                                <span>Projecting vectors…</span>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <Canvas camera={{ position: [55, 42, 70], fov: 55, near: 0.1, far: 1000 }} dpr={[1, 2]}>
                        <Scene data={pointData} query={queryPos} onHover={handleHover} autoRotate={autoRotate} />
                        {hoveredPoint && <HoverMarker position={[hoveredPoint.x, hoveredPoint.y, hoveredPoint.z]} />}
                    </Canvas>

                    {hoveredPoint && (
                        <div className="viz-tooltip" style={{ left: Math.min(hover.sx + 18, containerSize.w - 280), top: Math.min(Math.max(hover.sy - 10, 8), containerSize.h - 160) }}>
                            <div className="tt-header"><span className="tt-id">{hoveredPoint.id}</span></div>
                            {hoveredPoint.metadata && (
                                <div className="tt-body">
                                    {Object.entries(hoveredPoint.metadata).slice(0, 8).map(([k, v]) => (
                                        <div className="tt-row" key={k}>
                                            <span className="tt-key">{k}</span>
                                            <span className="tt-val">{String(v).length > 60 ? String(v).slice(0, 57) + '...' : String(v)}</span>
                                        </div>
                                    ))}
                                    {Object.keys(hoveredPoint.metadata).length > 8 && (
                                        <div className="tt-more">+{Object.keys(hoveredPoint.metadata).length - 8} more</div>
                                    )}
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
                        <div className="stat-row"><span>Vectors</span><span>{stats.count.toLocaleString()}</span></div>
                        <div className="stat-row"><span>Dimensions</span><span>{stats.dim}</span></div>
                        <div className="stat-row"><span>Projection</span><span>{stats.method === 'pca' ? 'PCA' : stats.method === 'randomized_pca' ? 'Rand PCA' : stats.method || '—'}</span></div>
                        {stats.evr?.length > 0 && (<>
                            <div className="stat-row"><span>PC1</span><span>{fmtPct(stats.evr[0])}</span></div>
                            <div className="stat-row"><span>PC2</span><span>{fmtPct(stats.evr[1])}</span></div>
                            <div className="stat-row"><span>PC3</span><span>{fmtPct(stats.evr[2])}</span></div>
                        </>)}
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

                        <div className="query-model-selector">
                            <select className="form-select query-model-select" value={queryModel} onChange={(e) => setQueryModel(e.target.value)} disabled={!selected || stats.count === 0}>
                                <option value="auto">Auto (match collection)</option>
                                {Object.entries(DIMENSION_TO_MODELS).map(([dim, cfg]) => (
                                    <option key={dim} value={cfg.model}>{cfg.label}</option>
                                ))}
                            </select>
                            {queryModel === 'auto' && stats.dim > 0 && (
                                <span className="query-model-hint">{getModelForDimension(stats.dim)?.label || 'Auto'}</span>
                            )}
                        </div>

                        <form onSubmit={handleQuery} className="query-form">
                            <input type="text" className="form-input query-input" placeholder="e.g. machine learning..." value={queryText} onChange={(e) => setQueryText(e.target.value)} disabled={!selected || stats.count === 0} />
                            <div className="query-actions">
                                <button type="submit" className="btn btn-primary btn-sm" disabled={queryLoading || !queryText.trim() || !selected || stats.count === 0}>{queryLoading ? '...' : 'Project'}</button>
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
