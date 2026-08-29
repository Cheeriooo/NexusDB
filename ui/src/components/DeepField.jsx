import { useEffect, useMemo, useRef, useState } from 'react';
import { DeckGL } from '@deck.gl/react';
import { OrbitView } from '@deck.gl/core';
import { PointCloudLayer, ScatterplotLayer, LineLayer } from '@deck.gl/layers';

/* ═══════════════════════════════════════════════════════════════
   Shared "Deep Field" scene — a deck.gl OrbitView point cloud used
   by both the real visualizer (pages/Visualizer.jsx) and the
   in-browser demo (demo/pages/DemoVisualizer.jsx). deck.gl's
   PointCloudLayer draws anti-aliased circular points out of the box
   (three.js's PointsMaterial drew flat hard-edged squares, which is
   what made the old field look rough), and picking gives us
   viewport-relative pixel coordinates directly — no manual raycast
   or getBoundingClientRect math needed for hover/tooltip placement.
   ═══════════════════════════════════════════════════════════════ */

/* ---- Static dressing: a faint dust field + a floor grid ---- */
const DUST_POINTS = (() => {
    const n = 400;
    const pts = new Array(n);
    for (let i = 0; i < n; i++) {
        pts[i] = [(Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 140];
    }
    return pts;
})();

const GRID_Y = -34;
const GRID_HALF = 110;
const GRID_CELL = 6;
const GRID_SECTION = 30;
const GRID_LINES = (() => {
    const lines = [];
    const isSection = (v) => Math.abs(Math.round(v / GRID_SECTION) * GRID_SECTION - v) < 0.01;
    for (let x = -GRID_HALF; x <= GRID_HALF + 0.01; x += GRID_CELL) {
        const major = isSection(x);
        lines.push({ a: [x, GRID_Y, -GRID_HALF], b: [x, GRID_Y, GRID_HALF], color: major ? [61, 55, 47, 190] : [42, 38, 34, 110], width: major ? 1.3 : 0.6 });
    }
    for (let z = -GRID_HALF; z <= GRID_HALF + 0.01; z += GRID_CELL) {
        const major = isSection(z);
        lines.push({ a: [-GRID_HALF, GRID_Y, z], b: [GRID_HALF, GRID_Y, z], color: major ? [61, 55, 47, 190] : [42, 38, 34, 110], width: major ? 1.3 : 0.6 });
    }
    return lines;
})();

const INITIAL_VIEW_STATE = {
    target: [0, 0, 0],
    rotationX: 22,
    rotationOrbit: -35,
    zoom: 2.4,
    minZoom: 0.6,
    maxZoom: 5.5,
};

const view = new OrbitView({ orbitAxis: 'Y', fovy: 50, near: 0.1, far: 2000 });

function truncateLabel(text) {
    return text.length > 26 ? text.slice(0, 24) + '…' : text;
}

export default function DeepField({ data, query, autoRotate, onHover, hoveredIndex }) {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
    const [size, setSize] = useState({ width: 1, height: 1 });
    const [growth, setGrowth] = useState(0);
    const [pulse, setPulse] = useState(0);
    const containerRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => setSize({ width: el.clientWidth || 1, height: el.clientHeight || 1 });
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    /* One continuous clock drives auto-rotation and the hover/query
       marker pulse — cheap, and keeps both in sync without separate
       timers stacking up. */
    useEffect(() => {
        const start = performance.now();
        const tick = (now) => {
            const t = (now - start) / 1000;
            setPulse(t);
            if (autoRotate) {
                setViewState((vs) => ({ ...vs, rotationOrbit: vs.rotationOrbit + 0.12 }));
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [autoRotate]);

    useEffect(() => {
        if (!data) return;
        let raf;
        let g = 0;
        const step = () => {
            g += (1 - g) * 0.12;
            setGrowth(g > 0.995 ? 1 : g);
            raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [data]);

    const pointRadius = data ? Math.max(2, Math.min(4.5, 220 / Math.sqrt(data.count))) * growth : 0;

    const layers = useMemo(() => {
        const list = [
            new LineLayer({
                id: 'grid',
                data: GRID_LINES,
                getSourcePosition: (d) => d.a,
                getTargetPosition: (d) => d.b,
                getColor: (d) => d.color,
                getWidth: (d) => d.width,
                widthUnits: 'pixels',
            }),
            new PointCloudLayer({
                id: 'dust',
                data: DUST_POINTS,
                getPosition: (d) => d,
                getColor: [111, 104, 93, 60],
                pointSize: 1.6,
                sizeUnits: 'pixels',
            }),
        ];

        if (data) {
            // Soft halo underneath the crisp points — cheap stand-in for
            // real bloom, gives the field a glow instead of flat dots.
            list.push(new PointCloudLayer({
                id: 'points-glow',
                data: data.raw,
                getPosition: (d) => [d.x, d.y, d.z],
                getColor: (d) => [d.color[0], d.color[1], d.color[2], 45 * growth],
                pointSize: pointRadius * 3.2,
                sizeUnits: 'pixels',
            }));
            list.push(new PointCloudLayer({
                id: 'points',
                data: data.raw,
                getPosition: (d) => [d.x, d.y, d.z],
                getColor: (d) => [d.color[0], d.color[1], d.color[2], d.color[3] * growth],
                pointSize: pointRadius,
                sizeUnits: 'pixels',
                pickable: true,
                onHover: (info) => {
                    if (info.index >= 0 && info.index != null) {
                        onHover?.({ index: info.index, x: info.x, y: info.y });
                    } else {
                        onHover?.(null);
                    }
                },
            }));
        }

        if (hoveredIndex != null && data?.raw[hoveredIndex]) {
            const p = data.raw[hoveredIndex];
            const s = 1 + Math.sin(pulse * 5) * 0.12;
            list.push(new ScatterplotLayer({
                id: 'hover-ring',
                data: [p],
                getPosition: (d) => [d.x, d.y, d.z],
                stroked: true,
                filled: true,
                getFillColor: [243, 238, 227, 22],
                getLineColor: [34, 211, 164, 220],
                lineWidthUnits: 'pixels',
                getLineWidth: 1.6,
                radiusUnits: 'pixels',
                getRadius: 15 * s,
            }));
        }

        if (query) {
            const s = 1 + Math.sin(pulse * 4) * 0.16;
            list.push(new ScatterplotLayer({
                id: 'query-glow',
                data: [query],
                getPosition: (d) => [d.x, d.y, d.z],
                getFillColor: [34, 211, 164, 60],
                radiusUnits: 'pixels',
                getRadius: 26 * s,
            }));
            list.push(new ScatterplotLayer({
                id: 'query-point',
                data: [query],
                getPosition: (d) => [d.x, d.y, d.z],
                stroked: true,
                getFillColor: [34, 211, 164, 255],
                getLineColor: [8, 7, 10, 255],
                lineWidthUnits: 'pixels',
                getLineWidth: 2,
                radiusUnits: 'pixels',
                getRadius: 8 * s,
            }));
        }

        return list;
    }, [data, query, hoveredIndex, pulse, growth, pointRadius, onHover]);

    const queryLabelPos = useMemo(() => {
        if (!query || size.width <= 1) return null;
        const viewport = view.makeViewport({ width: size.width, height: size.height, viewState });
        const [sx, sy] = viewport.project([query.x, query.y, query.z]);
        return { x: sx, y: sy };
    }, [query, size, viewState]);

    return (
        <div ref={containerRef} className="deep-field-canvas">
            <DeckGL
                views={view}
                viewState={viewState}
                onViewStateChange={({ viewState: vs }) => setViewState(vs)}
                controller={{ dragRotate: true, scrollZoom: true, inertia: 300 }}
                layers={layers}
                getCursor={({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
            />
            {queryLabelPos && (
                <div
                    className="query-flag"
                    style={{ position: 'absolute', left: queryLabelPos.x, top: queryLabelPos.y - 30, transform: 'translateX(-50%)', pointerEvents: 'none' }}
                >
                    ▸ {truncateLabel(query.text)}
                </div>
            )}
        </div>
    );
}
