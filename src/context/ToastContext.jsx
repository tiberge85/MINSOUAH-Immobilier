import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Icon from '../components/Icon';

const ToastContext = createContext(null);

// Fonds assez foncés pour un texte blanc lisible (≥ 4.5:1).
const ICONS = {
  success: { name: 'check_circle', cls: 'bg-green-700' },
  error:   { name: 'error',        cls: 'bg-error' },
  warning: { name: 'warning',      cls: 'bg-amber-700' },
  info:    { name: 'info',         cls: 'bg-tertiary' },
};

// ── Ponts globaux (utilisables hors composant React) ─────────────────────────
let toastBridge = null;
let confirmBridge = null;

/** Notification non bloquante depuis n'importe où (lib, gestionnaire d'événement…). */
export function notify(message, type = 'info', duration) {
  if (toastBridge) return toastBridge(message, type, duration);
  console.warn('[notify]', message);
  return null;
}

/**
 * Boîte de confirmation de l'application (remplace window.confirm).
 * @returns {Promise<boolean>}
 *   await confirmDialog('Supprimer ce prestataire ?', { danger: true, confirmLabel: 'Supprimer' })
 */
export function confirmDialog(message, options = {}) {
  if (confirmBridge) return confirmBridge(message, options);
  return Promise.resolve(window.confirm(message)); // filet de sécurité
}

const ERROR_RE = /erreur|échec|impossible|invalide|introuvable/i;
const WARN_RE = /manquant|veuillez|ajoutez|autorisez|sélectionnez|obligatoire|trop volumineux|existe déjà/i;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const counter = useRef(0);

  const dismiss = useCallback((id) => setToasts(ts => ts.filter(t => t.id !== id)), []);

  // duration = 0 → reste affiché jusqu'à fermeture manuelle.
  const toast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++counter.current;
    setToasts(ts => [...ts, { id, message: String(message ?? ''), type }]);
    if (duration > 0) setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), duration);
    return id;
  }, []);

  const askConfirm = useCallback((message, options = {}) => new Promise((resolve) => {
    setConfirmState({ message: String(message ?? ''), options, resolve });
  }), []);

  const closeConfirm = (result) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  useEffect(() => {
    toastBridge = (message, type = 'info', duration) => {
      const text = String(message ?? '');
      // Un message long ou sur plusieurs lignes (identifiants, consignes) reste
      // affiché jusqu'à ce qu'on le ferme.
      const d = duration ?? ((text.length > 120 || text.includes('\n')) ? 0 : Math.min(9000, 3500 + text.length * 40));
      return toast(text, type, d);
    };
    confirmBridge = askConfirm;

    // Les anciens alert() deviennent des notifications de l'application
    // (non bloquantes, cohérentes avec le reste de l'interface).
    const nativeAlert = window.alert;
    window.alert = (message) => {
      const text = String(message ?? '');
      const type = ERROR_RE.test(text) ? 'error' : WARN_RE.test(text) ? 'warning' : 'info';
      toastBridge(text, type);
    };
    return () => { toastBridge = null; confirmBridge = null; window.alert = nativeAlert; };
  }, [toast, askConfirm]);

  return (
    <ToastContext.Provider value={{ toast, confirm: askConfirm }}>
      {children}

      {/* Notifications */}
      <div className="fixed bottom-24 md:bottom-6 right-4 left-4 sm:left-auto z-[100] flex flex-col items-end gap-2 pointer-events-none" role="status" aria-live="polite">
        {toasts.map(t => {
          const icon = ICONS[t.type] || ICONS.info;
          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : undefined}
              className={`animate-slide-up pointer-events-auto ${icon.cls} rounded-xl px-3 py-2.5 flex items-start gap-3 text-white text-sm font-medium shadow-modal w-full sm:w-auto sm:max-w-sm`}
            >
              <Icon name={icon.name} size={18} filled className="mt-0.5 flex-shrink-0" />
              <span className="flex-1 whitespace-pre-line break-words">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fermer la notification"
                className="-mr-1 -my-1 w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-white/15 transition-colors"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Boîte de confirmation */}
      {confirmState && (
        <ConfirmBox
          message={confirmState.message}
          options={confirmState.options}
          onCancel={() => closeConfirm(false)}
          onConfirm={() => closeConfirm(true)}
        />
      )}
    </ToastContext.Provider>
  );
}

function ConfirmBox({ message, options, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const danger = options.danger ?? /supprim|effacer|résili|annuler|retirer|irréversible|remplac/i.test(message);
  const [title, ...rest] = message.split('\n');
  const details = rest.join('\n').trim();

  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus(); // action sûre par défaut
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" data-no-a11y>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={details ? 'confirm-details' : undefined}
        className="relative w-full max-w-md bg-surface rounded-2xl shadow-modal p-6 flex flex-col gap-4"
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
            <Icon name={danger ? 'warning' : 'help'} size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-title" className="font-bold text-on-surface text-base break-words">{options.title || title}</h2>
            {(options.title ? message : details) && (
              <p id="confirm-details" className="mt-1.5 text-sm text-on-surface-variant whitespace-pre-line break-words">
                {options.title ? message : details}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl border border-outline-variant/40 text-on-surface font-semibold hover:bg-surface-container-high transition-colors"
          >
            {options.cancelLabel || 'Annuler'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[44px] px-4 rounded-xl font-bold transition-colors ${danger ? 'bg-error text-on-error hover:bg-error/90' : 'bg-primary text-on-primary hover:bg-primary/90'}`}
          >
            {options.confirmLabel || (danger ? 'Confirmer' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
};

export const useConfirm = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useConfirm must be used inside ToastProvider');
  return ctx.confirm;
};
