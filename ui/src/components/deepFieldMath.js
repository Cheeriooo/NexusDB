/* Pure helpers shared by DeepField.jsx and its two callers
   (pages/Visualizer.jsx, demo/pages/DemoVisualizer.jsx) — split out of
   the component file so react-refresh/only-export-components doesn't
   flag mixed component + non-component exports. */

export const SCALE = 32;

const NEAR = [111, 104, 93]; // #6f685d
const MID = [243, 238, 227]; // #f3eee3
const FAR = [34, 211, 164]; // #22d3a4
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* ---- Build render-ready point data from raw [{id, metadata, x, y, z}] ---- */
export function buildPointData(points) {
    const n = points.length;
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    points.forEach((p) => {
        const v = [p.x, p.y, p.z];
        for (let d = 0; d < 3; d++) {
            if (v[d] < mins[d]) mins[d] = v[d];
            if (v[d] > maxs[d]) maxs[d] = v[d];
        }
    });
    const ranges = mins.map((m, i) => maxs[i] - m || 1);
    const sc = (val, d) => ((val - mins[d]) / ranges[d]) * SCALE * 2 - SCALE;

    const raw = new Array(n);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) {
        const p = points[i];
        const x = sc(p.x, 0), y = sc(p.y, 1), z = sc(p.z, 2);
        raw[i] = { id: p.id, metadata: p.metadata, x, y, z };
        cx += x; cy += y; cz += z;
    }
    cx /= n; cy /= n; cz /= n;

    let maxDist = 0;
    const dists = new Array(n);
    for (let i = 0; i < n; i++) {
        const dx = raw[i].x - cx, dy = raw[i].y - cy, dz = raw[i].z - cz;
        dists[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dists[i] > maxDist) maxDist = dists[i];
    }
    const dr = maxDist || 1;
    for (let i = 0; i < n; i++) {
        const t = dists[i] / dr;
        const rgb = t < 0.5 ? lerp3(NEAR, MID, t / 0.5) : lerp3(MID, FAR, (t - 0.5) / 0.5);
        raw[i].color = [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), 235];
    }

    return { raw, count: n, pca: { mins, ranges } };
}
