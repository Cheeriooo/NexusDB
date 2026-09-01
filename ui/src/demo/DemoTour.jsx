import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TOUR_STEPS, TOUR_SEEN_KEY } from './tourSteps';
import './DemoTour.css';

const TOOLTIP_W = 336;
const MARGIN = 16;

function computeTooltipPos(rect, placement) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(TOOLTIP_W, vw - MARGIN * 2);
    if (!rect) return { left: null, top: null };

    let top;
    let left;
    switch (placement) {
        case 'right':
            left = rect.left + rect.width + 18;
            top = rect.top;
            break;
        case 'left':
            left = rect.left - w - 18;
            top = rect.top;
            break;
        case 'top':
            left = rect.left;
            top = rect.top - 18;
            break;
        case 'bottom':
        default:
            left = rect.left;
            top = rect.top + rect.height + 18;
            break;
    }
    if (placement === 'top') {
        top = Math.min(Math.max(top, MARGIN + 160), vh - MARGIN);
    } else {
        top = Math.min(Math.max(top, MARGIN), vh - MARGIN - 40);
    }
    left = Math.min(Math.max(left, MARGIN), vw - w - MARGIN);
    return { top, left, width: w, anchorAbove: placement === 'top' };
}

export default function DemoTour({ active, activeView, switchView, onFinish }) {
    const [stepIndex, setStepIndex] = useState(0);
    const [rect, setRect] = useState(null);
    const rafRef = useRef(null);

    const step = TOUR_STEPS[stepIndex];

    useEffect(() => {
        if (!active) return;
        if (step.view && step.view !== activeView) switchView(step.view);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIndex, active]);

    useEffect(() => {
        if (!active || !step.target) return undefined;
        let cancelled = false;
        let tries = 0;
        const measure = () => {
            if (cancelled) return;
            const el = document.querySelector(step.target);
            if (el) {
                const r = el.getBoundingClientRect();
                setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
            }
            tries += 1;
            if (tries < 36) rafRef.current = requestAnimationFrame(measure);
        };
        measure();
        const onResize = () => {
            const el = document.querySelector(step.target);
            if (el) {
                const r = el.getBoundingClientRect();
                setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
            }
        };
        window.addEventListener('resize', onResize);
        return () => {
            cancelled = true;
            cancelAnimationFrame(rafRef.current);
            window.removeEventListener('resize', onResize);
        };
    }, [stepIndex, active, activeView, step.target]);

    if (!active) return null;

    const isFirst = stepIndex === 0;
    const isLast = stepIndex === TOUR_STEPS.length - 1;

    const finish = () => {
        try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
        onFinish();
    };

    const showSpotlight = Boolean(step.target && rect);
    const pos = showSpotlight ? computeTooltipPos(rect, step.placement) : null;
    const tooltipStyle = pos
        ? { top: pos.top, left: pos.left, width: pos.width, ...(pos.anchorAbove ? { transform: 'translateY(-100%)' } : {}) }
        : undefined;

    return (
        <div className="tour-layer">
            {showSpotlight && (
                <motion.div
                    className="tour-spotlight"
                    animate={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                />
            )}
            <AnimatePresence mode="wait">
                <motion.div
                    key={stepIndex}
                    className={`tour-tooltip ${!showSpotlight ? 'tour-tooltip-center' : ''}`}
                    style={tooltipStyle}
                    initial={{ opacity: 0, scale: 0.96, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="tour-progress">
                        {TOUR_STEPS.map((_, i) => (
                            <span key={i} className={`tour-dot ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`} />
                        ))}
                    </div>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                    <div className="tour-actions">
                        <button className="btn btn-ghost btn-sm" onClick={finish}>Skip tour</button>
                        <div className="tour-actions-nav">
                            {!isFirst && <button className="btn btn-ghost btn-sm" onClick={() => setStepIndex((i) => i - 1)}>Back</button>}
                            {!isLast ? (
                                <button className="btn btn-primary btn-sm" onClick={() => setStepIndex((i) => i + 1)}>Next</button>
                            ) : (
                                <button className="btn btn-primary btn-sm" onClick={finish}>Done</button>
                            )}
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
