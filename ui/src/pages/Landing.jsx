import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { api } from '../api';
import './Landing.css';

const PHOTO_CREDIT = { name: 'Dawid Zawiła', url: 'https://unsplash.com/photos/green-grass-fiels-9d33wIMMzoE' };

const FEATURES = [
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        ),
        eyebrow: 'Organize',
        title: 'Collections',
        desc: 'Group vectors by dimension and distance metric. Create, inspect, and delete collections from a single console.',
    },
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg>
        ),
        eyebrow: 'Query',
        title: 'Vector search',
        desc: 'Run k-nearest-neighbor search directly against raw vectors or text, embedded on the fly with your model of choice.',
    },
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 12a9 9 0 11-9-9c2.52 0 4.85.99 6.57 2.64" /><polyline points="21 3 21 9 15 9" /></svg>
        ),
        eyebrow: 'Trust',
        title: 'Durable persistence',
        desc: 'Writes are durable to disk with concurrency-safe access, plus a backup and restore CLI for moving data around.',
    },
];

const STEPS = [
    { label: 'Clone & configure', code: 'cp .env.example .env' },
    { label: 'Build & run', code: 'docker compose up --build' },
    { label: 'Open the console', code: 'open http://localhost:8080' },
];

const EASE = [0.16, 1, 0.3, 1];

const staggerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/* A card that tilts toward the cursor — the hero feature showcase. */
function TiltCard({ className, children }) {
    const ref = useRef(null);
    const rotateX = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });
    const rotateY = useSpring(useMotionValue(0), { stiffness: 220, damping: 20 });

    const onMouseMove = (e) => {
        const rect = ref.current.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        rotateY.set(px * 8);
        rotateX.set(py * -8);
    };
    const onMouseLeave = () => {
        rotateX.set(0);
        rotateY.set(0);
    };

    return (
        <motion.div
            ref={ref}
            className={className}
            variants={fadeUp}
            style={{ rotateX, rotateY, transformPerspective: 900 }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            whileHover={{ scale: 1.01 }}
        >
            {children}
        </motion.div>
    );
}

export default function Landing() {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    const [online, setOnline] = useState(null);
    const { scrollY } = useScroll();
    const heroOpacity = useTransform(scrollY, [0, 420], [1, 0.15]);
    const heroY = useTransform(scrollY, [0, 420], [0, 60]);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        // The console shell relies on a fixed, non-scrolling body; the
        // landing page is a normal tall page and needs real page scroll.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'auto';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, []);

    useEffect(() => {
        const check = () => api.health().then(() => setOnline(true)).catch(() => setOnline(false));
        check();
        const interval = setInterval(check, 8000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="landing">
            <motion.nav
                className={`landing-nav ${scrolled ? 'scrolled' : ''}`}
                initial={{ y: -24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
            >
                <div className="landing-nav-inner">
                    <a href="#top" className="landing-logo">
                        <svg viewBox="0 0 32 32" fill="none" className="landing-logo-mark">
                            <circle cx="16" cy="10" r="2.4" fill="var(--accent)" />
                            <circle cx="9" cy="21" r="2.4" fill="currentColor" />
                            <circle cx="23" cy="21" r="2.4" fill="currentColor" />
                            <line x1="16" y1="10" x2="9" y2="21" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
                            <line x1="16" y1="10" x2="23" y2="21" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
                            <line x1="9" y1="21" x2="23" y2="21" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
                        </svg>
                        <span>NexusDB</span>
                    </a>
                    <div className="landing-nav-links">
                        <a href="#features">Features</a>
                        <a href="#quick-start">Quick Start</a>
                        <a href="#top">Docs</a>
                    </div>
                    <div className="landing-nav-actions">
                        <a href="#quick-start" className="btn-ghost-nav">Quick Start</a>
                        <motion.button
                            className="btn-filled-nav"
                            onClick={() => navigate('/app')}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                        >
                            Try it
                        </motion.button>
                    </div>
                </div>
            </motion.nav>

            <header id="top" className="landing-hero">
                <div className="hero-photo" aria-hidden="true" />
                <div className="hero-vignette" aria-hidden="true" />

                <motion.div
                    className="hero-content"
                    variants={staggerContainer}
                    initial="hidden"
                    animate="show"
                    style={{ opacity: heroOpacity, y: heroY }}
                >
                    <motion.span className="hero-eyebrow" variants={fadeUp}>Open source · self-hosted</motion.span>
                    <motion.h1 variants={fadeUp}>
                        The database built for the <span className="shimmer-text">shape</span> of your data.
                    </motion.h1>
                    <motion.p variants={fadeUp}>
                        NexusDB stores, searches, and lets you actually see your embeddings —
                        durable collections, k-NN search, and a 3D field to fly through your vector space.
                    </motion.p>
                    <motion.div className="hero-actions" variants={fadeUp}>
                        <motion.button
                            className="btn-filled-lg"
                            onClick={() => navigate('/app')}
                            whileHover={{ scale: 1.03, y: -1 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            Try it now
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </motion.button>
                        <motion.a
                            href="#quick-start"
                            className="btn-ghost-lg"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            Quick start
                        </motion.a>
                    </motion.div>
                </motion.div>

                <div className="hero-product-card">
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
                    >
                        <motion.div
                            className="mock-console"
                            animate={{ y: [0, -8, 0] }}
                            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
                        >
                            <div className="mock-sidebar">
                                <div className="mock-logo">
                                    <span className="mock-dot" />
                                    NexusDB
                                </div>
                                {['Dashboard', 'Collections', 'Vectors', 'Search', 'Deep Field'].map((label, i) => (
                                    <div key={label} className={`mock-nav-item ${i === 0 ? 'active' : ''}`}>{label}</div>
                                ))}
                            </div>
                            <div className="mock-main">
                                <div className="mock-metrics">
                                    <div className="mock-metric"><span className="mock-metric-value">12</span><span>Collections</span></div>
                                    <div className="mock-metric accent"><span className="mock-metric-value">48.2k</span><span>Vectors</span></div>
                                    <div className="mock-metric"><span className="mock-metric-value">Online</span><span>Server</span></div>
                                </div>
                                <div className="mock-panel">
                                    <div className="mock-panel-row" />
                                    <div className="mock-panel-row" />
                                    <div className="mock-panel-row short" />
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </header>

            <section id="features" className="landing-section">
                <div className="section-inner">
                    <motion.span
                        className="section-eyebrow"
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-80px' }}
                        transition={{ duration: 0.4, ease: EASE }}
                    >
                        Built for vector-native apps
                    </motion.span>
                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-80px' }}
                        transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
                    >
                        Everything you need to ship search that understands meaning.
                    </motion.h2>

                    <motion.div
                        className="bento-grid"
                        variants={staggerContainer}
                        initial="hidden"
                        whileInView="show"
                        viewport={{ once: true, margin: '-80px' }}
                    >
                        <TiltCard className="bento-hero-card">
                            <div className="bento-hero-art">
                                <div className="bento-hero-glyph">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                                </div>
                            </div>
                            <div className="bento-hero-copy">
                                <span className="feature-eyebrow">Explore</span>
                                <h3>Deep Field visualizer</h3>
                                <p>Project a collection into 3D with PCA and fly through the embedding space to see how your data actually clusters.</p>
                            </div>
                        </TiltCard>

                        <div className="bento-row">
                            {FEATURES.map((f) => (
                                <motion.div
                                    key={f.title}
                                    className="feature-card"
                                    variants={fadeUp}
                                    whileHover={{ y: -4, boxShadow: 'var(--shadow-glow)' }}
                                >
                                    <div className="feature-icon">{f.icon}</div>
                                    <span className="feature-eyebrow">{f.eyebrow}</span>
                                    <h3>{f.title}</h3>
                                    <p>{f.desc}</p>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            <section id="quick-start" className="landing-section alt">
                <div className="section-inner quick-start-grid">
                    <div>
                        <motion.span
                            className="section-eyebrow"
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-80px' }}
                            transition={{ duration: 0.4, ease: EASE }}
                        >
                            Get running
                        </motion.span>
                        <motion.h2
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-80px' }}
                            transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
                        >
                            Up in three commands.
                        </motion.h2>
                        <p className="quick-start-lede">
                            The console runs on :8080, the API on :8000. Everything else — persistence,
                            embeddings, the visualizer — is wired up by default.
                        </p>
                        <motion.ol
                            className="quick-start-steps"
                            variants={staggerContainer}
                            initial="hidden"
                            whileInView="show"
                            viewport={{ once: true, margin: '-80px' }}
                        >
                            {STEPS.map((s) => (
                                <motion.li key={s.label} variants={fadeUp}>
                                    <span className="step-label">{s.label}</span>
                                </motion.li>
                            ))}
                        </motion.ol>
                    </div>
                    <motion.div
                        className="quick-start-code"
                        initial={{ opacity: 0, x: 24 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: '-80px' }}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
                    >
                        {STEPS.map((s, i) => (
                            <motion.div
                                key={s.code}
                                className="code-line"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                viewport={{ once: true, margin: '-80px' }}
                                transition={{ duration: 0.3, delay: 0.2 + i * 0.15 }}
                            >
                                <span className="code-prompt">$</span>
                                <code>{s.code}</code>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>
            </section>

            <motion.section
                className="landing-cta"
                initial={{ opacity: 0, scale: 0.98 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, ease: EASE }}
            >
                <div className="section-inner cta-inner">
                    <h2>See your data as a space, not a table.</h2>
                    <motion.button
                        className="btn-filled-lg"
                        onClick={() => navigate('/app')}
                        whileHover={{ scale: 1.03, y: -1 }}
                        whileTap={{ scale: 0.97 }}
                    >
                        Try it now
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                    </motion.button>
                </div>
            </motion.section>

            <footer className="landing-footer">
                <div className="section-inner footer-inner">
                    <span className="landing-logo">
                        <svg viewBox="0 0 32 32" fill="none" className="landing-logo-mark">
                            <circle cx="16" cy="10" r="2.4" fill="var(--accent)" />
                            <circle cx="9" cy="21" r="2.4" fill="currentColor" />
                            <circle cx="23" cy="21" r="2.4" fill="currentColor" />
                        </svg>
                        <span>NexusDB</span>
                    </span>
                    <div className="footer-right">
                        <span className={`footer-status ${online ? 'up' : ''}`}>
                            <span className="footer-status-dot" />
                            {online === null ? 'Checking API…' : online ? 'API online' : 'API offline'}
                        </span>
                        <span className="footer-sep">·</span>
                        <a className="footer-credit" href={PHOTO_CREDIT.url} target="_blank" rel="noreferrer">
                            Photo by {PHOTO_CREDIT.name}
                        </a>
                        <span className="footer-sep">·</span>
                        <span className="footer-meta">rev.0.1.0</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
