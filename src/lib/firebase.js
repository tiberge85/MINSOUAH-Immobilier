import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);
export const storage = getStorage(app);
export const rtdb = getDatabase(app);

// Persist auth across browser sessions
setPersistence(auth, browserLocalPersistence).catch(() => {});

export default app;
