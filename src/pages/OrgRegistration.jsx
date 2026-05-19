import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, deleteDoc, updateDoc, getDocFromServer } from 'firebase/firestore';
import { createUserWithEmailAndPassword, deleteUser, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { hashPwd } from '../lib/auth';
import { createLicensePayload } from '../lib/licenses';
import { PLANS, getPlan } from '../lib/planLimits';
import { validateEmailFull } from '../lib/disposableEmails';
import { sendEmail } from '../lib/email';
import Icon from '../components/Icon';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const wsDoc = (col, id) => doc(db, 'workspaces', WS, col, String(id));

function genOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildOtpHtml({ name, code }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:0">
<div style="max-width:480px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">
  <div style="background:#1a2e4a;color:#fff;padding:28px 32px">
    <p style="margin:0;font-size:13px;opacity:.75;letter-spacing:2px;text-transform:uppercase">Minsouah — Inscription</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:800">Confirmez votre adresse email</h1>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px">Bonjour <strong>${name}</strong>,</p>
    <p style="color:#374151;font-size:15px">Votre code de vérification pour activer votre espace Minsouah :</p>
    <div style="font-size:44px;font-weight:900;letter-spacing:14px;color:#1a2e4a;background:#f0f4ff;border:2px solid #c7d2fe;border-radius:14px;padding:22px;text-align:center;margin:24px 0">${code}</div>
    <p style="color:#6b7280;font-size:13px;margin:0">⏱ Ce code expire dans <strong>10 minutes</strong>.</p>
    <p style="color:#6b7280;font-size:13px">🔒 Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
  </div>
  <div style="padding:14px 32px;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6">
    Minsouah · Gestion immobilière Côte d'Ivoire
  </div>
</div>
</body>
</html>`;
}

const PLAN_CARDS = [
  {
    id: 'standard',
    highlight: false,
    limits: ['2 utilisateurs', '10 biens', '30 locataires'],
    included: ['Gestion biens', 'Locataires', 'Paiements', 'Notifications'],
    excluded: ['Export avancé', 'Analytics', 'API'],
  },
  {
    id: 'pro',
    highlight: true,
    limits: ['5 utilisateurs', '150 biens', '1000 locataires'],
    included: ['Tout Standard', 'Rapports financiers', 'Export PDF/Excel', 'Dashboard temps réel', 'Logs activité'],
    excluded: ['Multi-agences', 'API', 'IA analytics'],
  },
  {
    id: 'enterprise',
    highlight: false,
    limits: ['Utilisateurs illimités', 'Biens illimités', 'Locataires illimités'],
    included: ['Tout Pro', 'Multi-agences', 'API privée', 'IA analytics', 'SLA premium', 'Support prioritaire'],
    excluded: [],
  },
];

export default function OrgRegistration() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [orgForm, setOrgForm] = useState({ name: '', address: '', phone: '', email: '' });
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OTP verification screen
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [emailSentOk, setEmailSentOk] = useState(false);
  const [fallbackCode, setFallbackCode] = useState(''); // shown on screen when email fails
  const [success, setSuccess] = useState(false);

  const pendingDataRef = useRef(null);
  const pendingOrgDocRef = useRef(null);

  const plan = getPlan(selectedPlan);

  // ── Write OTP to pendingOrg + send email ──────────────────────────────────
  const dispatchOTP = async (emailLow, adminName, pendingRef) => {
    const code = genOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await updateDoc(pendingRef, {
      otp: { code, expiresAt, attempts: 0 },
      otpVerified: false,
    });

    const result = await sendEmail({
      to: emailLow,
      subject: 'Code de vérification Minsouah',
      html: buildOtpHtml({ name: adminName, code }),
    });

    console.log('[otp] dispatched to', emailLow, '| sendEmail result:', result);
    setEmailSentOk(result.ok);
    // If email delivery failed (service not configured), show code on screen
    if (!result.ok) setFallbackCode(code);
    else setFallbackCode('');
    return result;
  };

  // ── Commit to Firestore after OTP verified ────────────────────────────────
  const commitToFirestore = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      setOtpError('Session expirée. Rechargez la page et recommencez.');
      return;
    }

    console.log('[commit] start — uid:', fbUser.uid);

    // Force JWT refresh before writes
    await fbUser.getIdToken(true);
    console.log('[commit] token refreshed');

    const { orgId, orgData, adminId, adminData, license, now } = pendingDataRef.current;

    // Write usersByUid first — needed for isSuperAdmin/isOrgAdmin rules
    const ubRef = doc(db, 'workspaces', WS, 'usersByUid', fbUser.uid);
    await setDoc(ubRef, {
      userId: String(adminId),
      orgId,
      role: 'ORGANIZATION_ADMIN',
      updatedAt: now,
    }, { merge: true });
    await getDocFromServer(ubRef);
    console.log('[commit] usersByUid confirmed');

    await setDoc(wsDoc('organizations', orgId), orgData);
    console.log('[commit] organization OK');

    await setDoc(wsDoc('licenses', license.key), { ...license, id: license.key });
    console.log('[commit] license OK');

    await setDoc(wsDoc('users', adminId), adminData);
    console.log('[commit] user OK');

    if (pendingOrgDocRef.current) deleteDoc(pendingOrgDocRef.current).catch(() => {});

    // Sign out — user must log in properly through Login.jsx
    await signOut(auth).catch(() => {});
    console.log('[commit] complete ✓');

    setSuccess(true);
    setOtpStep(false);
  };

  // ── Verify OTP entered by user ────────────────────────────────────────────
  const handleVerifyOTP = async () => {
    const code = otpCode.replace(/\D/g, '').trim();
    if (code.length !== 6) { setOtpError('Entrez le code à 6 chiffres reçu par email.'); return; }

    setOtpLoading(true);
    setOtpError('');

    try {
      const snap = await getDocFromServer(pendingOrgDocRef.current);
      if (!snap.exists()) { setOtpError('Session expirée. Rechargez et recommencez.'); return; }

      const { otp } = snap.data();
      if (!otp) { setOtpError('Code introuvable. Renvoyez le code.'); return; }

      if (new Date(otp.expiresAt) < new Date()) {
        setOtpError('Code expiré. Cliquez "Renvoyer un code" pour recevoir un nouveau code.');
        return;
      }

      const attempts = otp.attempts || 0;
      if (attempts >= 3) {
        setOtpError('Trop de tentatives. Cliquez "Renvoyer un code" pour recevoir un nouveau code.');
        return;
      }

      if (code !== String(otp.code)) {
        await updateDoc(pendingOrgDocRef.current, { 'otp.attempts': attempts + 1 });
        const remaining = 2 - attempts;
        setOtpError(`Code incorrect. ${remaining > 0 ? `${remaining} tentative(s) restante(s).` : 'Renvoyez un nouveau code.'}`);
        return;
      }

      // Code correct — mark as verified then commit
      await updateDoc(pendingOrgDocRef.current, { otpVerified: true });
      console.log('[otp] verified ✓');
      await commitToFirestore();
    } catch (err) {
      console.error('[otp] verify error:', err?.code, err?.message);
      setOtpError('Erreur de vérification. Réessayez.');
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResendOTP = async () => {
    setResendMsg('');
    setFallbackCode('');
    setResendLoading(true);
    const emailLow = adminForm.email.trim().toLowerCase();
    try {
      await dispatchOTP(emailLow, adminForm.name.trim(), pendingOrgDocRef.current);
      setOtpCode('');
      setOtpError('');
      setResendMsg('Nouveau code généré !');
    } catch (err) {
      console.error('[otp] resend error:', err);
      setResendMsg('Erreur lors du renvoi. Réessayez dans 1 minute.');
    } finally {
      setResendLoading(false);
    }
  };

  // ── Cancel registration ───────────────────────────────────────────────────
  const handleCancel = async () => {
    if (pendingOrgDocRef.current) deleteDoc(pendingOrgDocRef.current).catch(() => {});
    const fbUser = auth.currentUser;
    if (fbUser) {
      try { await deleteUser(fbUser); } catch { try { await signOut(auth); } catch { } }
    }
    pendingDataRef.current = null;
    pendingOrgDocRef.current = null;
    setOtpStep(false);
    setOtpCode('');
    setOtpError('');
    setResendMsg('');
    setStep(3);
  };

  // ── Main registration handler ─────────────────────────────────────────────
  const handleRegister = async () => {
    if (adminForm.password.length < 8) { setError('Mot de passe : 8 caractères minimum.'); return; }
    if (adminForm.password !== adminForm.confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (!adminForm.name.trim() || !adminForm.email.trim()) { setError('Nom et email requis.'); return; }
    if (!orgForm.name.trim()) { setError("Nom de l'organisation requis."); return; }

    const emailLow = adminForm.email.trim().toLowerCase();
    setLoading(true);
    setError('');

    try {
      // 1. Validate email — blocklist + Abstract API (if key configured)
      const emailCheck = await validateEmailFull(emailLow);
      if (!emailCheck.valid) {
        setError(emailCheck.reason === 'undeliverable'
          ? "Cette adresse email est invalide ou inexistante. Utilisez une adresse professionnelle réelle."
          : "Les adresses email temporaires/jetables ne sont pas acceptées. Utilisez une adresse professionnelle valide.");
        return;
      }

      // 2. Create Firebase Auth account (or recover existing pending registration)
      let fbUser = null;
      try {
        const cred = await createUserWithEmailAndPassword(auth, emailLow, adminForm.password);
        fbUser = cred.user;
        console.log('[register] Firebase Auth account created:', fbUser.uid);
      } catch (fbErr) {
        if (fbErr.code === 'auth/email-already-in-use') {
          // Try to sign in — user may have a pending registration they can continue
          try {
            const retryCred = await signInWithEmailAndPassword(auth, emailLow, adminForm.password);
            fbUser = retryCred.user;
            console.log('[register] recovered existing Firebase account:', fbUser.uid);
          } catch {
            setError("Un compte existe déjà avec cet email. Connectez-vous sur la page de connexion, ou utilisez un autre email pour créer une nouvelle organisation.");
            return;
          }
        } else {
          throw fbErr;
        }
      }

      // 3. Build Firestore payload (all in memory — nothing committed until OTP verified)
      const orgId   = `org_${Date.now()}`;
      const adminId = Date.now() + 1;
      const now     = new Date().toISOString();
      const initials = adminForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const hashedPwd = await hashPwd(adminForm.password);
      const license   = createLicensePayload({ orgId, plan: 'trial' });

      pendingDataRef.current = {
        orgId,
        orgData: {
          id: orgId, name: orgForm.name.trim(), address: orgForm.address,
          phone: orgForm.phone, email: orgForm.email || emailLow,
          plan: 'trial', active: true, createdAt: now, licenseKey: license.key,
        },
        adminId,
        adminData: {
          id: adminId, name: adminForm.name.trim(), email: emailLow,
          password: hashedPwd, role: 'ORGANIZATION_ADMIN', orgId, initials,
          color: 'bg-primary-container text-on-primary-container',
          personId: null, firstLogin: false, suspended: false, createdAt: now,
          lastLogin: null, failedAttempts: 0, lockedUntil: null,
          // OTP verified at registration — no additional email gate needed at login
          emailVerificationRequired: false,
        },
        license,
        now,
      };

      // 4. Write pendingOrganizations with a placeholder otp field (dispatchOTP updates it)
      const pendingRef = wsDoc('pendingOrganizations', orgId);
      pendingOrgDocRef.current = pendingRef;
      await setDoc(pendingRef, {
        fbUid: fbUser.uid, orgId, adminEmail: emailLow, createdAt: now,
        otp: { code: '', expiresAt: '', attempts: 0 },
        otpVerified: false,
      });

      // 5. Generate OTP, write it to Firestore, and send email
      await dispatchOTP(emailLow, adminForm.name.trim(), pendingRef);

      // 6. Show OTP verification screen
      setOtpStep(true);
    } catch (err) {
      console.error('[register] error:', err?.code, err?.message);
      // Clean up Firebase Auth account if created
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        try { await deleteUser(auth.currentUser); } catch { try { await signOut(auth); } catch { } }
      }
      if (err.code === 'auth/email-already-in-use') {
        setError("Cet email est déjà associé à un compte. Connectez-vous ou utilisez un autre email.");
      } else if (err.code === 'auth/weak-password') {
        setError("Mot de passe trop faible. Utilisez au moins 8 caractères.");
      } else {
        setError("Erreur lors de la création : " + (err.message || 'Réessayez.'));
      }
    } finally {
      setLoading(false);
    }
  };

  // ── OTP verification screen ───────────────────────────────────────────────
  if (otpStep && !success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Icon name="mark_email_unread" size={32} className="text-on-primary" />
            </div>
            <h1 className="font-black text-3xl text-primary tracking-tight">Minsouah</h1>
            <p className="text-on-surface-variant text-sm mt-1">Vérification de votre adresse email</p>
          </div>

          <div className="bg-surface rounded-3xl shadow-xl overflow-hidden border border-outline-variant/20">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon name="email" size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-on-surface leading-tight">Code de vérification</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Envoyé à <strong>{adminForm.email}</strong>
                  </p>
                </div>
              </div>

              {emailSentOk ? (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-4 text-sm text-green-800">
                  <Icon name="check_circle" size={16} className="text-green-600 flex-shrink-0" />
                  Email envoyé. Vérifiez votre boîte mail et le dossier Spam.
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                  <p className="font-bold text-amber-900 text-sm mb-1 flex items-center gap-1.5">
                    <Icon name="info" size={15} /> Service email non configuré
                  </p>
                  <p className="text-xs text-amber-800 mb-3">
                    L'email n'a pas pu être envoyé (service non configuré). Utilisez le code ci-dessous directement :
                  </p>
                  <div className="bg-white border-2 border-amber-300 rounded-xl py-4 px-6 text-center mb-2">
                    <p className="text-xs text-amber-700 mb-1 font-semibold uppercase tracking-wide">Votre code de vérification</p>
                    <div className="text-4xl font-black tracking-[0.3em] text-amber-900 select-all">{fallbackCode}</div>
                  </div>
                  <p className="text-[11px] text-amber-700">Copiez ce code et collez-le dans le champ ci-dessous.</p>
                </div>
              )}

              <div className="bg-surface-container/60 rounded-xl p-3 mb-5 text-xs text-on-surface-variant flex flex-col gap-1">
                <p className="flex items-center gap-1.5"><Icon name="folder" size={12} className="flex-shrink-0" /> Vérifiez aussi votre dossier <strong>Spam</strong> et l'onglet <strong>Promotions</strong> (Gmail)</p>
                <p className="flex items-center gap-1.5"><Icon name="schedule" size={12} className="flex-shrink-0" /> Le code est valable <strong>10 minutes</strong></p>
              </div>

              <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-sm font-semibold text-on-surface">Code à 6 chiffres</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtpCode(v);
                    if (otpError) setOtpError('');
                  }}
                  placeholder="— — — — — —"
                  autoFocus
                  className="w-full px-4 py-4 rounded-xl border-2 border-outline-variant/40 bg-surface-container focus:outline-none focus:border-primary text-on-surface text-center text-2xl font-black tracking-[0.6em] placeholder:tracking-normal placeholder:text-on-surface-variant/40 placeholder:text-base placeholder:font-normal"
                />
              </div>

              {otpError && (
                <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-xl px-3 py-2.5 mb-4">
                  <Icon name="error" size={16} className="text-error flex-shrink-0 mt-0.5" />
                  <p className="text-error text-sm">{otpError}</p>
                </div>
              )}

              <button
                onClick={handleVerifyOTP}
                disabled={otpLoading || otpCode.length < 6}
                className="w-full py-3.5 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 mb-3"
              >
                {otpLoading
                  ? <><Icon name="progress_activity" size={20} className="animate-spin" /> Vérification…</>
                  : <><Icon name="verified_user" size={20} /> Confirmer le code</>}
              </button>

              <div className="flex items-center justify-between">
                <button
                  onClick={handleResendOTP}
                  disabled={resendLoading}
                  className="text-sm font-semibold text-primary disabled:text-on-surface-variant disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Icon name="refresh" size={16} />
                  {resendLoading ? 'Envoi…' : 'Renvoyer un code'}
                </button>
                <button
                  onClick={handleCancel}
                  className="text-sm text-on-surface-variant hover:text-on-surface underline"
                >
                  Annuler
                </button>
              </div>

              {resendMsg && (
                <p className={`text-xs mt-3 font-semibold ${resendMsg.startsWith('Nouveau') ? 'text-green-700' : 'text-error'}`}>
                  {resendMsg}
                </p>
              )}
            </div>

            <div className="border-t border-outline-variant/10 px-6 py-3 flex items-center justify-center gap-2">
              <Icon name="lock" size={14} className="text-on-surface-variant" />
              <span className="text-xs text-on-surface-variant">Vérification de sécurité Minsouah</span>
            </div>
          </div>

          <p className="text-center text-xs text-on-surface-variant mt-6">
            © {new Date().getFullYear()} Minsouah — Gestion immobilière Côte d'Ivoire
          </p>
        </div>
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Icon name="verified" size={40} className="text-green-700" />
          </div>
          <h2 className="text-2xl font-black text-on-surface mb-2">Email vérifié — Espace créé !</h2>
          <p className="text-on-surface-variant mb-6">
            Votre organisation <strong className="text-on-surface">{orgForm.name}</strong> est prête.
          </p>
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-sm text-on-surface-variant mb-6 text-left flex flex-col gap-1.5">
            <p className="font-bold text-primary text-base mb-1 flex items-center gap-2">
              <Icon name="check_circle" size={18} /> Organisation créée avec succès
            </p>
            <p><strong className="text-on-surface">{orgForm.name}</strong></p>
            <p>Plan {plan.name} · Essai {plan.trialDays} jours gratuits</p>
            <p>Admin : {adminForm.name}</p>
          </div>
          <button
            onClick={() => navigate('/login', { state: { registered: true, email: adminForm.email, orgName: orgForm.name } })}
            className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 flex items-center justify-center gap-2"
          >
            <Icon name="login" size={18} /> Se connecter maintenant
          </button>
        </div>
      </div>
    );
  }

  // ── Registration form (Steps 1-3) ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-surface border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Icon name="domain" size={20} className="text-on-primary" />
          </div>
          <div>
            <h1 className="font-black text-lg text-primary">Minsouah</h1>
            <p className="text-xs text-on-surface-variant">Créer votre organisation</p>
          </div>
        </div>
        <button onClick={() => navigate('/login')} className="text-sm text-on-surface-variant hover:text-on-surface flex items-center gap-1 transition-colors">
          <Icon name="login" size={16} /> Connexion
        </button>
      </header>

      {/* Step indicator */}
      <div className="bg-surface border-b border-outline-variant/10 px-6 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          {[{ n: 1, l: 'Plan' }, { n: 2, l: 'Organisation' }, { n: 3, l: 'Admin' }].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s.n ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{s.n}</div>
              <span className={`text-sm font-medium hidden sm:block ${step === s.n ? 'text-primary font-bold' : step > s.n ? 'text-on-surface' : 'text-on-surface-variant'}`}>{s.l}</span>
              {i < 2 && <Icon name="chevron_right" size={16} className="text-outline-variant mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 px-4 py-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">

          {/* ── STEP 1 — Plan ── */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-black text-on-surface text-center mb-2">Choisissez votre plan</h2>
              <p className="text-center text-on-surface-variant mb-8">Essai gratuit {PLANS[selectedPlan]?.trialDays} jours — aucune carte requise</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {PLAN_CARDS.map(pc => {
                  const p = getPlan(pc.id);
                  const isSelected = selectedPlan === pc.id;
                  return (
                    <button key={pc.id} onClick={() => setSelectedPlan(pc.id)}
                      className={`text-left rounded-2xl border-2 p-5 transition-all relative ${isSelected ? 'border-primary bg-primary/5 shadow-lg' : 'border-outline-variant/30 bg-surface hover:border-primary/40'}`}>
                      {pc.highlight && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-on-primary text-[10px] font-bold px-3 py-1 rounded-full">RECOMMANDÉ</div>
                      )}
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                          <Icon name="check" size={14} className="text-on-primary" />
                        </div>
                      )}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${p.badgeColor}`}>
                        <Icon name={p.icon} size={20} />
                      </div>
                      <h3 className="font-black text-xl text-on-surface mb-0.5">{p.name}</h3>
                      <p className="text-xs text-on-surface-variant mb-3">{p.description}</p>
                      <div className="mb-3">
                        {p.monthlyPrice ? (
                          <span className="font-black text-2xl text-primary">{p.monthlyPrice.toLocaleString('fr-CI')} <span className="text-sm font-normal text-on-surface-variant">FCFA/mois</span></span>
                        ) : (
                          <span className="font-black text-xl text-primary">Sur devis</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 mb-3">
                        {pc.limits.map(l => (
                          <div key={l} className="flex items-center gap-1.5 text-xs text-on-surface">
                            <Icon name="check_circle" size={13} className="text-primary flex-shrink-0" /> {l}
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-outline-variant/20 pt-3 flex flex-col gap-1">
                        {pc.included.map(f => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                            <Icon name="check" size={12} className="text-green-600 flex-shrink-0" /> {f}
                          </div>
                        ))}
                        {pc.excluded.map(f => (
                          <div key={f} className="flex items-center gap-1.5 text-xs text-on-surface-variant opacity-50">
                            <Icon name="close" size={12} className="text-error flex-shrink-0" /> {f}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <button onClick={() => setStep(2)}
                  className="px-8 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2">
                  Continuer avec {plan.name} <Icon name="arrow_forward" size={18} />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 — Organisation ── */}
          {step === 2 && (
            <div className="max-w-lg mx-auto">
              <h2 className="text-2xl font-black text-on-surface mb-2">Votre organisation</h2>
              <p className="text-on-surface-variant mb-6">Ces informations apparaîtront sur vos documents officiels.</p>
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom de l'organisation *</label>
                  <input value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="Ex: Agence Immobilière Cocody" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Adresse</label>
                  <input value={orgForm.address} onChange={e => setOrgForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="Abidjan, Cocody 2 Plateaux" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Téléphone</label>
                    <input value={orgForm.phone} onChange={e => setOrgForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                      placeholder="+225 07 00 00 00 00" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Email pro</label>
                    <input type="email" value={orgForm.email} onChange={e => setOrgForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                      placeholder="contact@agence.ci" />
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
                  <div className={`px-2 py-1 rounded-lg text-xs font-bold ${getPlan(selectedPlan).badgeColor}`}>{getPlan(selectedPlan).name}</div>
                  <p className="text-xs text-on-surface-variant">Plan sélectionné · Essai {getPlan(selectedPlan).trialDays}j gratuit</p>
                  <button onClick={() => setStep(1)} className="ml-auto text-xs text-primary hover:underline">Changer</button>
                </div>
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-surface-container text-on-surface rounded-xl font-semibold text-sm hover:bg-surface-container-high transition-colors">← Précédent</button>
                <button onClick={() => { if (!orgForm.name.trim()) { setError("Nom requis"); return; } setError(''); setStep(3); }}
                  className="px-8 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2">
                  Suivant <Icon name="arrow_forward" size={16} />
                </button>
              </div>
              {error && <p className="text-error text-sm mt-3 text-center">{error}</p>}
            </div>
          )}

          {/* ── STEP 3 — Admin ── */}
          {step === 3 && (
            <div className="max-w-lg mx-auto">
              <h2 className="text-2xl font-black text-on-surface mb-2">Compte administrateur</h2>
              <p className="text-on-surface-variant mb-6">Ce compte aura accès complet à votre espace. Un code de vérification sera envoyé par email.</p>
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom complet *</label>
                  <input value={adminForm.name} onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="Prénom Nom" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Email professionnel *</label>
                  <input type="email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="admin@votreagence.ci" />
                  <p className="text-xs text-on-surface-variant mt-1">Un code à 6 chiffres vous sera envoyé pour vérifier cet email.</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Mot de passe * (min. 8 caractères)</label>
                  <input type="password" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="••••••••" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Confirmer le mot de passe *</label>
                  <input type="password" value={adminForm.confirm} onChange={e => setAdminForm(f => ({ ...f, confirm: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30 text-on-surface"
                    placeholder="••••••••" />
                </div>
                <div className="p-3 bg-surface-container rounded-xl text-xs text-on-surface-variant flex flex-col gap-1">
                  <p><strong className="text-on-surface">{orgForm.name}</strong> · Plan {getPlan(selectedPlan).name}</p>
                  <p>Essai gratuit {getPlan(selectedPlan).trialDays} jours, puis {getPlan(selectedPlan).monthlyPrice ? `${getPlan(selectedPlan).monthlyPrice.toLocaleString('fr-CI')} FCFA/mois` : 'sur devis'}</p>
                </div>
                {error && <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm"><Icon name="error" size={16} />{error}</div>}
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => { setError(''); setStep(2); }} className="px-5 py-2.5 bg-surface-container text-on-surface rounded-xl font-semibold text-sm hover:bg-surface-container-high transition-colors">← Précédent</button>
                <button onClick={handleRegister} disabled={loading}
                  className="px-8 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60">
                  {loading ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="rocket_launch" size={16} />}
                  {loading ? 'Création...' : 'Créer mon espace'}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      <footer className="py-4 text-center text-xs text-on-surface-variant border-t border-outline-variant/10">
        © {new Date().getFullYear()} Minsouah Immobilier · <button onClick={() => navigate('/login')} className="text-primary hover:underline">Déjà inscrit ? Se connecter</button>
      </footer>
    </div>
  );
}
