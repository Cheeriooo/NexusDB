import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'framer-motion';
import { animate, createScope, onScroll, stagger } from 'animejs';
import './Landing.css';

const REPO_URL = 'https://github.com/Cheeriooo/NexusDB';

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
    const { scrollY } = useScroll();
    const heroOpacity = useTransform(scrollY, [0, 420], [1, 0.15]);
    const heroY = useTransform(scrollY, [0, 420], [0, 60]);

    const bottomRef = useRef(null);
    const featuresRef = useRef(null);
    const quickStartRef = useRef(null);
    const ctaRef = useRef(null);
    const footerRef = useRef(null);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 24);
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
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

    /* Everything from "Built for vector-native apps" down is revealed
       with anime.js instead of framer-motion — scoped to landing-bottom
       so it's cleanly torn down (scope.revert()) on unmount. */
    useEffect(() => {
        const scope = createScope({ root: bottomRef }).add(() => {
            const reveal = (targets, opts = {}) => animate(targets, {
                opacity: [0, 1],
                translateY: [16, 0],
                duration: 600,
                ease: 'outQuad',
                ...opts,
            });

            reveal('#features .section-eyebrow, #features > .section-inner > h2', {
                delay: stagger(80),
                autoplay: onScroll({ target: featuresRef.current }),
            });
            animate('.bento-hero-card', {
                opacity: [0, 1],
                duration: 700,
                ease: 'outQuad',
                autoplay: onScroll({ target: featuresRef.current }),
            });
            reveal('.feature-card', {
                delay: stagger(110, { start: 150 }),
                autoplay: onScroll({ target: featuresRef.current }),
            });

            reveal('#quick-start .section-eyebrow, #quick-start h2, .quick-start-lede', {
                delay: stagger(80),
                autoplay: onScroll({ target: quickStartRef.current }),
            });
            animate('.quick-start-steps li', {
                opacity: [0, 1],
                translateX: [-18, 0],
                duration: 500,
                delay: stagger(120, { start: 200 }),
                ease: 'outQuad',
                autoplay: onScroll({ target: quickStartRef.current }),
            });
            animate('.code-line', {
                opacity: [0, 1],
                translateX: [18, 0],
                duration: 450,
                delay: stagger(150, { start: 250 }),
                ease: 'outQuad',
                autoplay: onScroll({ target: quickStartRef.current }),
            });

            animate('.landing-cta', {
                opacity: [0, 1],
                scale: [0.98, 1],
                duration: 650,
                ease: 'outQuad',
                autoplay: onScroll({ target: ctaRef.current }),
            });

            animate('.landing-footer .landing-logo, .landing-footer .footer-right', {
                opacity: [0, 1],
                translateY: [10, 0],
                duration: 500,
                delay: stagger(100),
                ease: 'outQuad',
                autoplay: onScroll({ target: footerRef.current }),
            });
        });

        return () => scope.revert();
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
                            onClick={() => navigate('/demo')}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                        >
                            Try the demo
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
                            onClick={() => navigate('/demo')}
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
                    <motion.p className="hero-actions-hint" variants={fadeUp}>
                        The demo runs entirely in your browser with sample data — no signup, no server to run.
                    </motion.p>
                </motion.div>

                <div className="hero-product-card">
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
                    >
                        {/* The float here is a plain CSS animation (see .mock-console
                            in Landing.css) rather than a framer-motion loop — it runs
                            on the compositor only and stays smooth regardless of what
                            else framer or anime.js are doing elsewhere on the page. */}
                        <div className="mock-console">
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
                        </div>
                    </motion.div>
                </div>
            </header>

            <div className="landing-bottom" ref={bottomRef}>
                <section id="features" className="landing-section" ref={featuresRef}>
                    <div className="section-inner">
                        <span className="section-eyebrow">Built for vector-native apps</span>
                        <h2>Everything you need to ship search that understands meaning.</h2>

                        <div className="bento-grid">
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
                                    <div key={f.title} className="feature-card">
                                        <div className="feature-icon">{f.icon}</div>
                                        <span className="feature-eyebrow">{f.eyebrow}</span>
                                        <h3>{f.title}</h3>
                                        <p>{f.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section id="quick-start" className="landing-section alt" ref={quickStartRef}>
                    <div className="section-inner quick-start-grid">
                        <div>
                            <span className="section-eyebrow">Get running</span>
                            <h2>Up in three commands.</h2>
                            <p className="quick-start-lede">
                                The console runs on :8080, the API on :8000. Everything else — persistence,
                                embeddings, the visualizer — is wired up by default.
                            </p>
                            <ol className="quick-start-steps">
                                {STEPS.map((s) => (
                                    <li key={s.label}>
                                        <span className="step-label">{s.label}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                        <div className="quick-start-code">
                            {STEPS.map((s) => (
                                <div key={s.code} className="code-line">
                                    <span className="code-prompt">$</span>
                                    <code>{s.code}</code>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="landing-cta" ref={ctaRef}>
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
                </section>

                <footer className="landing-footer" ref={footerRef}>
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
                            <a className="footer-status up" href={REPO_URL} target="_blank" rel="noreferrer">
                                <span className="footer-status-dot" />
                                Self-hosted · open source
                            </a>
                            <span className="footer-sep">·</span>
                            <span className="footer-meta">rev.0.1.0</span>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
}
