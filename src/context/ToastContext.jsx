import { createContext, useContext, useState, useCallback, useRef } from 'react';
import Icon from '../components/Icon';

const ToastContext = createContext(null);

const ICONS = {
  success: { name: 'check_circle',    cls: 'bg-green-600' },
  error:   { name: 'error',           cls: 'bg-error' },
  warning: { name: 'warning',         cls: 'bg-amber-500' },
  info:    { name: 'info',            cls: 'bg-tertiary' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const toast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++counter.current;
    setToasts(ts => [...ts, { id, message, type }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), duration);
    return id;
  }, []);

  const dismiss = useCallback((id) => setToasts(ts => ts.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-24 md:bottom-6 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const icon = ICONS[t.type] || ICONS.info;
          return (
            <div
              key={t.id}
              className="animate-slide-up pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-modal text-white text-sm font-medium max-w-sm"
              style={{ backgroundColor: icon.cls.replace('bg-', '') }}
            >
              <div className={`${icon.cls} rounded-xl px-3 py-2.5 flex items-center gap-3 text-white w-full`}>
                <Icon name={icon.name} size={18} filled />
                <span className="flex-1">{t.message}</span>
                <button onClick={() => dismiss(t.id)} className="hover:opacity-70 transition-opacity ml-1">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
};
