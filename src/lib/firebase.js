import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, indexedDBLocalPersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';

// Les clés Firebase web sont publiques par design — la sécurité est dans les Security Rules
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             || 'AIzaSyBustZiPd3iW2FxUC4yXflQ9OhJ5U7m9to',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         || 'minsouah-7d698.firebaseapp.com',
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL        || 'https://minsouah-7d698-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          || 'minsouah-7d698',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      || 'minsouah-7d698.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '569384887816',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              || '1:569384887816:web:56edaea4b5396dc8a3d3bd',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID      || 'G-Y5EY8HCWR6',
};

// Évite la double initialisation en mode HMR (hot reload Vite)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Firestore en LONG-POLLING FORCÉ, SANS cache local persistant.
// • Long-polling forcé : sur certains réseaux (connexions instables, pare-feu,
//   erreurs QUIC) la connexion temps réel « streaming » de Firestore échoue en
//   boucle et les données ne se chargent jamais. On force de simples requêtes
//   HTTP qui passent partout — c'est la config validée qui charge en < 1 s.
// • Pas de cache IndexedDB : le cache persistant pouvait rester dans un état
//   corrompu/verrouillé et empêcher Firestore de fonctionner. On privilégie la
//   fiabilité du chargement à l'affichage instantané depuis le cache.
let _db;
try {
  _db = initializeFirestore(app, { experimentalForceLongPolling: true });
  console.log('[MINSOUAH][firestore] initializeFirestore OK, forceLongPolling demandé');
} catch (e) {
  console.warn('[MINSOUAH][firestore init] FALLBACK getFirestore (QUIC)', e?.code || e?.message);
  _db = getFirestore(app);
}
export const db = _db;
// Diagnostic réseau (temporaire) : expose la config réelle + teste une lecture.
try {
  if (typeof window !== 'undefined') {
    window.__MDB = _db;
    const s = _db._settings || {};
    console.log('[MINSOUAH][firestore] settings:', JSON.stringify({
      forceLongPolling: s.experimentalForceLongPolling,
      autoDetect: s.experimentalAutoDetectLongPolling,
      host: s.host, hasLocalCache: !!s.localCache,
    }));
  }
} catch { /* ignore */ }

export const storage = getStorage(app);
export const rtdb = getDatabase(app);

// Persist auth across browser sessions / reloads.
// IMPORTANT : on EXPORTE une promesse `authReady` et on l'ATTEND avant toute
// connexion (voir Login.jsx). Sinon, sur certains navigateurs (Safari/iOS,
// confidentialité renforcée), signInWithEmailAndPassword pouvait partir AVANT
// que la persistance « locale » soit active → la session Firebase n'était pas
// stockée durablement et, au rechargement, l'utilisateur « revenait à la
// connexion ». On tente IndexedDB (le plus robuste) puis on retombe sur
// localStorage ; en dernier recours la session reste en mémoire (cas navigateur
// très restreint) sans faire échouer l'application.
export const authReady = (async () => {
  try {
    await setPersistence(auth, indexedDBLocalPersistence);
  } catch {
    try { await setPersistence(auth, browserLocalPersistence); }
    catch (e) { console.warn('[auth persistence] indisponible — session en mémoire', e?.code || e?.message); }
  }
})();

export default app;
