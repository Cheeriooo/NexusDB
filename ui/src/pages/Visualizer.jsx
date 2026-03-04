import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { api } from '../api';
import './Visualizer.css';

export default function Visualizer({ addToast }) {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const loadingRef = useRef(false);
    const toastRef = useRef(addToast);
    const [collections, setCollections] = useState([]);
    const [selected, setSelected] = useState('');
    const [stats, setStats] = useState({ count: 0, dim: 0 });
    const [hovered, setHovered] = useState(null);

    // Update toast ref when addToast changes
    useEffect(() => {
        toastRef.current = addToast;
    }, [addToast]);

    useEffect(() => {
        api.listCollections().then((cols) => {
            setCollections(cols);
        }).catch(() => { });
    }, []);

    // Initialize Three.js scene
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const parent = canvas.parentElement;
        const w = parent.clientWidth;
        const h = parent.clientHeight;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050509);
        scene.fog = new THREE.FogExp2(0x050509, 0.008);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);
        const pointLight1 = new THREE.PointLight(0x6366f1, 0.8, 150);
        pointLight1.position.set(50, 50, 50);
        scene.add(pointLight1);
        const pointLight2 = new THREE.PointLight(0x06b6d4, 0.6, 150);
        pointLight2.position.set(-50, 30, -50);
        scene.add(pointLight2);

        // Camera
        const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
        camera.position.set(60, 45, 60);
        camera.lookAt(0, 0, 0);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowShadowMap;

        // Grid
        const grid = new THREE.GridHelper(80, 40, 0x1a1a2e, 0x12121e);
        scene.add(grid);

        // Axes
        const axesGroup = new THREE.Group();
        const axisMat = (color) => new THREE.LineBasicMaterial({ color, opacity: 0.6, transparent: true });
        const makeAxis = (from, to, color) => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
            return new THREE.Line(geo, axisMat(color));
        };
        axesGroup.add(makeAxis([0, 0, 0], [50, 0, 0], 0xef4444));
        axesGroup.add(makeAxis([0, 0, 0], [0, 50, 0], 0x22c55e));
        axesGroup.add(makeAxis([0, 0, 0], [0, 0, 50], 0x3b82f6));
        scene.add(axesGroup);

        // Ambient particles
        const ambientGeo = new THREE.BufferGeometry();
        const ambientCount = 200;
        const ambientPos = new Float32Array(ambientCount * 3);
        for (let i = 0; i < ambientCount * 3; i++) {
            ambientPos[i] = (Math.random() - 0.5) * 100;
        }
        ambientGeo.setAttribute('position', new THREE.BufferAttribute(ambientPos, 3));
        const ambientMat = new THREE.PointsMaterial({ color: 0x6366f1, size: 0.3, transparent: true, opacity: 0.2 });
        scene.add(new THREE.Points(ambientGeo, ambientMat));

        // Mouse controls (orbit)
        let isDragging = false;
        let prevMouse = { x: 0, y: 0 };
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
            const dx = e.clientX - prevMouse.x;
            const dy = e.clientY - prevMouse.y;
            theta -= dx * 0.005;
            phi = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, phi + dy * 0.005));
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

        // Animation
        let animId;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            // Slow auto-rotation when not dragging
            if (!isDragging) {
                theta += 0.001;
                updateCamera();
            }
            renderer.render(scene, camera);
        };
        animate();

        // Resize
        const onResize = () => {
            const w = parent.clientWidth;
            const h = parent.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', onResize);

        sceneRef.current = { scene, camera, renderer, pointsMesh: null };

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

    // Load vectors when collection changes
    useEffect(() => {
        const loadData = async () => {
            // Prevent duplicate loads
            if (loadingRef.current || !selected || !sceneRef.current) return;
            loadingRef.current = true;

            const { scene } = sceneRef.current;

            // Remove old points
            if (sceneRef.current.pointsMesh) {
                scene.remove(sceneRef.current.pointsMesh);
                sceneRef.current.pointsMesh.geometry.dispose();
                sceneRef.current.pointsMesh.material.dispose();
            }

            try {
                const col = collections.find((c) => c.name === selected);
                if (!col || col.count === 0) {
                    setStats({ count: 0, dim: col?.dimension || 0 });
                    loadingRef.current = false;
                    return;
                }

                // Use search with a random vector to get vectors with their values
                const dim = col.dimension;
                const randomVec = Array.from({ length: dim }, () => Math.random() * 2 - 1);
                const res = await api.searchVectors({
                    collection: selected,
                    vector: randomVec,
                    k: Math.min(col.count, 500),
                    include_metadata: true,
                    include_values: true,
                });

                if (!res.matches || res.matches.length === 0) {
                loadingRef.current = false;
                return;
            }

                // PCA to 3D: use first 3 dimensions (or apply simple projection)
                const vectors = res.matches.filter((m) => m.values);
                const n = vectors.length;
                setStats({ count: n, dim });

                // Simple projection: take first 3 components and scale
                const positions = new Float32Array(n * 3);
                const colors = new Float32Array(n * 3);

                // Find bounds for normalization
                let mins = [Infinity, Infinity, Infinity];
                let maxs = [-Infinity, -Infinity, -Infinity];

                vectors.forEach((v) => {
                    for (let d = 0; d < 3; d++) {
                        const val = v.values[d] || 0;
                        mins[d] = Math.min(mins[d], val);
                        maxs[d] = Math.max(maxs[d], val);
                    }
                });

                const ranges = mins.map((min, i) => maxs[i] - min || 1);
            const SCALE = 35;

            // Calculate center and distances
            const center = [0, 0, 0];
            vectors.forEach((v) => {
                for (let d = 0; d < 3; d++) {
                    const normalized = ((v.values[d] || 0) - mins[d]) / ranges[d] * SCALE * 2 - SCALE;
                    center[d] += normalized;
                }
            });
            center.forEach((c, i) => { center[i] = c / n; });

            // Calculate distances from center
            const distances = vectors.map((v) => {
                let dist = 0;
                for (let d = 0; d < 3; d++) {
                    const normalized = ((v.values[d] || 0) - mins[d]) / ranges[d] * SCALE * 2 - SCALE;
                    dist += Math.pow(normalized - center[d], 2);
                }
                return Math.sqrt(dist);
            });

            const minDist = Math.min(...distances);
            const maxDist = Math.max(...distances);
            const distRange = maxDist - minDist || 1;

            vectors.forEach((v, i) => {
                // Normalize to [-SCALE, SCALE]
                positions[i * 3] = ((v.values[0] || 0) - mins[0]) / ranges[0] * SCALE * 2 - SCALE;
                positions[i * 3 + 1] = ((v.values[1] || 0) - mins[1]) / ranges[1] * SCALE * 2 - SCALE;
                positions[i * 3 + 2] = ((v.values[2] || 0) - mins[2]) / ranges[2] * SCALE * 2 - SCALE;

                // Color based on distance from center
                const t = (distances[i] - minDist) / distRange;
                colors[i * 3] = 0.2 + t * 0.8;       // R: cyan to red
                colors[i * 3 + 1] = 0.5 - t * 0.3;   // G
                colors[i * 3 + 2] = 0.95 - t * 0.6;   // B: bright to dark
            });

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
                sceneRef.current.vectorData = vectors;

                toastRef.current(`Visualizing ${n} vectors from "${selected}"`, 'info');
            } catch (err) {
                toastRef.current(`Failed to load vectors: ${err.message}`, 'error');
            } finally {
                loadingRef.current = false;
            }
        };

        loadData();
    }, [selected, collections]);

    const resetCamera = () => {
        if (!sceneRef.current) return;
        const { camera } = sceneRef.current;
        camera.position.set(60, 45, 60);
        camera.lookAt(0, 0, 0);
    };

    return (
        <div className="visualizer-page">
            <div className="view-header">
                <h2>3D Vector Space Explorer</h2>
                <div className="viz-controls">
                    <select className="form-select viz-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
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
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                            <h3>Vector Space Explorer</h3>
                            <p>Select a collection with vectors to visualize them in 3D</p>
                        </div>
                    )}
                    <canvas ref={canvasRef} />
                </div>

                <div className="viz-sidebar">
                    <div className="viz-info-card">
                        <h4>Controls</h4>
                        <div className="control-hint">🖱 Drag to rotate</div>
                        <div className="control-hint">🔍 Scroll to zoom</div>
                        <div className="control-hint">Axes: <span style={{ color: '#ef4444' }}>X</span> <span style={{ color: '#22c55e' }}>Y</span> <span style={{ color: '#3b82f6' }}>Z</span></div>
                    </div>
                    <div className="viz-info-card">
                        <h4>Statistics</h4>
                        <div className="stat-row"><span>Vectors</span><span>{stats.count.toLocaleString()}</span></div>
                        <div className="stat-row"><span>Dimensions</span><span>{stats.dim}</span></div>
                        <div className="stat-row"><span>Projection</span><span>3D Slice</span></div>
                        <div className="stat-row"><span>Max Display</span><span>500</span></div>
                    </div>
                    <div className="viz-info-card">
                        <h4>Legend</h4>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#6366f1' }}></span>
                            Near to query
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#06b6d4' }}></span>
                            Far from query
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
