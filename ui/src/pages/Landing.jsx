import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { animate, createScope, onScroll, stagger } from 'animejs';
import AeroShards from '../components/AeroShards';
import './Landing.css';

const REPO_URL = 'https://github.com/Cheeriooo/NexusDB';
const THEME_KEY = 'nexusdb-landing-theme';

const SHARD_PALETTE = {
    dark: { backgroundColor: '#030405', shardColor: '#1f5d4d', accentColor: '#22d3a4' },
    light: { backgroundColor: '#f4f6f2', shardColor: '#a9cdbb', accentColor: '#0e9f7a' },
};

const FEATURES = [
    {
        icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
        ),
        eyebrow: 'Explore',
        title: 'Deep Field visualizer',
        desc: 'Project a collection into 3D with PCA and fly through the embedding space to see how your data actually clusters.',
    },
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

/* A single spine line that draws down a container as it scrolls into
   view — the throughline connecting a list of rows, without putting any
   of them in a box. scaleY on a 2px absolutely-positioned bar is enough;
   no SVG or canvas needed for a straight vertical line. */
function ScrollSpine({ targetRef, className, offset = ['start 0.8', 'end 0.55'] }) {
    const shouldReduceMotion = useReducedMotion();
    const { scrollYProgress } = useScroll({ target: targetRef, offset });
    const scaleY = useSpring(scrollYProgress, shouldReduceMotion
        ? { stiffness: 1000, damping: 100 }
        : { stiffness: 120, damping: 26, restDelta: 0.001 });
    return <motion.div className={className} style={{ scaleY }} />;
}

/* One row of the feature ledger: a number, an icon that pops in once
   scrolled into view, and copy — no card, no border, no background.
   Hierarchy comes from type scale and rhythm, not boxes. */
function FeatureRow({ index, eyebrow, title, desc, icon }) {
    const shouldReduceMotion = useReducedMotion();
    return (
        <motion.div
            className="feature-row"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.6, ease: EASE }}
        >
            <span className="feature-row-index">{String(index + 1).padStart(2, '0')}</span>
            <motion.div
                className="feature-row-icon"
                initial={{ opacity: 0, scale: 0.6, rotate: -12 }}
                whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={shouldReduceMotion ? { duration: 0.3 } : { type: 'spring', stiffness: 200, damping: 16, delay: 0.1 }}
                whileHover={{ scale: 1.08, rotate: -4 }}
            >
                {icon}
            </motion.div>
            <div className="feature-row-copy">
                <span className="feature-eyebrow">{eyebrow}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
            </div>
        </motion.div>
    );
}

/* One line of a terminal, typed out character by character once it
   becomes the active line, then handing off to the next. Loosely
   modelled on Magic UI's Terminal/TypingAnimation
   (magicui.design/docs/components/terminal), simplified to a fixed
   list of lines: each line owns its own interval and only reports
   "done" once, via a functional state update guarded on its own index
   — so there's no shared mutable typing-position state for two lines
   to race over. */
function TerminalLine({ index, text, active, done, instant, onDone }) {
    const [displayed, setDisplayed] = useState(instant ? text : '');

    useEffect(() => {
        if (instant) {
            onDone(index);
            return;
        }
        if (!active) return;
        let i = 0;
        const id = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) {
                clearInterval(id);
                onDone(index);
            }
        }, 30);
        return () => clearInterval(id);
        // onDone is stable in behaviour (same index) across renders even
        // though its identity isn't memoised — re-running this on every
        // parent render would restart the interval mid-type.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, instant, index, text]);

    const shown = instant || done ? text : displayed;
    const showCursor = !instant && active && shown.length < text.length;

    return (
        <div className="code-line">
            <span className="code-prompt">❯</span>
            <code>{shown}</code>
            {showCursor && <span className="terminal-cursor" />}
        </div>
    );
}

/* A real terminal window instead of a static code block: commands type
   themselves out once scrolled into view, one line after another, with
   a blinking cursor — the "up in three commands" claim demonstrated
   rather than just printed. */
function TerminalBlock({ steps }) {
    const shouldReduceMotion = useReducedMotion();
    const containerRef = useRef(null);
    // Reduced motion is known synchronously at mount, so it's folded into
    // this lazy initializer rather than set from inside an effect.
    const [inView, setInView] = useState(() => !!shouldReduceMotion);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        if (shouldReduceMotion || inView) return;
        const el = containerRef.current;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setInView(true);
                observer.disconnect();
            }
        }, { threshold: 0.3 });
        observer.observe(el);
        return () => observer.disconnect();
    }, [shouldReduceMotion, inView]);

    const handleDone = (index) => {
        setActiveIndex((current) => (current === index ? index + 1 : current));
    };

    return (
        <div className="terminal" ref={containerRef}>
            <div className="terminal-chrome">
                <span className="terminal-dot terminal-dot-red" />
                <span className="terminal-dot terminal-dot-yellow" />
                <span className="terminal-dot terminal-dot-green" />
                <span className="terminal-title">nexusdb — zsh</span>
            </div>
            <div className="terminal-body">
                {steps.map((s, i) => (
                    <TerminalLine
                        key={s.code}
                        index={i}
                        text={s.code}
                        active={inView && activeIndex === i}
                        done={activeIndex > i}
                        instant={shouldReduceMotion}
                        onDone={handleDone}
                    />
                ))}
            </div>
        </div>
    );
}

export default function Landing() {
    const navigate = useNavigate();
    const shouldReduceMotion = useReducedMotion();
    const [scrolled, setScrolled] = useState(false);
    const [theme, setTheme] = useState(() => {
        try {
            return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
        } catch {
            return 'dark';
        }
    });

    const toggleTheme = () => {
        setTheme((current) => {
            const next = current === 'dark' ? 'light' : 'dark';
            try {
                localStorage.setItem(THEME_KEY, next);
            } catch {
                // localStorage unavailable (private browsing, etc.) — theme
                // just won't persist across visits.
            }
            return next;
        });
    };

    // The favicon is shared, static markup in index.html — everywhere else
    // in the app it stays the brand default (dark), but while the landing
    // page is mounted it tracks whatever theme the visitor picked here, and
    // reverts on unmount so navigating into the (always-dark) console or
    // demo doesn't leave the light tile behind in the tab.
    useEffect(() => {
        const svgLink = document.getElementById('favicon-svg');
        const pngLink = document.getElementById('favicon-png');
        const suffix = theme === 'light' ? '-light' : '';
        if (svgLink) svgLink.href = `/favicon${suffix}.svg`;
        if (pngLink) pngLink.href = `/favicon${suffix}.png`;
        return () => {
            if (svgLink) svgLink.href = '/favicon.svg';
            if (pngLink) pngLink.href = '/favicon.png';
        };
    }, [theme]);
    const { scrollY } = useScroll();
    const heroOpacity = useTransform(scrollY, [0, 420], [1, 0.15]);
    const heroY = useTransform(scrollY, [0, 420], [0, 60]);

    const bottomRef = useRef(null);
    const featuresRef = useRef(null);
    const featureLedgerRef = useRef(null);
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
       so it's cleanly torn down (scope.revert()) on unmount. Skipped
       entirely under reduced motion: anime.js sets each target's opacity
       to 0 inline as soon as the animation is created (before its
       onScroll trigger ever fires), and an inline style always beats the
       stylesheet's reduced-motion override — that CSS escape hatch can
       never win against anime.js's own inline value, so the only real
       fix is to not create these animations at all in that case. */
    useEffect(() => {
        if (shouldReduceMotion) return;
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
            // The feature rows below reveal themselves via Motion's
            // whileInView (see FeatureRow) rather than this anime.js
            // scope, since each row's icon pop and copy fade need
            // per-row viewport tracking that this shared reveal doesn't do.

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
    }, [shouldReduceMotion]);

    return (
        <div className="landing" data-theme={theme}>
            <motion.nav
                className={`landing-nav ${scrolled ? 'scrolled' : ''}`}
                initial={{ y: -24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
            >
                <div className="landing-nav-inner">
                    <a href="#top" className="landing-logo">
                        <svg viewBox="0 0 32 32" fill="none" className="landing-logo-mark">
                            <line x1="16" y1="16" x2="16" y2="5" stroke="var(--accent)" strokeWidth="1.1" strokeLinecap="round" />
                            <line x1="16" y1="16" x2="26.45" y2="12.6" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" opacity="0.35" />
                            <line x1="16" y1="16" x2="22.45" y2="24.9" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" opacity="0.35" />
                            <line x1="16" y1="16" x2="9.55" y2="24.9" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" opacity="0.35" />
                            <line x1="16" y1="16" x2="5.55" y2="12.6" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" opacity="0.35" />
                            <circle cx="26.45" cy="12.6" r="1.7" fill="currentColor" opacity="0.85" />
                            <circle cx="22.45" cy="24.9" r="1.7" fill="currentColor" opacity="0.85" />
                            <circle cx="9.55" cy="24.9" r="1.7" fill="currentColor" opacity="0.85" />
                            <circle cx="5.55" cy="12.6" r="1.7" fill="currentColor" opacity="0.85" />
                            <circle cx="16" cy="5" r="2.1" fill="var(--accent)" />
                            <circle cx="16" cy="16" r="2.8" fill="var(--accent)" />
                        </svg>
                        <span><span className="brand-nexus">Nexus</span><span className="brand-db">DB</span></span>
                    </a>
                    <div className="landing-nav-links">
                        <a href="#features">Features</a>
                        <a href="#quick-start">Quick Start</a>
                        <a href={`${REPO_URL}/tree/main/docs`} target="_blank" rel="noreferrer">Docs</a>
                    </div>
                    <div className="landing-nav-actions">
                        <motion.button
                            type="button"
                            className="theme-toggle"
                            onClick={toggleTheme}
                            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                            aria-pressed={theme === 'light'}
                            whileHover={{ scale: 1.06 }}
                            whileTap={{ scale: 0.94 }}
                        >
                            {theme === 'dark' ? (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4.5" /><line x1="12" y1="2" x2="12" y2="4.5" /><line x1="12" y1="19.5" x2="12" y2="22" /><line x1="4.2" y1="4.2" x2="6" y2="6" /><line x1="18" y1="18" x2="19.8" y2="19.8" /><line x1="2" y1="12" x2="4.5" y2="12" /><line x1="19.5" y1="12" x2="22" y2="12" /><line x1="4.2" y1="19.8" x2="6" y2="18" /><line x1="18" y1="6" x2="19.8" y2="4.2" /></svg>
                            ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
                            )}
                        </motion.button>
                        <motion.button
                            className="btn-ghost-nav"
                            onClick={() => navigate('/demo')}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                        >
                            Browser Demo
                        </motion.button>
                        <motion.button
                            className="btn-filled-nav"
                            onClick={() => navigate('/app')}
                            whileHover={{ scale: 1.04 }}
                            whileTap={{ scale: 0.96 }}
                        >
                            Open Console
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
                            Launch Console
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                        </motion.button>
                        <motion.button
                            className="btn-ghost-lg"
                            onClick={() => navigate('/demo')}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                        >
                            Browser Demo
                        </motion.button>
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

                        <div className="feature-ledger" ref={featureLedgerRef}>
                            <ScrollSpine targetRef={featureLedgerRef} className="feature-ledger-spine" />
                            {FEATURES.map((f, i) => (
                                <FeatureRow key={f.title} index={i} eyebrow={f.eyebrow} title={f.title} desc={f.desc} icon={f.icon} />
                            ))}
                        </div>
                    </div>
                </section>

                <div className="bottom-field">
                    <div className="bottom-field-shards" aria-hidden="true">
                        <AeroShards
                            backgroundColor={SHARD_PALETTE[theme].backgroundColor}
                            shardColor={SHARD_PALETTE[theme].shardColor}
                            accentColor={SHARD_PALETTE[theme].accentColor}
                            placement="full"
                            flow="stream"
                            material="pearl"
                            detail="balanced"
                            effect="none"
                            scale={1}
                            spread={1}
                            depth={1}
                            speed={0.7}
                            spin={1}
                            interaction="none"
                            density={1.1}
                            shardSize={0.9}
                            stretch={1}
                            turbulence={0.8}
                            glow={0.9}
                            edgeSoftness={2}
                            bloom={0.4}
                            grain={0.05}
                            chromaticAberration={0.005}
                            transitionDuration={1.4}
                            interactionRadius={1.5}
                            interactionStrength={0.4}
                            rippleIntensity={0.8}
                            holdToGather={false}
                            paused={shouldReduceMotion}
                        />
                    </div>

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
                            <TerminalBlock steps={STEPS} />
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
                                    <line x1="16" y1="16" x2="16" y2="5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" />
                                    <line x1="16" y1="16" x2="25.53" y2="21.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
                                    <line x1="16" y1="16" x2="6.47" y2="21.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
                                    <circle cx="25.53" cy="21.5" r="2.2" fill="currentColor" opacity="0.85" />
                                    <circle cx="6.47" cy="21.5" r="2.2" fill="currentColor" opacity="0.85" />
                                    <circle cx="16" cy="5" r="2.4" fill="var(--accent)" />
                                    <circle cx="16" cy="16" r="3" fill="var(--accent)" />
                                </svg>
                                <span><span className="brand-nexus">Nexus</span><span className="brand-db">DB</span></span>
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
        </div>
    );
}
