import { useEffect, useRef, useState } from 'react';
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

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function createQueryLabel(text) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 48;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
    const r = 6;
    ctx.beginPath();
    ctx.moveTo(r, 0); ctx.lineTo(256 - r, 0); ctx.quadraticCurveTo(256, 0, 256, r);
    ctx.lineTo(256, 48 - r); ctx.quadraticCurveTo(256, 48, 256 - r, 48);
    ctx.lineTo(r, 48); ctx.quadraticCurveTo(0, 48, 0, 48 - r);
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#fbbf24'; ctx.textBaseline = 'middle';
    ctx.fillText('\u25b8 ' + text.slice(0, 22), 10, 24);
    const texture = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, opacity: 0.95 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(10, 2, 1);
    return sprite;
}

export default function Visualizer({ addToast }) {
    const canvasRef = useRef(null);
    const tooltipRef = useRef(null);
    const sceneRef = useRef(null);
    const loadingRef = useRef(false);
    const toastRef = useRef(addToast);
    const pcaDataRef = useRef(null);
    const vectorDataRef = useRef([]);

    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState('');
    const [stats, setStats] = useState({ count: 0, dim: 0, evr: [], method: '' });
    const [queryText, setQueryText] = useState('');
    const [queryLoading, setQueryLoading] = useState(false);
    const [queryInfo, setQueryInfo] = useState(null);
    const [queryModel, setQueryModel] = useState('auto');

    useEffect(() => { toastRef.current = addToast; }, [addToast]);
    useEffect(() => { api.listCollections().then(setCollections).catch(() => {}); }, []);

    /* ---- Three.js scene ---- */
    useEffect(() => {
        const el = canvasRef.current;
        if (!el) return;
        const parent = el.parentElement;
        const w = parent.clientWidth, h = parent.clientHeight;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x06060e);
        scene.fog = new THREE.FogExp2(0x06060e, 0.006);

        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const l1 = new THREE.PointLight(0x6366f1, 1, 200); l1.position.set(60, 60, 60); scene.add(l1);
        const l2 = new THREE.PointLight(0x06b6d4, 0.7, 200); l2.position.set(-60, 40, -60); scene.add(l2);
        const l3 = new THREE.PointLight(0xa855f7, 0.5, 200); l3.position.set(0, -40, 60); scene.add(l3);

        const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 1000);
        camera.position.set(60, 45, 60); camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const grid = new THREE.GridHelper(100, 50, 0x1a1a2e, 0x0e0e1a);
        grid.position.y = -0.5; scene.add(grid);

        const axMat = (c) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.5 });
        const mkAx = (f, t, c) => {
            const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...f), new THREE.Vector3(...t)]);
            return new THREE.Line(g, axMat(c));
        };
        const axes = new THREE.Group();
        axes.add(mkAx([0,0,0],[45,0,0],0xef4444));
        axes.add(mkAx([0,0,0],[0,45,0],0x22c55e));
        axes.add(mkAx([0,0,0],[0,0,45],0x3b82f6));
        scene.add(axes);

        const dustGeo = new THREE.BufferGeometry();
        const dustPos = new Float32Array(300 * 3);
        for (let i = 0; i < 900; i++) dustPos[i] = (Math.random() - 0.5) * 130;
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x6366f1, size: 0.12, transparent: true, opacity: 0.12 })));

        /* Highlight sphere */
        const hlGeo = new THREE.SphereGeometry(2.4, 24, 24);
        const hlMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.22 });
        const hlMesh = new THREE.Mesh(hlGeo, hlMat); hlMesh.visible = false; scene.add(hlMesh);

        /* Highlight ring */
        const ringGeo = new THREE.RingGeometry(2.8, 3.2, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat); ringMesh.visible = false; scene.add(ringMesh);

        /* Raycaster */
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = 1.8;
        const mouse = new THREE.Vector2(-999, -999);

        /* Orbit */
        const orbit = { theta: Math.PI / 4, phi: Math.PI / 6, radius: 85 };
        let isDragging = false, prev = { x: 0, y: 0 };

        const updCam = () => {
            camera.position.x = orbit.radius * Math.sin(orbit.theta) * Math.cos(orbit.phi);
            camera.position.y = orbit.radius * Math.sin(orbit.phi);
            camera.position.z = orbit.radius * Math.cos(orbit.theta) * Math.cos(orbit.phi);
            camera.lookAt(0, 0, 0);
        };

        const onDown = (e) => { isDragging = true; prev = { x: e.clientX, y: e.clientY }; el.style.cursor = 'grabbing'; };
        const onMove = (e) => {
            if (isDragging) {
                orbit.theta -= (e.clientX - prev.x) * 0.005;
                orbit.phi = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, orbit.phi + (e.clientY - prev.y) * 0.005));
                prev = { x: e.clientX, y: e.clientY };
                updCam();
            }
            /* Raycasting for hover tooltip */
            const rect = el.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            if (sceneRef.current?.pointsMesh && !isDragging) {
                raycaster.setFromCamera(mouse, camera);
                const hits = raycaster.intersectObject(sceneRef.current.pointsMesh);
                const tip = tooltipRef.current;

                if (hits.length > 0) {
                    const idx = hits[0].index;
                    const vd = vectorDataRef.current[idx];
                    if (vd && tip) {
                        const tx = e.clientX - rect.left + 18;
                        const ty = e.clientY - rect.top - 10;
                        tip.style.left = Math.min(tx, rect.width - 290) + 'px';
                        tip.style.top = Math.min(Math.max(ty, 8), rect.height - 160) + 'px';
                        tip.style.opacity = '1';

                        let html = '<div class="tt-header"><span class="tt-id">' + escapeHtml(vd.id) + '</span></div><div class="tt-body">';
                        if (vd.metadata) {
                            const entries = Object.entries(vd.metadata).slice(0, 8);
                            for (const [k, v] of entries) {
                                const val = String(v).length > 60 ? String(v).slice(0, 57) + '...' : String(v);
                                html += '<div class="tt-row"><span class="tt-key">' + escapeHtml(k) + '</span><span class="tt-val">' + escapeHtml(val) + '</span></div>';
                            }
                            if (Object.keys(vd.metadata).length > 8) html += '<div class="tt-more">+' + (Object.keys(vd.metadata).length - 8) + ' more</div>';
                        }
                        html += '</div>';
                        tip.innerHTML = html;

                        hlMesh.position.set(vd.x, vd.y, vd.z); hlMesh.visible = true;
                        ringMesh.position.set(vd.x, vd.y, vd.z); ringMesh.lookAt(camera.position); ringMesh.visible = true;
                        el.style.cursor = 'pointer';
                    }
                } else {
                    if (tip) tip.style.opacity = '0';
                    hlMesh.visible = false; ringMesh.visible = false;
                    if (!isDragging) el.style.cursor = 'grab';
                }
            }
        };
        const onUp = () => { isDragging = false; el.style.cursor = 'grab'; };
        const onLeave = () => { onUp(); if (tooltipRef.current) tooltipRef.current.style.opacity = '0'; hlMesh.visible = false; ringMesh.visible = false; };
        const onWheel = (e) => { orbit.radius = Math.max(10, Math.min(180, orbit.radius + e.deltaY * 0.05)); updCam(); };

        el.addEventListener('mousedown', onDown);
        el.addEventListener('mousemove', onMove);
        el.addEventListener('mouseup', onUp);
        el.addEventListener('mouseleave', onLeave);
        el.addEventListener('wheel', onWheel);
        updCam();

        let time = 0, animId;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            time += 0.016;
            if (!isDragging) { orbit.theta += 0.0008; updCam(); }
            if (hlMesh.visible) {
                const s = 1 + Math.sin(time * 4) * 0.12;
                hlMesh.scale.set(s, s, s);
                hlMesh.material.opacity = 0.18 + Math.sin(time * 3) * 0.08;
            }
            if (ringMesh.visible) { ringMesh.rotation.z = time * 1.5; ringMesh.lookAt(camera.position); }
            renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            const nw = parent.clientWidth, nh = parent.clientHeight;
            camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh);
        };
        window.addEventListener('resize', onResize);

        sceneRef.current = { scene, camera, renderer, pointsMesh: null, hlMesh, ringMesh, queryMesh: null, queryLabel: null, orbit };

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('resize', onResize);
            el.removeEventListener('mousedown', onDown);
            el.removeEventListener('mousemove', onMove);
            el.removeEventListener('mouseup', onUp);
            el.removeEventListener('mouseleave', onLeave);
            el.removeEventListener('wheel', onWheel);
            renderer.dispose();
        };
    }, []);

    /* ---- Load vectors when collection changes ---- */
    useEffect(() => {
        const load = async () => {
            if (loadingRef.current || !selected || !sceneRef.current) return;
            loadingRef.current = true;
            const { scene } = sceneRef.current;

            if (sceneRef.current.pointsMesh) {
                scene.remove(sceneRef.current.pointsMesh);
                sceneRef.current.pointsMesh.geometry.dispose();
                sceneRef.current.pointsMesh.material.dispose();
                sceneRef.current.pointsMesh = null;
            }
            if (sceneRef.current.queryMesh) {
                scene.remove(sceneRef.current.queryMesh);
                sceneRef.current.queryMesh.geometry.dispose();
                sceneRef.current.queryMesh.material.dispose();
                sceneRef.current.queryMesh = null;
            }
            if (sceneRef.current.queryLabel) {
                scene.remove(sceneRef.current.queryLabel);
                sceneRef.current.queryLabel.material?.map?.dispose();
                sceneRef.current.queryLabel.material?.dispose();
                sceneRef.current.queryLabel = null;
            }
            pcaDataRef.current = null;
            vectorDataRef.current = [];
            setQueryInfo(null);

            try {
                const col = collections.find(c => c.name === selected);
                if (!col || col.count === 0) {
                    setStats({ count: 0, dim: col?.dimension || 0, evr: [], method: '' });
                    loadingRef.current = false;
                    return;
                }

                const res = await api.visualizeCollection(selected, Math.min(col.count, 500));
                if (!res.vectors?.length) { loadingRef.current = false; return; }

                const vecs = res.vectors;
                const n = vecs.length;
                const mins = [Infinity, Infinity, Infinity], maxs = [-Infinity, -Infinity, -Infinity];
                vecs.forEach(v => { for (let d = 0; d < 3; d++) { if (v.projected[d] < mins[d]) mins[d] = v.projected[d]; if (v.projected[d] > maxs[d]) maxs[d] = v.projected[d]; } });
                const ranges = mins.map((m, i) => maxs[i] - m || 1);
                const SCALE = 35;

                pcaDataRef.current = { components: res.pca_components, mean: res.pca_mean, mins, ranges, SCALE };

                const positions = new Float32Array(n * 3);
                const sc = (val, d) => ((val - mins[d]) / ranges[d]) * SCALE * 2 - SCALE;
                const vData = [];
                vecs.forEach((v, i) => {
                    const x = sc(v.projected[0], 0), y = sc(v.projected[1], 1), z = sc(v.projected[2], 2);
                    positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
                    vData.push({ id: v.id, metadata: v.metadata, x, y, z });
                });
                vectorDataRef.current = vData;

                /* Color by distance from centroid: cyan -> indigo -> purple */
                const center = [0, 0, 0];
                for (let i = 0; i < n; i++) { center[0] += positions[i*3]; center[1] += positions[i*3+1]; center[2] += positions[i*3+2]; }
                center.forEach((c, i) => center[i] = c / n);

                let maxDist = 0;
                const dists = new Float32Array(n);
                for (let i = 0; i < n; i++) {
                    const dx = positions[i*3]-center[0], dy = positions[i*3+1]-center[1], dz = positions[i*3+2]-center[2];
                    dists[i] = Math.sqrt(dx*dx+dy*dy+dz*dz);
                    if (dists[i] > maxDist) maxDist = dists[i];
                }
                const dr = maxDist || 1;

                const colors = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) {
                    const t = dists[i] / dr;
                    colors[i*3]   = 0.15 + t * 0.7;
                    colors[i*3+1] = 0.7  - t * 0.45;
                    colors[i*3+2] = 1.0  - t * 0.15;
                }

                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                const mat = new THREE.PointsMaterial({
                    size: Math.max(2.8, Math.min(5.5, 280 / Math.sqrt(n))),
                    vertexColors: true, transparent: true, opacity: 0.92,
                    sizeAttenuation: true, fog: true,
                });
                const pts = new THREE.Points(geo, mat);
                scene.add(pts);
                sceneRef.current.pointsMesh = pts;

                setStats({ count: n, dim: res.dimension, evr: res.explained_variance_ratio || [], method: res.projection_method });
                toastRef.current(`Loaded ${n} vectors from "${selected}"`, 'info');
            } catch (err) {
                toastRef.current(`Failed: ${err.message}`, 'error');
            } finally {
                loadingRef.current = false;
            }
        };
        load();
    }, [selected, collections]);

    /* ---- Semantic query ---- */
    const handleQuery = async (e) => {
        e.preventDefault();
        const text = queryText.trim();
        if (!text || !pcaDataRef.current || !sceneRef.current) return;
        setQueryLoading(true);
        const { scene } = sceneRef.current;

        if (sceneRef.current.queryMesh) { scene.remove(sceneRef.current.queryMesh); sceneRef.current.queryMesh.geometry.dispose(); sceneRef.current.queryMesh.material.dispose(); sceneRef.current.queryMesh = null; }
        if (sceneRef.current.queryLabel) { scene.remove(sceneRef.current.queryLabel); sceneRef.current.queryLabel.material?.map?.dispose(); sceneRef.current.queryLabel.material?.dispose(); sceneRef.current.queryLabel = null; }

        try {
            // Determine which model to use
            let modelToUse = 'all-MiniLM-L6-v2';
            if (queryModel === 'auto' && stats.dim) {
                const modelCfg = getModelForDimension(stats.dim);
                modelToUse = modelCfg ? modelCfg.model : 'all-MiniLM-L6-v2';
            } else if (queryModel !== 'auto') {
                modelToUse = queryModel;
            }

            const emb = await api.embedTexts([text], modelToUse);
            const vec = emb.embeddings[0];
            const { components, mean, mins, ranges, SCALE } = pcaDataRef.current;

            if (vec.length !== mean.length) throw new Error(`Embedding dim (${vec.length}) != collection dim (${mean.length}). Using model: ${modelToUse}. Make sure the embedding model dimension matches the collection dimension.`);

            const pca = components.map(pc => pc.reduce((s, v, j) => s + (vec[j] - mean[j]) * v, 0));
            const x = ((pca[0] - mins[0]) / ranges[0]) * SCALE * 2 - SCALE;
            const y = ((pca[1] - mins[1]) / ranges[1]) * SCALE * 2 - SCALE;
            const z = ((pca[2] - mins[2]) / ranges[2]) * SCALE * 2 - SCALE;

            const sph = new THREE.Mesh(
                new THREE.SphereGeometry(2, 24, 24),
                new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.7 })
            );
            sph.position.set(x, y, z); scene.add(sph);
            sceneRef.current.queryMesh = sph;

            const label = createQueryLabel(text);
            label.position.set(x, y + 4.5, z); scene.add(label);
            sceneRef.current.queryLabel = label;

            setQueryInfo({ text, dim: vec.length });
            toastRef.current('Query projected!', 'success');
        } catch (err) {
            toastRef.current(err.message, 'error');
        } finally {
            setQueryLoading(false);
        }
    };

    const clearQuery = () => {
        if (!sceneRef.current) return;
        const { scene } = sceneRef.current;
        if (sceneRef.current.queryMesh) { scene.remove(sceneRef.current.queryMesh); sceneRef.current.queryMesh.geometry.dispose(); sceneRef.current.queryMesh.material.dispose(); sceneRef.current.queryMesh = null; }
        if (sceneRef.current.queryLabel) { scene.remove(sceneRef.current.queryLabel); sceneRef.current.queryLabel.material?.map?.dispose(); sceneRef.current.queryLabel.material?.dispose(); sceneRef.current.queryLabel = null; }
        setQueryInfo(null); setQueryText('');
    };

    const resetCamera = () => {
        if (!sceneRef.current) return;
        Object.assign(sceneRef.current.orbit, { theta: Math.PI / 4, phi: Math.PI / 6, radius: 85 });
    };

    const fmtPct = v => v != null ? (v * 100).toFixed(1) + '%' : '\u2014';

    return (
        <div className="visualizer-page">
            <div className="view-header">
                <h2>3D Vector Explorer</h2>
                <div className="viz-controls">
                    <select className="form-select viz-select" value={selected} onChange={e => setSelected(e.target.value)}>
                        <option value="">Select collection...</option>
                        {collections.map(c => (
                            <option key={c.name} value={c.name}>{c.name} ({c.count} vectors, {c.dimension}D)</option>
                        ))}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={resetCamera}>Reset View</button>
                </div>
            </div>

            <div className="visualizer-container">
                <div className="canvas-wrapper">
                    {!selected && (
                        <div className="viz-empty-overlay">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                            <h3>Vector Space Explorer</h3>
                            <p>Select a collection to visualize vectors in 3D</p>
                            <span className="viz-empty-hint">Hover over any point to inspect vector details</span>
                        </div>
                    )}
                    <canvas ref={canvasRef} />
                    <div ref={tooltipRef} className="viz-tooltip" />
                </div>

                <div className="viz-sidebar">
                    <div className="viz-info-card">
                        <h4>Controls</h4>
                        <div className="control-hint">{'\uD83D\uDDB1'} Drag to orbit</div>
                        <div className="control-hint">{'\uD83D\uDD0D'} Scroll to zoom</div>
                        <div className="control-hint">{'\u2726'} Hover to inspect</div>
                        <div className="control-hint" style={{ marginTop: 4 }}>
                            Axes: <span style={{ color: '#ef4444' }}>X</span>{' '}
                            <span style={{ color: '#22c55e' }}>Y</span>{' '}
                            <span style={{ color: '#3b82f6' }}>Z</span>
                        </div>
                    </div>

                    <div className="viz-info-card">
                        <h4>Statistics</h4>
                        <div className="stat-row"><span>Vectors</span><span>{stats.count.toLocaleString()}</span></div>
                        <div className="stat-row"><span>Dimensions</span><span>{stats.dim}</span></div>
                        <div className="stat-row"><span>Projection</span><span>{stats.method === 'pca' ? 'PCA' : stats.method === 'randomized_pca' ? 'Rand PCA' : stats.method || '\u2014'}</span></div>
                        {stats.evr?.length > 0 && (<>
                            <div className="stat-row"><span>PC1</span><span>{fmtPct(stats.evr[0])}</span></div>
                            <div className="stat-row"><span>PC2</span><span>{fmtPct(stats.evr[1])}</span></div>
                            <div className="stat-row"><span>PC3</span><span>{fmtPct(stats.evr[2])}</span></div>
                        </>)}
                    </div>

                    <div className="viz-info-card">
                        <h4>Legend</h4>
                        <div className="legend-item"><span className="legend-dot" style={{ background: 'linear-gradient(135deg, #06b6d4, #818cf8)' }} />{' '}Near centroid</div>
                        <div className="legend-item"><span className="legend-dot" style={{ background: 'linear-gradient(135deg, #a855f7, #ef4444)' }} />{' '}Far from centroid</div>
                        <div className="legend-item"><span className="legend-dot" style={{ background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' }} />{' '}Query point</div>
                    </div>

                    <div className="viz-info-card query-panel">
                        <h4>Semantic Query</h4>
                        <p className="query-hint">Embed text and project into this vector space.</p>

                        {/* Model selector */}
                        <div className="query-model-selector">
                            <select className="form-select query-model-select" value={queryModel} onChange={e => setQueryModel(e.target.value)} disabled={!selected || stats.count === 0}>
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
                            <input type="text" className="form-input query-input" placeholder="e.g. machine learning..." value={queryText} onChange={e => setQueryText(e.target.value)} disabled={!selected || stats.count === 0} />
                            <div className="query-actions">
                                <button type="submit" className="btn btn-primary btn-sm" disabled={queryLoading || !queryText.trim() || !selected || stats.count === 0}>{queryLoading ? '...' : 'Project'}</button>
                                {queryInfo && <button type="button" className="btn btn-ghost btn-sm" onClick={clearQuery}>Clear</button>}
                            </div>
                        </form>
                        {queryInfo && <div className="query-result"><span className="query-label-chip">{'\u25b8'} {queryInfo.text.slice(0, 28)}</span></div>}
                    </div>
                </div>
            </div>
        </div>
    );
}