/**
 * Gestion des comptes Firebase Auth depuis le navigateur — SANS déconnecter
 * l'administrateur qui agit.
 *
 * Firebase Auth est désormais la SEULE source de vérité des mots de passe :
 * plus aucun hash n'est stocké dans Firestore (il y était lisible et rejouable).
 *
 * createUserWithEmailAndPassword sur l'instance `auth` principale remplacerait
 * la session de l'admin par celle du nouveau compte ; on passe donc par une
 * application Firebase secondaire, jetée aussitôt après.
 */
import { initializeApp, deleteApp, getApp } from 'firebase/app';
import {
  getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
  inMemoryPersistence, setPersistence,
} from 'firebase/auth';
import { auth } from './firebase';

/** Mot de passe aléatoire robuste (≈ 95 bits), généré par crypto.getRandomValues. */
export function randomPassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Jeton opaque (128 bits) pour les liens publics (portail locataire…). */
export function randomToken(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Crée le compte Firebase Auth d'un autre utilisateur.
 * @returns {Promise<{ uid: string|null, exists: boolean }>}
 *   exists=true si un compte existe déjà pour cet e-mail (on ne le touche pas).
 */
export async function createAuthAccount(email, password) {
  const emailLow = String(email || '').trim().toLowerCase();
  const secondary = initializeApp(getApp().options, `acct_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  try {
    const secAuth = getAuth(secondary);
    await setPersistence(secAuth, inMemoryPersistence).catch(() => {});
    const cred = await createUserWithEmailAndPassword(secAuth, emailLow, password);
    await signOut(secAuth).catch(() => {});
    return { uid: cred.user.uid, exists: false };
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') return { uid: null, exists: true };
    throw err;
  } finally {
    deleteApp(secondary).catch(() => {});
  }
}

/** Envoie l'e-mail Firebase « choisir un nouveau mot de passe ». */
export async function sendResetLink(email) {
  await sendPasswordResetEmail(auth, String(email || '').trim().toLowerCase());
}

/**
 * Donne accès à un utilisateur : crée son compte s'il n'existe pas
 * (mot de passe fourni ou aléatoire), puis lui envoie le lien pour choisir son
 * mot de passe quand on ne lui en communique pas un.
 * @returns {Promise<{ uid: string|null, created: boolean, linkSent: boolean }>}
 */
export async function provisionAccount(email, { password = null, sendLink = false } = {}) {
  const { uid, exists } = await createAuthAccount(email, password || randomPassword());
  let linkSent = false;
  if (sendLink || exists || !password) {
    try { await sendResetLink(email); linkSent = true; } catch (e) { console.warn('[provisionAccount] reset link', e?.code); }
  }
  return { uid, created: !exists, linkSent };
}

/** Traduit les codes Firebase Auth en messages lisibles. */
export function authErrorMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'Email ou mot de passe incorrect.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessayez dans quelques minutes ou réinitialisez votre mot de passe.';
    case 'auth/user-disabled':
      return "Ce compte a été désactivé. Contactez l'administrateur.";
    case 'auth/network-request-failed':
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    case 'auth/weak-password':
      return 'Mot de passe trop faible (8 caractères minimum).';
    case 'auth/requires-recent-login':
      return 'Par sécurité, reconnectez-vous puis recommencez.';
    default:
      return 'Une erreur est survenue. Réessayez.';
  }
}
