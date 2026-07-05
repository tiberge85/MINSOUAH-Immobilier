/**
 * Email OTP — 2-factor authentication for SUPER_ADMIN and ORGANIZATION_ADMIN.
 *
 * Flow: password verified → sendOTP → user enters code → verifyOTP → login
 *
 * OTPs are stored in workspaces/{ws}/otps/{userId} with a 5-min TTL and
 * consumed (deleted) on first successful use. Max 3 attempts before expiry.
 */
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { sendEmail } from './email';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const OTP_TTL_MS   = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

function generate6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Generate an OTP, store it in Firestore, and email it to the user.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function sendOTP({ userId, email, name }) {
  const code      = generate6();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await setDoc(doc(db, 'workspaces', WS, 'otps', String(userId)), {
    code,
    email,
    expiresAt,
    attempts:  0,
    createdAt: new Date().toISOString(),
  });

  const emailResult = await sendEmail({
    to:      email,
    subject: 'Code de vérification Minsouah',
    html:    buildOtpHtml({ name, code }),
  });

  return emailResult;
}

/**
 * Verify a code entered by the user.
 * @returns {{ ok: boolean, reason?: 'expired'|'invalid'|'locked', remaining?: number }}
 */
export async function verifyOTP({ userId, code, keep = false }) {
  const ref  = doc(db, 'workspaces', WS, 'otps', String(userId));
  const snap = await getDoc(ref);

  if (!snap.exists()) return { ok: false, reason: 'expired' };

  const data = snap.data();

  if (new Date(data.expiresAt) < new Date()) {
    await deleteDoc(ref).catch(() => {});
    return { ok: false, reason: 'expired' };
  }

  const attempts = (data.attempts || 0) + 1;

  if (data.code !== String(code).trim()) {
    if (attempts >= MAX_ATTEMPTS) {
      await deleteDoc(ref).catch(() => {});
      return { ok: false, reason: 'locked' };
    }
    await setDoc(ref, { ...data, attempts }, { merge: true });
    return { ok: false, reason: 'invalid', remaining: MAX_ATTEMPTS - attempts };
  }

  // Correct code. For 2FA we consume it immediately (single use). For password
  // reset we KEEP it and mark it verified so Firestore rules can authorize the
  // (otherwise-blocked) password write; the reducer deletes it right after.
  if (keep) {
    await setDoc(ref, { verified: true, verifiedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
  } else {
    await deleteDoc(ref).catch(() => {});
  }
  return { ok: true };
}

function buildOtpHtml({ name, code }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">
  <div style="background:#1a2e4a;color:#fff;padding:28px 32px">
    <p style="margin:0;font-size:13px;opacity:.75;letter-spacing:2px;text-transform:uppercase">Minsouah — Connexion sécurisée</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:800">Code de vérification</h1>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px">Bonjour <strong>${name || 'Admin'}</strong>,</p>
    <p style="color:#374151;font-size:15px">Votre code de connexion à usage unique :</p>
    <div style="font-size:44px;font-weight:900;letter-spacing:14px;color:#1a2e4a;background:#f0f4ff;border:2px solid #c7d2fe;border-radius:14px;padding:22px;text-align:center;margin:24px 0">${code}</div>
    <p style="color:#6b7280;font-size:13px;margin:0">⏱ Ce code expire dans <strong>5 minutes</strong>.</p>
    <p style="color:#6b7280;font-size:13px">🔒 Ne le communiquez jamais. Minsouah ne vous le demandera pas.</p>
    <p style="color:#ef4444;font-size:13px">Si vous n'êtes pas à l'origine de cette connexion, changez immédiatement votre mot de passe.</p>
  </div>
  <div style="padding:14px 32px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6">
    Minsouah · Gestion immobilière Côte d'Ivoire
  </div>
</div>
</body>
</html>`;
}
