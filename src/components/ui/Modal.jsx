import { useEffect, useId, useRef } from 'react';

/*
 * Fenêtre modale accessible :
 *  - annoncée comme dialogue (role="dialog", aria-modal, titre relié) ;
 *  - se ferme avec Échap, un clic sur le fond ou le bouton « Fermer » ;
 *  - le focus entre dans la fenêtre à l'ouverture, y reste (Tab / Maj+Tab),
 *    puis revient sur l'élément qui l'a ouverte à la fermeture.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = 'hidden';

    // Focus initial : premier élément interactif du corps, sinon la fenêtre.
    const panel = panelRef.current;
    const body = panel?.querySelector('.modal-body');
    const firstField = body?.querySelector(FOCUSABLE);
    (firstField || panel)?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative w-full ${sizes[size]} bg-surface-container-lowest rounded-2xl shadow-modal flex flex-col max-h-[90vh] outline-none`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-lg py-md border-b border-outline-variant/30">
          <h2 id={titleId} className="font-h2 text-h2 text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            className="w-11 h-11 -mr-2 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="modal-body overflow-y-auto flex-1 px-lg py-md custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-lg py-md border-t border-outline-variant/30 flex flex-wrap justify-end gap-sm">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
