import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { api } from '../api';
import './Visualizer.css';

// ---------------------------------------------------------------------------
// Helper: canvas-based label sprite
// ---------------------------------------------------------------------------
function createLabelSprite(text, color = '#e2e8f0') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    // Rounded background
    ctx.fillStyle = 'rgba(8, 8, 20, 0.78)';
    ctx.beginPath();
    const r = 6;
    ctx.moveTo(r, 0);
    ctx.lineTo(256 - r, 0);
    ctx.quadraticCurveTo(256, 0, 256, r);
    ctx.lineTo(256, 48 - r);
    ctx.quadraticCurveTo(256, 48, 256 - r, 48);
    ctx.lineTo(r, 48);
    ctx.quadraticCurveTo(0, 48, 0, 48 - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 22), 10, 24);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        opacity: 0.92,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(9, 1.7, 1);
    return sprite;
}

// ---------------------------------------------------------------------------
// Helper: dispose a group of label sprites
// ---------------------------------------------------------------------------
function disposeLabelsGroup(group) {
    if (!group) return;
    group.children.forEach((sprite) => {
        if (sprite.material?.map) sprite.material.map.dispose();
        sprite.material?.dispose();
    });
    group.clear();
}

// ---------------------------------------------------------------------------
// Helper: dispose query sphere + label
// ---------------------------------------------------------------------------
function disposeQueryObjects(sceneRef, scene) {
    if (sceneRef.queryMesh) {
        scene.remove(sceneRef.queryMesh);
        sceneRef.queryMesh.geometry.dispose();
        sceneRef.queryMesh.material.dispose();
        sceneRef.queryMesh = null;
    }
    if (sceneRef.queryLabel) {
        scene.remove(sceneRef.queryLabel);
        if (sceneRef.queryLabel.material?.map) sceneRef.queryLabel.material.map.dispose();
        sceneRef.queryLabel.material?.dispose();
        sceneRef.queryLabel = null;
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Visualizer({ addToast }) {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const loadingRef = useRef(false);
    const toastRef = useRef(addToast);
    const pcaDataRef = useRef(null);   // { components, mean, mins, ranges, SCALE }
    const showLabelsRef = useRef(false);

    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState('');
    const [stats, setStats] = useState({ count: 0, dim: 0, evr: [], method: '' });
    const [showLabels, setShowLabels] = useState(false);
    const [queryText, setQueryText] = useState('');
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryInfo, setQueryInfo] = useState(null);  // { text, dim }

    useEffect(() => { toastRef.current = addToast; }, [addToast]);

    useEffect(() => {
        api.listCollections().then(setCollections).catch(() => {});
    }, []);

    // -----------------------------------------------------------------------
    // Three.js scene initialisation (runs once)
    // -----------------------------------------------------------------------
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const parent = canvas.parentElement;
        const w = parent.clientWidth;
        const h = parent.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050509);
        scene.fog = new THREE.FogExp2(0x050509, 0.008);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const pointLight1 = new THREE.PointLight(0x6366f1, 0.8, 150);
        pointLight1.position.set(50, 50, 50);
        scene.add(pointLight1);
        const pointLight2 = new THREE.PointLight(0x06b6d4, 0.6, 150);
        pointLight2.position.set(-50, 30, -50);
        scene.add(pointLight2);

        const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
        camera.position.set(60, 45, 60);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;

        const grid = new THREE.GridHelper(80, 40, 0x1a1a2e, 0x12121e);
        scene.add(grid);

        const axisMat = (color) => new THREE.LineBasicMaterial({ color, opacity: 0.6, transparent: true });
        const makeAxis = (from, to, color) => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
            return new THREE.Line(geo, axisMat(color));
        };
        const axesGroup = new THREE.Group();
        axesGroup.add(makeAxis([0, 0, 0], [50, 0, 0], 0xef4444));
        axesGroup.add(makeAxis([0, 0, 0], [0, 50, 0], 0x22c55e));
        axesGroup.add(makeAxis([0, 0, 0], [0, 0, 50], 0x3b82f6));
        scene.add(axesGroup);

        const ambientGeo = new THREE.BufferGeometry();
        const ambientCount = 200;
        const ambientPos = new Float32Array(ambientCount * 3);
        for (let i = 0; i < ambientCount * 3; i++) ambientPos[i] = (Math.random() - 0.5) * 100;
        ambientGeo.setAttribute('position', new THREE.BufferAttribute(ambientPos, 3));
        scene.add(new THREE.Points(ambientGeo, new THREE.PointsMaterial({ color: 0x6366f1, size: 0.3, transparent: true, opacity: 0.2 })));

        // Orbit controls
        let isDragging = false, prevMouse = { x: 0, y: 0 };
        let theta = Math.PI / 4, phi = Math.PI / 6, radius = 90;

        const updateCamera = () => {
            camera.position.x = radius * Math.sin(theta) * Math.cos(phi);
            camera.position.y = radius * Math.sin(phi);
            camera.position.z = radius * Math.cos(theta) * Math.cos(phi);
            camera.lookAt(0, 0, 0);
        };
        const onMouseDown = (e) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
        const onMouseMove = (e) => {
            if (!isDragging) return;
            theta -= (e.clientX - prevMouse.x) * 0.005;
            phi = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, phi + (e.clientY - prevMouse.y) * 0.005));
            prevMouse = { x: e.clientX, y: e.clientY };
            updateCamera();
        };
        const onMouseUp = () => { isDragging = false; };
        const onWheel = (e) => {
            radius = Math.max(10, Math.min(150, radius + e.deltaY * 0.05));
            updateCamera();
        };
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseUp);
        canvas.addEventListener('wheel', onWheel);
        updateCamera();

        let animId;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            if (!isDragging) { theta += 0.001; updateCamera(); }
            renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            const nw = parent.clientWidth, nh = parent.clientHeight;
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh);
        };
        window.addEventListener('resize', onResize);

        sceneRef.current = { scene, camera, renderer, pointsMesh: null, labelsGroup: null, queryMesh: null, queryLabel: null };

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', onResize);
            canvas.removeEventListener('mousedown', onMouseDown);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('mouseleave', onMouseUp);
            canvas.removeEventListener('wheel', onWheel);
            renderer.dispose();
        };
    }, []);

    // -----------------------------------------------------------------------
    // Sync showLabels state → Three.js group visibility
    // -----------------------------------------------------------------------
    useEffect(() => {
        showLabelsRef.current = showLabels;
        if (sceneRef.current?.labelsGroup) {
            sceneRef.current.labelsGroup.visible = showLabels;
        }
    }, [showLabels]);

    // -----------------------------------------------------------------------
    // Load + project vectors when collection changes
    // -----------------------------------------------------------------------
    useEffect(() => {
        const loadData = async () => {
            if (loadingRef.current || !selected || !sceneRef.current) return;
            loadingRef.current = true;

            const { scene } = sceneRef.current;

            // Clean up previous data objects
            if (sceneRef.current.pointsMesh) {
                scene.remove(sceneRef.current.pointsMesh);
                sceneRef.current.pointsMesh.geometry.dispose();
                sceneRef.current.pointsMesh.material.dispose();
                sceneRef.current.pointsMesh = null;
            }
            if (sceneRef.current.labelsGroup) {
                scene.remove(sceneRef.current.labelsGroup);
                disposeLabelsGroup(sceneRef.current.labelsGroup);
                sceneRef.current.labelsGroup = null;
            }
            disposeQueryObjects(sceneRef.current, scene);
            pcaDataRef.current = null;
            setQueryInfo(null);

            try {
                const col = collections.find((c) => c.name === selected);
                if (!col || col.count === 0) {
                    setStats({ count: 0, dim: col?.dimension || 0, evr: [], method: '' });
                    loadingRef.current = false;
                    return;
                }

                // Fetch PCA-projected data from backend
                const res = await api.visualizeCollection(selected, Math.min(col.count, 500));

                if (!res.vectors || res.vectors.length === 0) {
                    loadingRef.current = false;
                    return;
                }

                const vectors = res.vectors;
                const n = vectors.length;

                // Find bounds of PCA coordinates for scene normalisation
                const mins = [Infinity, Infinity, Infinity];
                const maxs = [-Infinity, -Infinity, -Infinity];
                vectors.forEach((v) => {
                    for (let d = 0; d < 3; d++) {
                        if (v.projected[d] < mins[d]) mins[d] = v.projected[d];
                        if (v.projected[d] > maxs[d]) maxs[d] = v.projected[d];
                    }
                });
                const ranges = mins.map((min, i) => maxs[i] - min || 1);
                const SCALE = 35;

                // Store PCA data for later query projection
                pcaDataRef.current = {
                    components: res.pca_components,
                    mean: res.pca_mean,
                    mins,
                    ranges,
                    SCALE,
                };

                // Compute normalised scene positions
                const positions = new Float32Array(n * 3);
                const toScene = (val, dim) => ((val - mins[dim]) / ranges[dim]) * SCALE * 2 - SCALE;

                vectors.forEach((v, i) => {
                    positions[i * 3]     = toScene(v.projected[0], 0);
                    positions[i * 3 + 1] = toScene(v.projected[1], 1);
                    positions[i * 3 + 2] = toScene(v.projected[2], 2);
                });

                // Colour by distance from centroid
                const center = [0, 0, 0];
                for (let i = 0; i < n; i++) {
                    center[0] += positions[i * 3];
                    center[1] += positions[i * 3 + 1];
                    center[2] += positions[i * 3 + 2];
                }
                center.forEach((c, i) => (center[i] = c / n));

                const distances = new Float32Array(n);
                for (let i = 0; i < n; i++) {
                    const dx = positions[i * 3] - center[0];
                    const dy = positions[i * 3 + 1] - center[1];
                    const dz = positions[i * 3 + 2] - center[2];
                    distances[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
                }
                const minDist = Math.min(...distances);
                const distRange = (Math.max(...distances) - minDist) || 1;

                const colors = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) {
                    const t = (distances[i] - minDist) / distRange;
                    colors[i * 3]     = 0.2 + t * 0.8;
                    colors[i * 3 + 1] = 0.5 - t * 0.3;
                    colors[i * 3 + 2] = 0.95 - t * 0.6;
                }

                // Points mesh
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                const mat = new THREE.PointsMaterial({
                    size: Math.max(2.5, Math.min(5, 200 / Math.sqrt(n))),
                    vertexColors: true,
                    transparent: true,
                    opacity: 0.9,
                    sizeAttenuation: true,
                    fog: true,
                });
                const points = new THREE.Points(geo, mat);
                scene.add(points);
                sceneRef.current.pointsMesh = points;

                // Label sprites
                const labelsGroup = new THREE.Group();
                labelsGroup.visible = showLabelsRef.current;
                vectors.forEach((v, i) => {
                    const labelText = v.metadata?.label || v.id.slice(0, 18);
                    const sprite = createLabelSprite(labelText);
                    sprite.position.set(
                        positions[i * 3],
                        positions[i * 3 + 1] + 2.2,
                        positions[i * 3 + 2],
                    );
                    labelsGroup.add(sprite);
                });
                scene.add(labelsGroup);
                sceneRef.current.labelsGroup = labelsGroup;

                const evr = res.explained_variance_ratio || [];
                setStats({ count: n, dim: res.dimension, evr, method: res.projection_method });
                toastRef.current(`Visualizing ${n} vectors from "${selected}"`, 'info');
            } catch (err) {
                toastRef.current(`Failed to load vectors: ${err.message}`, 'error');
            } finally {
                loadingRef.current = false;
            }
        };

        loadData();
    }, [selected, collections]);

    // -----------------------------------------------------------------------
    // Query: embed text → project via stored PCA → show sphere
    // -----------------------------------------------------------------------
    const handleQueryEmbed = async (e) => {
        e.preventDefault();
        const text = queryText.trim();
        if (!text || !pcaDataRef.current || !sceneRef.current) return;

        setQueryLoading(true);
        const { scene } = sceneRef.current;
        disposeQueryObjects(sceneRef.current, scene);

        try {
            const embedRes = await api.embedTexts([text]);
            const embedding = embedRes.embeddings[0];
            const { components, mean, mins, ranges, SCALE } = pcaDataRef.current;

            if (embedding.length !== mean.length) {
                throw new Error(
                    `Embedding dim (${embedding.length}) ≠ collection dim (${mean.length}). ` +
                    `Create a collection with dimension=${embedding.length} for text queries.`
                );
            }

            // Project embedding into PCA space
            const pcaCoords = components.map((pc) =>
                pc.reduce((sum, val, j) => sum + (embedding[j] - mean[j]) * val, 0)
            );

            // Normalise to scene coordinates
            const x = ((pcaCoords[0] - mins[0]) / ranges[0]) * SCALE * 2 - SCALE;
            const y = ((pcaCoords[1] - mins[1]) / ranges[1]) * SCALE * 2 - SCALE;
            const z = ((pcaCoords[2] - mins[2]) / ranges[2]) * SCALE * 2 - SCALE;

            // Gold sphere for query point
            const sphereGeo = new THREE.SphereGeometry(1.8, 16, 16);
            const sphereMat = new THREE.MeshStandardMaterial({
                color: 0xfbbf24,
                emissive: 0xfbbf24,
                emissiveIntensity: 0.6,
            });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            sphere.position.set(x, y, z);
            scene.add(sphere);
            sceneRef.current.queryMesh = sphere;

            // Label for query point
            const labelSprite = createLabelSprite('► ' + text.slice(0, 20), '#fbbf24');
            labelSprite.position.set(x, y + 4, z);
            scene.add(labelSprite);
            sceneRef.current.queryLabel = labelSprite;

            setQueryInfo({ text, dim: embedding.length });
            toastRef.current('Query projected to 3D!', 'success');
        } catch (err) {
            toastRef.current(err.message, 'error');
        } finally {
            setQueryLoading(false);
        }
    };

    const clearQuery = () => {
        if (!sceneRef.current) return;
        disposeQueryObjects(sceneRef.current, sceneRef.current.scene);
        setQueryInfo(null);
        setQueryText('');
    };

    const resetCamera = () => {
        if (!sceneRef.current) return;
        sceneRef.current.camera.position.set(60, 45, 60);
        sceneRef.current.camera.lookAt(0, 0, 0);
    };

    const fmtPct = (v) => v != null ? `${(v * 100).toFixed(1)}%` : '—';

    return (
        <div className="visualizer-page">
            <div className="view-header">
                <h2>3D Vector Space Explorer</h2>
                <div className="viz-controls">
                    <select
                        className="form-select viz-select"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                    >
                        <option value="">Select collection...</option>
                        {collections.map((c) => (
                            <option key={c.name} value={c.name}>{c.name} ({c.count} vectors)</option>
                        ))}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={resetCamera}>Reset View</button>
                </div>
            </div>

            <div className="visualizer-container">
                <div className="canvas-wrapper">
                    {!selected && (
                        <div className="viz-empty-overlay">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                            <h3>Vector Space Explorer</h3>
                            <p>Select a collection to visualize vectors in 3D via PCA</p>
                        </div>
                    )}
                    <canvas ref={canvasRef} />
                </div>

                <div className="viz-sidebar">
                    {/* Controls */}
                    <div className="viz-info-card">
                        <h4>Controls</h4>
                        <div className="control-hint">🖱 Drag to rotate</div>
                        <div className="control-hint">🔍 Scroll to zoom</div>
                        <div className="control-hint">
                            Axes: <span style={{ color: '#ef4444' }}>X</span>{' '}
                            <span style={{ color: '#22c55e' }}>Y</span>{' '}
                            <span style={{ color: '#3b82f6' }}>Z</span>
                        </div>
                        <div className="label-toggle-row">
                            <span>Labels</span>
                            <button
                                className={`toggle-btn ${showLabels ? 'active' : ''}`}
                                onClick={() => setShowLabels((v) => !v)}
                            >
                                {showLabels ? 'ON' : 'OFF'}
                            </button>
                        </div>
                    </div>

                    {/* Statistics */}
                    <div className="viz-info-card">
                        <h4>Statistics</h4>
                        <div className="stat-row"><span>Vectors</span><span>{stats.count.toLocaleString()}</span></div>
                        <div className="stat-row"><span>Dimensions</span><span>{stats.dim}</span></div>
                        <div className="stat-row">
                            <span>Projection</span>
                            <span>{stats.method === 'pca' ? 'PCA' : stats.method === 'randomized_pca' ? 'Rand. PCA' : stats.method || '—'}</span>
                        </div>
                        {stats.evr && stats.evr.length > 0 && (
                            <>
                                <div className="stat-row"><span>PC1 var</span><span>{fmtPct(stats.evr[0])}</span></div>
                                <div className="stat-row"><span>PC2 var</span><span>{fmtPct(stats.evr[1])}</span></div>
                                <div className="stat-row"><span>PC3 var</span><span>{fmtPct(stats.evr[2])}</span></div>
                            </>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="viz-info-card">
                        <h4>Legend</h4>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#06b6d4' }}></span>
                            Near centroid
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#ef4444' }}></span>
                            Far from centroid
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#fbbf24', border: '2px solid #fbbf24', boxSizing: 'border-box' }}></span>
                            Query point
                        </div>
                    </div>

                    {/* Semantic Query */}
                    <div className="viz-info-card query-panel">
                        <h4>Semantic Query</h4>
                        <p className="query-hint">
                            Enter text to embed and project into this space.
                            Requires collection dim = 384.
                        </p>
                        <form onSubmit={handleQueryEmbed} className="query-form">
                            <input
                                type="text"
                                className="form-input query-input"
                                placeholder="e.g. machine learning…"
                                value={queryText}
                                onChange={(e) => setQueryText(e.target.value)}
                                disabled={!selected || stats.count === 0}
                            />
                            <div className="query-actions">
                                <button
                                    type="submit"
                                    className="btn btn-primary btn-sm"
                                    disabled={queryLoading || !queryText.trim() || !selected || stats.count === 0}
                                >
                                    {queryLoading ? '…' : 'Project'}
                                </button>
                                {queryInfo && (
                                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearQuery}>
                                        Clear
                                    </button>
                                )}
                            </div>
                        </form>
                        {queryInfo && (
                            <div className="query-result">
                                <span className="query-label-chip">► {queryInfo.text.slice(0, 28)}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
