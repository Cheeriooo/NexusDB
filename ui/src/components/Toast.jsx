import { AnimatePresence, motion } from 'framer-motion';
import './Toast.css';

export default function Toast({ toasts }) {
    return (
        <div className="toast-container">
            <AnimatePresence>
                {toasts.map((t) => (
                    <motion.div
                        key={t.id}
                        className={`toast toast-${t.type}`}
                        layout
                        initial={{ opacity: 0, x: 24, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 24, scale: 0.95 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <span className="toast-glyph">
                            {t.type === 'success' && '✓'}
                            {t.type === 'error' && '✕'}
                            {t.type === 'info' && '◆'}
                        </span>
                        <span>{t.message}</span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
