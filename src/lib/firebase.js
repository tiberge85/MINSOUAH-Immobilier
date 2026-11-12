import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, indexedDBLocalPersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
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

// Firestore AVEC CACHE LOCAL PERSISTANT (IndexedDB).
// Au 1er accès les données viennent du serveur ; ensuite, à chaque visite,
// elles s'affichent INSTANTANÉMENT depuis le cache local puis se mettent à jour
// en arrière-plan. persistentMultipleTabManager permet plusieurs onglets ouverts.
// En cas d'indisponibilité (navigateur restreint, HMR déjà initialisé), on
// retombe proprement sur une instance Firestore classique, sans casser l'app.
// experimentalAutoDetectLongPolling : certains réseaux (connexions instables,
// pare-feu, extensions/bloqueurs, erreurs QUIC) empêchent la connexion temps
// réel « streaming » de Firestore de s'établir → les données ne se chargent
// jamais et l'écran reste bloqué. Le long-polling (détecté automatiquement)
// bascule sur de simples requêtes HTTP qui passent dans ces conditions.
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalAutoDetectLongPolling: true,
  });
} catch (e) {
  console.warn('[firestore init] repli sans cache', e?.code || e?.message);
  try {
    _db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    _db = getFirestore(app);
  }
}
export const db = _db;

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
