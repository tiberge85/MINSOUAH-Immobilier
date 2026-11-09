import { lazy } from 'react';

/*
 * Chargement des pages à la demande — conçu pour un réseau instable.
 *
 *  1. Si le fichier d'une page n'arrive pas, on réessaie (1,5 s puis 4 s).
 *  2. Si ça échoue encore, c'est souvent qu'un déploiement a remplacé les
 *     fichiers : on recharge UNE fois la page (même garde-fou que index.html).
 *  3. preloadPages() télécharge toutes les pages en arrière-plan dès que le
 *     navigateur est libre : après quelques secondes, naviguer ne dépend plus
 *     du réseau (c'était la raison de l'ancien choix « un seul fichier »).
 */
const GUARD = '__minsouah_stale_reload__';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const loaders = [];

export function lazyPage(factory) {
  loaders.push(factory);
  return lazy(async () => {
    try { return await factory(); } catch { /* réessai */ }
    await wait(1500);
    try { return await factory(); } catch { /* réessai */ }
    await wait(4000);
    try { return await factory(); } catch (err) {
      try {
        if (!sessionStorage.getItem(GUARD)) {
          sessionStorage.setItem(GUARD, '1');
          window.location.reload();
          return new Promise(() => {}); // la page se recharge
        }
      } catch { /* ignore */ }
      throw err;
    }
  });
}

let preloaded = false;
export function preloadPages() {
  if (preloaded) return;
  // Connexion lente ou « économie de données » : on ne précharge pas. Les pages
  // se téléchargent alors une à une, à la première visite.
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
  preloaded = true;
  // Une page à la fois, et seulement après un délai : les données Firestore de
  // l'écran ouvert passent d'abord, le préchargement ne leur vole pas la bande
  // passante.
  const run = async () => {
    for (const f of loaders) {
      try { await f(); } catch { /* ignorée : rechargée à la visite */ }
    }
  };
  const start = () => ('requestIdleCallback' in window
    ? window.requestIdleCallback(run, { timeout: 5000 })
    : run());
  setTimeout(start, 6000);
}
