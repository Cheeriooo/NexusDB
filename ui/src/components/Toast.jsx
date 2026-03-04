import './Toast.css';

export default function Toast({ toasts }) {
    return (
        <div className="toast-container">
            {toasts.map((t) => (
                <div key={t.id} className={`toast toast-${t.type}`}>
                    {t.type === 'success' && '✓'}
                    {t.type === 'error' && '✕'}
                    {t.type === 'info' && 'ℹ'}
                    <span>{t.message}</span>
                </div>
            ))}
        </div>
    );
}
