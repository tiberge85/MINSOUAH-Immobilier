import { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const FirebaseAuthContext = createContext(null);

export const ROLES = {
  SUPER_ADMIN:        'SUPER_ADMIN',
  ORGANIZATION_ADMIN: 'ORGANIZATION_ADMIN',
  AGENT:              'AGENT',
  OWNER:              'OWNER',
  TENANT:             'TENANT',
  // legacy (kept for backward compat until migration completes)
  ADMIN:      'ADMIN',
  MANAGER:    'MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  TECHNICIAN: 'TECHNICIAN',
  CONCIERGE:  'CONCIERGE',
};

export function FirebaseAuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen to Firebase auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        // Fetch role/profile from Firestore
        try {
          const profileDoc = await getDoc(doc(db, 'users', fbUser.uid));
          if (profileDoc.exists()) {
            setUserProfile({ uid: fbUser.uid, email: fbUser.email, ...profileDoc.data() });
          } else {
            setUserProfile({ uid: fbUser.uid, email: fbUser.email, role: ROLES.TENANT });
          }
        } catch {
          setUserProfile({ uid: fbUser.uid, email: fbUser.email, role: ROLES.TENANT });
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // Update last login in Firestore
      await setDoc(doc(db, 'users', cred.user.uid), { lastLoginAt: serverTimestamp() }, { merge: true });
      return cred.user;
    } catch (err) {
      const msg = getFirebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  };

  const register = async (email, password, profile) => {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Create Firestore profile
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        role: profile.role || ROLES.TENANT,
        name: profile.name || '',
        organizationId: profile.organizationId || null,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });
      return cred.user;
    } catch (err) {
      const msg = getFirebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = () => signOut(auth);

  const forgotPassword = async (email) => {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const msg = getFirebaseErrorMessage(err.code);
      setError(msg);
      throw new Error(msg);
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    if (!firebaseUser) throw new Error('Non authentifié');
    const cred = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
    await reauthenticateWithCredential(firebaseUser, cred);
    await updatePassword(firebaseUser, newPassword);
  };

  const getIdToken = () => firebaseUser?.getIdToken(true);

  const hasRole = (...roles) => roles.includes(userProfile?.role);
  const isAdmin = () => hasRole(ROLES.SUPER_ADMIN, ROLES.ORGANIZATION_ADMIN, ROLES.ADMIN);

  return (
    <FirebaseAuthContext.Provider value={{
      firebaseUser, userProfile, loading, error,
      login, register, logout, forgotPassword, changePassword, getIdToken,
      hasRole, isAdmin,
    }}>
      {children}
    </FirebaseAuthContext.Provider>
  );
}

export const useFirebaseAuth = () => {
  const ctx = useContext(FirebaseAuthContext);
  if (!ctx) throw new Error('useFirebaseAuth must be inside FirebaseAuthProvider');
  return ctx;
};

function getFirebaseErrorMessage(code) {
  const messages = {
    'auth/user-not-found': 'Aucun compte avec cet email.',
    'auth/wrong-password': 'Mot de passe incorrect.',
    'auth/invalid-credential': 'Email ou mot de passe incorrect.',
    'auth/too-many-requests': 'Trop de tentatives. Réessayez dans quelques minutes.',
    'auth/user-disabled': 'Ce compte a été désactivé.',
    'auth/email-already-in-use': 'Cet email est déjà utilisé.',
    'auth/weak-password': 'Le mot de passe doit avoir au moins 6 caractères.',
    'auth/network-request-failed': 'Problème de connexion réseau.',
  };
  return messages[code] || 'Une erreur est survenue. Veuillez réessayer.';
}
