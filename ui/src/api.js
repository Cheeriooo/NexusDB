const BASE = '/api';

async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

export const api = {
    // Health
    health: () => request('/health'),

    // Collections
    listCollections: () => request('/collections'),
    getCollection: (name) => request(`/collections/${name}`),
    createCollection: (data) =>
        request('/collections', { method: 'POST', body: JSON.stringify(data) }),
    deleteCollection: (name) =>
        request(`/collections/${name}`, { method: 'DELETE' }),

    // Vectors
    upsertVectors: (data) =>
        request('/vectors/upsert', { method: 'POST', body: JSON.stringify(data) }),
    searchVectors: (data) =>
        request('/vectors/search', { method: 'POST', body: JSON.stringify(data) }),
    getVector: (collection, id) =>
        request(`/vectors/${collection}/${id}`),
    deleteVector: (collection, id) =>
        request(`/vectors/${collection}/${id}`, { method: 'DELETE' }),

    // Embedding
    embedTexts: (texts, model = 'all-MiniLM-L6-v2') =>
        request('/embed', { method: 'POST', body: JSON.stringify({ texts, model }) }),
    embedUpsert: (data) =>
        request('/vectors/embed-upsert', { method: 'POST', body: JSON.stringify(data) }),

    // Visualization (PCA)
    visualizeCollection: (name, k = 500) =>
        request(`/collections/${name}/visualize`, { method: 'POST', body: JSON.stringify({ k }) }),
};
