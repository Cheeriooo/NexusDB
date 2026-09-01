export const TOUR_SEEN_KEY = 'nexusdb_demo_tour_seen';

export const TOUR_STEPS = [
    {
        view: 'dashboard',
        target: '.metrics-grid',
        placement: 'bottom',
        title: 'Welcome to the NexusDB console',
        body: "This is a fully interactive demo — sample data, real UI, no backend required. We'll walk through the core workflow in four steps: create a collection, insert vectors, search, then visualize.",
    },
    {
        view: 'dashboard',
        target: '[data-tour="action-new-collection"]',
        placement: 'right',
        title: 'Step 1 · Create a collection',
        body: 'Everything starts with a collection — a named space for vectors with a fixed dimension and a distance metric. Hit Next and we’ll jump to the Collections page.',
    },
    {
        view: 'collections',
        target: '[data-tour="new-collection-btn"]',
        placement: 'left',
        title: 'Define your collection',
        body: 'Click "New Collection" to set a name, pick a dimension that matches your embedding model (384 for MiniLM, 1536 for OpenAI ada-002), and choose a similarity metric — cosine is the safe default.',
    },
    {
        view: 'collections',
        target: '.collections-grid',
        placement: 'top',
        title: 'Your collections at a glance',
        body: 'Each card shows dimension, metric, and vector count. Two sample collections ship pre-loaded so you can try search right away.',
    },
    {
        view: 'vectors',
        target: '.mode-tabs',
        placement: 'bottom',
        title: 'Step 2 · Insert vectors',
        body: 'Two ways in: paste raw JSON vectors you’ve already embedded, or switch to "Text Embed" and type plain sentences — NexusDB embeds them for you before storing.',
    },
    {
        view: 'vectors',
        target: '.form-actions',
        placement: 'top',
        title: 'Try it yourself',
        body: 'Pick a collection above, click "Generate Sample" to see the expected shape, then "Upsert Vectors" to insert them.',
    },
    {
        view: 'search',
        target: '.search-form-card',
        placement: 'right',
        title: 'Step 3 · Search',
        body: 'Pick a collection and type a natural-language query — or click one of the suggested prompts below the search box — to find its nearest neighbors.',
    },
    {
        view: 'search',
        target: '.search-results-card',
        placement: 'left',
        title: 'Read the results',
        body: 'Matches are ranked by vector distance — lower is more similar. The bar shows how close each result is relative to the rest of the set.',
    },
    {
        view: 'visualizer',
        target: '.query-panel',
        placement: 'left',
        title: 'Step 4 · Visualize',
        body: 'Deep Field projects every vector into 3D space with PCA. Click a suggested prompt to see exactly where that query lands relative to your data — drag to orbit, scroll to zoom.',
    },
    {
        view: 'visualizer',
        target: null,
        placement: 'center',
        title: "That's the full workflow",
        body: 'Create → insert → search → visualize. Explore freely from here, or self-host the real thing to point it at your own embeddings.',
    },
];
