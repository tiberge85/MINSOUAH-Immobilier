import { useEffect } from 'react';

/*
 * Accessibilité des fenêtres « faites main » (≈ 38 overlays `fixed inset-0`
 * répartis dans les pages), sans réécrire chaque écran :
 *
 *  • chaque overlay sombre (classe bg-black/…) est annoncé comme dialogue
 *    (role="dialog", aria-modal) ;
 *  • à son ouverture, le focus entre dans la fenêtre ; à sa fermeture, il
 *    revient sur l'élément qui l'a ouverte ;
 *  • Tab / Maj+Tab restent dans la fenêtre du dessus ;
 *  • Échap ferme la fenêtre du dessus : clic sur le fond si celui-ci ferme la
 *    fenêtre, sinon clic sur son bouton « Fermer / Annuler / × ».
 *
 * La fenêtre commune (components/ui/Modal) gère déjà tout cela elle-même : elle
 * est ignorée ici (son fond n'a pas la classe bg-black sur le conteneur).
 */
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const CLOSE_RE = /^(fermer|annuler|close|retour|non|plus tard)$/i;

const isOverlay = (el) =>
  el instanceof HTMLElement
  && el.classList.contains('fixed')
  && el.classList.contains('inset-0')
  && /\bbg-black\//.test(el.className)
  && !el.hasAttribute('data-no-a11y');

const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;

function topOverlay() {
  const all = Array.from(document.querySelectorAll('div.fixed.inset-0')).filter((el) => isOverlay(el) && visible(el));
  if (!all.length) return null;
  // Le plus haut : z-index le plus grand, puis le dernier dans le DOM.
  return all.reduce((best, el) => {
    const z = Number(getComputedStyle(el).zIndex) || 0;
    const bz = Number(getComputedStyle(best).zIndex) || 0;
    return z >= bz ? el : best;
  });
}

function reactOnClick(el) {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps'));
  return key ? el[key]?.onClick : undefined;
}

function findCloseButton(overlay) {
  const buttons = Array.from(overlay.querySelectorAll('button')).filter(visible);
  return buttons.find((b) => {
    const label = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim();
    return CLOSE_RE.test(label) || label === 'close' || /^close$/.test(b.querySelector('.material-symbols-outlined')?.textContent?.trim() || '');
  });
}

function enhance(overlay) {
  if (overlay.__a11y) return;
  overlay.__a11y = { previous: document.activeElement };
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const heading = overlay.querySelector('h1, h2, h3');
  if (heading) {
    if (!heading.id) heading.id = `dlg-${Math.random().toString(36).slice(2, 9)}`;
    overlay.setAttribute('aria-labelledby', heading.id);
  }
  // Focus initial, sauf si la page l'a déjà placé dans la fenêtre (autoFocus).
  requestAnimationFrame(() => {
    if (overlay.contains(document.activeElement)) return;
    const field = overlay.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])');
    const target = field || overlay.querySelector(FOCUSABLE);
    if (target) target.focus({ preventScroll: true });
    else { overlay.tabIndex = -1; overlay.focus({ preventScroll: true }); }
  });
}

function restore(overlay) {
  const prev = overlay.__a11y?.previous;
  if (prev && document.contains(prev) && typeof prev.focus === 'function') prev.focus({ preventScroll: true });
}

export default function OverlayA11y() {
  useEffect(() => {
    document.querySelectorAll('div.fixed.inset-0').forEach((el) => isOverlay(el) && enhance(el));

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (isOverlay(n)) enhance(n);
          n.querySelectorAll?.('div.fixed.inset-0').forEach((el) => isOverlay(el) && enhance(el));
        });
        m.removedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          if (n.__a11y) restore(n);
          n.querySelectorAll?.('div.fixed.inset-0').forEach((el) => el.__a11y && restore(el));
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const overlay = topOverlay();
      if (!overlay) return;
      if (e.key === 'Escape') {
        if (reactOnClick(overlay)) { overlay.click(); e.preventDefault(); return; }
        const btn = findCloseButton(overlay);
        if (btn) { btn.click(); e.preventDefault(); }
        return;
      }
      if (e.key === 'Tab') {
        const items = Array.from(overlay.querySelectorAll(FOCUSABLE)).filter(visible);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { observer.disconnect(); document.removeEventListener('keydown', onKey); };
  }, []);
  return null;
}
