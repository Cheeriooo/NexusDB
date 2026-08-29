// Canned data for the standalone landing-page demo (/demo). Nothing here
// touches a real backend — every "response" is scripted so the demo works
// with no server running. See DemoConsole.jsx for the entry point.

function hashSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

// Deterministic pseudo-random values so the same id always renders the same
// "vector" — used only for display (e.g. the raw values preview), never math.
function fakeVector(seed, dim) {
    let s = hashSeed(seed);
    const next = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s / 0x7fffffff) * 2 - 1;
    };
    return Array.from({ length: dim }, () => +next().toFixed(4));
}

const NOW = Date.now();

export const DEMO_ITEMS = {
    'product-reviews': [
        { id: 'rev_001', title: 'Aurora Wireless Headphones', category: 'audio', rating: 4.6, tags: ['wireless', 'headphones', 'battery', 'audio', 'bluetooth'] },
        { id: 'rev_002', title: 'Ember Noise-Cancelling Earbuds', category: 'audio', rating: 4.2, tags: ['earbuds', 'noise-cancelling', 'battery', 'audio', 'commute'] },
        { id: 'rev_003', title: 'Solstice Mechanical Keyboard', category: 'accessories', rating: 4.8, tags: ['keyboard', 'mechanical', 'typing', 'rgb', 'accessories'] },
        { id: 'rev_004', title: 'Drift Ergonomic Mouse', category: 'accessories', rating: 4.1, tags: ['mouse', 'ergonomic', 'wireless', 'accessories', 'comfort'] },
        { id: 'rev_005', title: 'Basalt Laptop Stand', category: 'accessories', rating: 3.9, tags: ['stand', 'laptop', 'desk', 'ergonomic', 'accessories'] },
        { id: 'rev_006', title: 'Halo Smart Speaker', category: 'audio', rating: 3.4, tags: ['speaker', 'smart', 'voice', 'audio', 'customer service'] },
        { id: 'rev_007', title: 'Ridgeline Power Bank 20K', category: 'power', rating: 4.7, tags: ['battery', 'power bank', 'charging', 'portable', 'power'] },
        { id: 'rev_008', title: 'Quartz USB-C Fast Charger', category: 'power', rating: 4.3, tags: ['charger', 'fast charging', 'usb-c', 'power', 'battery'] },
        { id: 'rev_009', title: 'Meridian 4K Webcam', category: 'video', rating: 3.2, tags: ['webcam', 'video', '4k', 'streaming', 'customer service'] },
        { id: 'rev_010', title: 'Fenwick Desk Lamp', category: 'home', rating: 4.4, tags: ['lamp', 'desk', 'led', 'home', 'lighting'] },
        { id: 'rev_011', title: 'Cobalt Travel Backpack', category: 'gear', rating: 4.5, tags: ['backpack', 'travel', 'laptop', 'gear', 'durable'] },
        { id: 'rev_012', title: 'Onyx Bluetooth Tracker', category: 'accessories', rating: 2.9, tags: ['tracker', 'bluetooth', 'battery', 'lost item', 'customer service'] },
    ],
    'wiki-articles': [
        { id: 'art_001', title: 'Artificial Intelligence', category: 'technology', tags: ['ai', 'machine learning', 'computer science', 'technology', 'algorithms'] },
        { id: 'art_002', title: 'Neural Networks', category: 'technology', tags: ['ai', 'machine learning', 'neural networks', 'deep learning', 'technology'] },
        { id: 'art_003', title: 'The Italian Renaissance', category: 'history', tags: ['renaissance', 'art', 'history', 'florence', 'painting'] },
        { id: 'art_004', title: 'Baroque Painting', category: 'art', tags: ['art', 'painting', 'renaissance', 'history', 'europe'] },
        { id: 'art_005', title: 'Climate Change', category: 'science', tags: ['climate change', 'environment', 'science', 'global warming', 'earth'] },
        { id: 'art_006', title: 'Ocean Acidification', category: 'science', tags: ['climate change', 'ocean', 'environment', 'science', 'chemistry'] },
        { id: 'art_007', title: 'Quantum Computing', category: 'technology', tags: ['quantum', 'computer science', 'technology', 'physics', 'algorithms'] },
        { id: 'art_008', title: 'General Relativity', category: 'science', tags: ['physics', 'einstein', 'science', 'gravity', 'space'] },
        { id: 'art_009', title: 'The Silk Road', category: 'history', tags: ['history', 'trade', 'asia', 'ancient world', 'silk road'] },
        { id: 'art_010', title: 'Roman Empire', category: 'history', tags: ['history', 'rome', 'ancient world', 'empire', 'europe'] },
        { id: 'art_011', title: 'Jazz Music', category: 'art', tags: ['music', 'jazz', 'art', 'culture', 'improvisation'] },
        { id: 'art_012', title: 'Vector Databases', category: 'technology', tags: ['vector database', 'machine learning', 'embeddings', 'technology', 'search'] },
    ],
};

export const DEMO_COLLECTIONS_INIT = [
    { name: 'product-reviews', dimension: 384, metric: 'cosine', count: DEMO_ITEMS['product-reviews'].length, created_at: new Date(NOW - 6 * 86400000).toISOString() },
    { name: 'wiki-articles', dimension: 768, metric: 'cosine', count: DEMO_ITEMS['wiki-articles'].length, created_at: new Date(NOW - 2 * 86400000).toISOString() },
];

export function demoVectorsFor(collection) {
    const dim = DEMO_COLLECTIONS_INIT.find((c) => c.name === collection)?.dimension || 384;
    return DEMO_ITEMS[collection].map((it) => ({
        id: it.id,
        values: fakeVector(it.id, dim),
        metadata: { title: it.title, category: it.category, ...(it.rating != null ? { rating: it.rating } : {}) },
    }));
}

// Scripted "search" — scores canned items by tag overlap with the query.
// It's curated, not a real embedding model: results are meant to always
// look plausible for the suggested queries, and degrade gracefully otherwise.
export function demoSearch(collection, queryText, k = 5) {
    const items = DEMO_ITEMS[collection] || [];
    const words = queryText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const scored = items.map((it) => {
        const overlap = it.tags.filter((t) => words.some((w) => t.includes(w) || w.includes(t))).length;
        return { item: it, score: overlap };
    });
    scored.sort((a, b) => b.score - a.score);
    const hasSignal = scored[0]?.score > 0;
    const ranked = hasSignal ? scored : scored.slice().sort(() => hashSeed(queryText + scored.indexOf) % 2 - 0.5);

    return ranked.slice(0, k).map((s, i) => ({
        id: s.item.id,
        distance: +(0.04 + i * 0.055 + (hasSignal ? 0 : 0.12)).toFixed(6),
        metadata: { title: s.item.title, category: s.item.category, ...(s.item.rating != null ? { rating: s.item.rating } : {}) },
    }));
}

export const SUGGESTED_QUERIES = {
    'product-reviews': ['wireless headphones with good battery life', 'poor customer service experience', 'ergonomic desk accessories'],
    'wiki-articles': ['artificial intelligence and machine learning', 'renaissance art and history', 'climate change science'],
};

// Precomputed 3D layout for the visualizer — points cluster by category so
// the "Deep Field" view looks structured without running real PCA.
function clusterCenter(category) {
    const s = hashSeed(category);
    const angle = (s % 360) * (Math.PI / 180);
    const radius = 16 + (s % 7);
    return [Math.cos(angle) * radius, ((s >> 8) % 20) - 10, Math.sin(angle) * radius];
}

export function demoVizPoints(collection) {
    const items = DEMO_ITEMS[collection] || [];
    return items.map((it) => {
        const [cx, cy, cz] = clusterCenter(it.category);
        let s = hashSeed(it.id);
        const jitter = () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return ((s / 0x7fffffff) - 0.5) * 6;
        };
        return {
            id: it.id,
            metadata: { title: it.title, category: it.category, ...(it.rating != null ? { rating: it.rating } : {}) },
            x: cx + jitter(), y: cy + jitter(), z: cz + jitter(),
        };
    });
}

export function demoVizQueryPosition(collection, queryText) {
    const results = demoSearch(collection, queryText, 1);
    const points = demoVizPoints(collection);
    const hit = results[0] && points.find((p) => p.id === results[0].id);
    if (!hit) return null;
    return { x: hit.x + 2, y: hit.y + 2.5, z: hit.z + 2, text: queryText };
}
