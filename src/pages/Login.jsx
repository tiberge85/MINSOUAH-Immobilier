import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { verifyPwd } from '../lib/auth';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, setDoc, getDocFromServer, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { sendOTP, verifyOTP } from '../lib/otp';
import { logSec, SEC } from '../lib/securityLog';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';

export default function Login() {
  const { state, dispatch } = useApp();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [successMsg, setSuccessMsg]   = useState('');

  // ── Forgot-password state ────────────────────────────────────────────
  const [forgotMode, setForgotMode]   = useState(false);
  const [resetEmail, setResetEmail]   = useState('');
  const [resetError, setResetError]   = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // ── 2FA OTP state ────────────────────────────────────────────────────
  const [otpStep, setOtpStep]         = useState(false);   // show OTP screen
  const [otpCode, setOtpCode]         = useState('');
  const [otpLoading, setOtpLoading]   = useState(false);
  const [otpError, setOtpError]       = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);        // seconds until resend allowed
  const pendingLoginRef               = useRef(null);       // { user, firebaseUid }
  const cooldownRef                   = useRef(null);

  // Show loading screen while Firestore is bootstrapping
  if (state._bootstrapping) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
          <Icon name="domain" size={32} className="text-on-primary" />
        </div>
        <h1 className="font-black text-3xl text-primary tracking-tight">Minsouah</h1>
        <div className="flex items-center gap-2 text-on-surface-variant text-sm">
          <Icon name="progress_activity" size={18} className="animate-spin text-primary" />
          Connexion à la base de données…
        </div>
      </div>
    );
  }

  // Show error if Firebase is unreachable
  if (state._networkError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-16 h-16 bg-error/10 rounded-2xl flex items-center justify-center">
          <Icon name="wifi_off" size={32} className="text-error" />
        </div>
        <h1 className="font-black text-2xl text-primary tracking-tight">Minsouah</h1>
        <div className="bg-surface rounded-2xl shadow-lg border border-outline-variant/20 p-6 max-w-sm w-full text-center">
          <p className="font-bold text-on-surface mb-2">Impossible de contacter Firebase</p>
          <p className="text-sm text-on-surface-variant mb-4">
            Vérifiez votre connexion internet et rechargez la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="refresh" size={18} /> Réessayer
          </button>
        </div>
      </div>
    );
  }

  const users = state.users || [];

  // ── Helpers ────────────────────────────────────────────────────────────
  const startCooldown = (seconds = 60) => {
    setOtpCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown(s => {
        if (s <= 1) { clearInterval(cooldownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const completeLogin = async (user, firebaseUid) => {
    if (firebaseUid) {
      try {
        const ubRef = doc(db, 'workspaces', WS, 'usersByUid', firebaseUid);
        await setDoc(ubRef, {
          userId: String(user.id), orgId: user.orgId || 'default',
          role: user.role, updatedAt: new Date().toISOString(),
        }, { merge: true });
        // Wait for the write to reach the server before the page reloads.
        // Firestore rules read usersByUid server-side; the local cache write
        // resolves immediately but the server may not have the doc yet.
        await getDocFromServer(ubRef);
      } catch (e) {
        console.warn('[usersByUid write]', e);
      }
      // Force JWT refresh so Firestore rules see email_verified and any
      // updated custom claims from the server.
      try {
        const fbUser = auth.currentUser;
        if (fbUser) {
          await fbUser.reload();
          await fbUser.getIdToken(true);
        }
      } catch (e) {
        console.warn('[token refresh]', e);
      }
    }
    dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: user.email, success: true } });
    dispatch({
      type: 'LOGIN',
      payload: {
        id: user.id, role: user.role, name: user.name, initials: user.initials,
        email: user.email, color: user.color, avatar: user.avatar || null,
        personId: user.personId || null, firstLogin: user.firstLogin || false,
        orgId:  user.orgId  || 'default',
        orgIds: user.orgIds || [user.orgId || 'default'],
      },
    });
  };

  // ── OTP submit ─────────────────────────────────────────────────────────
  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.length < 6) { setOtpError('Entrez le code à 6 chiffres.'); return; }
    setOtpLoading(true);
    setOtpError('');
    try {
      const { user, firebaseUid } = pendingLoginRef.current;
      const result = await verifyOTP({ userId: user.id, code: otpCode });
      if (result.ok) {
        await logSec({ action: SEC.LOGIN_SUCCESS, userId: user.id, userEmail: user.email, role: user.role, details: '2FA verified' });
        await completeLogin(user, firebaseUid);
      } else if (result.reason === 'expired') {
        setOtpError('Code expiré. Renvoyez un nouveau code.');
      } else if (result.reason === 'locked') {
        setOtpError('Trop de tentatives. Renvoyez un nouveau code.');
      } else {
        setOtpError(`Code incorrect. ${result.remaining} tentative${result.remaining > 1 ? 's' : ''} restante${result.remaining > 1 ? 's' : ''}.`);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpResend = async () => {
    if (otpCooldown > 0 || !pendingLoginRef.current) return;
    const { user } = pendingLoginRef.current;
    await sendOTP({ userId: user.id, email: user.email, name: user.name });
    setOtpCode('');
    setOtpError('');
    startCooldown(60);
  };

  // ── Forgot password: request a code ────────────────────────────────────
  const openForgot = () => {
    setForgotMode(true);
    setResetEmail(email.trim());
    setResetError('');
  };
  const closeForgot = () => { setForgotMode(false); setResetError(''); };

  const handleResetRequest = async (e) => {
    e.preventDefault();
    setResetError(''); setResetInfo('');
    const emailLow = resetEmail.trim().toLowerCase();
    if (!emailLow) { setResetError('Entrez votre adresse email.'); return; }
    setResetLoading(true);
    try {
      // Firebase-native reset: sends a secure link so the user sets a new
      // password directly in Firebase Auth → normal sign-in then works.
      await sendPasswordResetEmail(auth, emailLow);
      setForgotMode(false);
      setEmail(resetEmail.trim());
      setPassword('');
      setError('');
      setSuccessMsg("Email de réinitialisation envoyé. Ouvrez le lien reçu pour choisir un nouveau mot de passe, puis reconnectez-vous. (Pensez à vérifier vos spams.)");
    } catch (err) {
      if (err?.code === 'auth/user-not-found') {
        setResetError("Aucun compte d'authentification pour cet email. Contactez votre administrateur pour réinitialiser votre mot de passe.");
      } else if (err?.code === 'auth/invalid-email') {
        setResetError('Adresse email invalide.');
      } else if (err?.code === 'auth/too-many-requests') {
        setResetError('Trop de tentatives. Réessayez dans quelques minutes.');
      } else {
        setResetError("Échec de l'envoi de l'email. Vérifiez votre connexion et réessayez.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  // ── Password login ─────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailLow = email.trim().toLowerCase();
      let user = users.find((u) => (u.email || '').toLowerCase() === emailLow);

      // Repli : si la liste locale n'est pas encore chargée (ou incomplète),
      // on interroge Firebase DIRECTEMENT avant de dire « aucun compte ».
      // Évite l'erreur « Aucun compte trouvé » quand on valide trop tôt.
      let diag = '';
      if (!user) {
        try {
          const snap = await getDocs(collection(db, 'workspaces', WS, 'users'));
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          user = all.find(u => (u.email || '').toLowerCase() === emailLow);
          diag = `${snap.size} compte(s) lus · ws=${WS}`;
        } catch (fetchErr) {
          diag = `lecture bloquée: ${fetchErr?.code || fetchErr?.message || 'inconnue'}`;
          console.warn('[Login] repli Firestore users échoué', fetchErr);
        }
      }

      // DERNIER RECOURS : si la liste des comptes est illisible (auth anonyme HS
      // ou règles Firestore), on s'authentifie DIRECTEMENT avec l'email + mot de
      // passe via Firebase, puis on relit la fiche avec cette session authentifiée.
      // Ça permet de se connecter même quand la lecture pré-connexion est bloquée.
      if (!user) {
        try {
          await signInWithEmailAndPassword(auth, emailLow, password);
          const snap = await getDocs(collection(db, 'workspaces', WS, 'users'));
          const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          user = all.find(u => (u.email || '').toLowerCase() === emailLow);
        } catch (authErr) {
          console.warn('[Login] auth directe Firebase échouée', authErr?.code || authErr?.message);
        }
      }

      if (!user) { setError(`Aucun compte trouvé avec cet email.${diag ? ` [${diag}]` : ''}`); return; }
      if (user.suspended) { setError("Ce compte a été suspendu. Contactez l'administrateur."); return; }

      if (user.role !== 'SUPER_ADMIN') {
        const userOrg = (state.organizations || []).find(o => o.id === user.orgId);
        if (userOrg && userOrg.active === false) {
          setError("Votre organisation est suspendue. Contactez le support Minsouah.");
          return;
        }
      }

      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remaining = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
        setError(`Compte temporairement bloqué. Réessayez dans ${remaining} min.`);
        return;
      }

      let firebaseUid = null;

      try {
        const cred = await signInWithEmailAndPassword(auth, emailLow, password);
        firebaseUid = cred.user.uid;
      } catch (fbErr) {
        // Firebase sign-in failed for ANY reason (wrong Firebase password, no
        // Firebase account, unknown/other error code…). The app's stored
        // password hash is the source of truth for admin/self resets (which do
        // NOT touch Firebase Auth), so ALWAYS fall back to verifying it. Accept
        // login when EITHER the Firebase password OR the local hash matches.
        let ok = false;
        try {
          ok = await verifyPwd(password, user.password);
        } catch (hashErr) {
          console.warn('[Login] hash verify failed', hashErr);
          setError("Vérification impossible dans ce contexte. Ouvrez l'application en HTTPS (https://…) puis réessayez.");
          return;
        }
        if (!ok) {
          dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: emailLow, success: false } });
          const attempts = (user.failedAttempts || 0) + 1;
          await logSec({ action: SEC.LOGIN_FAIL, userId: user.id, userEmail: emailLow, role: user.role, details: `Attempt ${attempts}` });
          setError(attempts >= 5
            ? 'Compte bloqué pour 15 minutes après 5 tentatives échouées.'
            : `Mot de passe incorrect. ${5 - attempts} tentative(s) restante(s).`);
          return;
        }
        // Hash verified — ensure a Firebase Auth account exists for this password
        try {
          const newCred = await createUserWithEmailAndPassword(auth, emailLow, password);
          firebaseUid = newCred.user.uid;
        } catch (createErr) {
          if (createErr.code === 'auth/email-already-in-use') {
            // A Firebase account exists but with a different password. The user
            // proved identity via the local hash — retry sign-in just in case.
            try {
              const retryCred = await signInWithEmailAndPassword(auth, emailLow, password);
              firebaseUid = retryCred.user.uid;
            } catch {
              console.warn('[Login] Firebase Auth password out of sync for', emailLow, '— logging in via local hash.');
            }
          }
          // Other create errors ignored — user still gets in-app access via the hash
        }
      }

      // ── 2FA: opt-in for any role via twoFaEnabled flag ──────────────────────
      // SUPER_ADMIN 2FA is not forced — it must be explicitly enabled in their
      // user doc (twoFaEnabled: true) once email delivery is confirmed working.
      const needs2FA = !!user.twoFaEnabled;
      if (needs2FA) {
        pendingLoginRef.current = { user, firebaseUid };
        await sendOTP({ userId: user.id, email: user.email, name: user.name });
        setOtpStep(true);
        startCooldown(60);
        return;
      }

      await completeLogin(user, firebaseUid);
    } finally {
      setLoading(false);
    }
  };

  // ── OTP / 2FA screen ───────────────────────────────────────────────────
  if (otpStep) {
    const maskedEmail = pendingLoginRef.current?.user?.email?.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(Math.max(2, b.length)) + c) || '…';
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Icon name="shield" size={32} className="text-on-primary" />
            </div>
            <h1 className="font-black text-4xl text-primary tracking-tight">Minsouah</h1>
            <p className="text-on-surface-variant text-sm mt-1 tracking-widest uppercase">
              Vérification en deux étapes
            </p>
          </div>

          <div className="bg-surface rounded-3xl shadow-xl overflow-hidden border border-outline-variant/20">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon name="mark_email_read" size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="font-bold text-on-surface leading-tight">Code de vérification</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Envoyé à <strong>{maskedEmail}</strong>
                  </p>
                </div>
              </div>

              <p className="text-sm text-on-surface-variant mb-5">
                Entrez le code à <strong>6 chiffres</strong> reçu par email. Il expire dans <strong>5 minutes</strong>.
              </p>

              <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-on-surface">Code OTP</label>
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
                    required
                  />
                </div>

                {otpError && (
                  <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-xl px-3 py-2.5">
                    <Icon name="error" size={16} className="text-error flex-shrink-0 mt-0.5" />
                    <p className="text-error text-sm">{otpError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={otpLoading || otpCode.length < 6}
                  className="w-full py-3.5 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {otpLoading
                    ? <><Icon name="progress_activity" size={20} className="animate-spin" /> Vérification…</>
                    : <><Icon name="verified_user" size={20} /> Vérifier le code</>
                  }
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={handleOtpResend}
                    disabled={otpCooldown > 0}
                    className="text-sm font-semibold text-primary disabled:text-on-surface-variant disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                  >
                    <Icon name="refresh" size={16} />
                    {otpCooldown > 0 ? `Renvoyer dans ${otpCooldown}s` : 'Renvoyer le code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep(false);
                      setOtpCode('');
                      setOtpError('');
                      pendingLoginRef.current = null;
                      if (cooldownRef.current) clearInterval(cooldownRef.current);
                    }}
                    className="text-sm text-on-surface-variant hover:text-on-surface underline transition-colors"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>

            <div className="border-t border-outline-variant/10 px-6 py-3 flex items-center justify-center gap-2">
              <Icon name="lock" size={14} className="text-on-surface-variant" />
              <span className="text-xs text-on-surface-variant">
                Authentification à deux facteurs activée
              </span>
            </div>
          </div>

          <p className="text-center text-xs text-on-surface-variant mt-6">
            © {new Date().getFullYear()} Minsouah — Gestion immobilière Côte d'Ivoire
          </p>
        </div>
      </div>
    );
  }

  // ── Forgot-password screen ─────────────────────────────────────────────
  if (forgotMode) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <Icon name="lock_reset" size={32} className="text-on-primary" />
            </div>
            <h1 className="font-black text-4xl text-primary tracking-tight">Minsouah</h1>
            <p className="text-on-surface-variant text-sm mt-1 tracking-widest uppercase">Réinitialisation du mot de passe</p>
          </div>

          <div className="bg-surface rounded-3xl shadow-xl overflow-hidden border border-outline-variant/20 p-6">
            <form onSubmit={handleResetRequest} className="flex flex-col gap-4">
              <div>
                <h2 className="font-bold text-xl text-on-surface mb-1">Mot de passe oublié</h2>
                <p className="text-sm text-on-surface-variant">Entrez votre email. Nous vous enverrons un lien sécurisé pour définir un nouveau mot de passe.</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-on-surface">Adresse email</label>
                <div className="relative">
                  <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="votre@email.com" required autoFocus
                    className="w-full px-4 py-3 pl-11 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface" />
                  <Icon name="mail" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                </div>
              </div>
              {resetError && <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-xl px-3 py-2.5"><Icon name="error" size={16} className="text-error flex-shrink-0 mt-0.5" /><p className="text-error text-sm">{resetError}</p></div>}
              <button type="submit" disabled={resetLoading}
                className="w-full py-3.5 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {resetLoading ? <><Icon name="progress_activity" size={20} className="animate-spin" /> Envoi…</> : <><Icon name="send" size={20} /> Envoyer le lien</>}
              </button>
              <button type="button" onClick={closeForgot} className="text-sm text-on-surface-variant hover:text-on-surface underline transition-colors">← Retour à la connexion</button>
            </form>
          </div>
          <p className="text-center text-xs text-on-surface-variant mt-6">© {new Date().getFullYear()} Minsouah — Gestion immobilière Côte d'Ivoire</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Icon name="domain" size={32} className="text-on-primary" />
          </div>
          <h1 className="font-black text-4xl text-primary tracking-tight">Minsouah</h1>
          <p className="text-on-surface-variant text-sm mt-1 tracking-widest uppercase">
            L'immobilier réinventé
          </p>
        </div>

        <div className="bg-surface rounded-3xl shadow-xl overflow-hidden border border-outline-variant/20">
          <div className="p-6">
            <h2 className="font-bold text-xl text-on-surface mb-1">Connexion</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              Connectez-vous avec votre email et mot de passe.
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-on-surface">Adresse email</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full px-4 py-3 pl-11 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                    required
                    autoComplete="email"
                  />
                  <Icon name="mail" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-on-surface">Mot de passe</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pl-11 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface pr-12"
                    required
                    autoComplete="current-password"
                  />
                  <Icon name="lock" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <Icon name={showPass ? 'visibility_off' : 'visibility'} size={20} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={openForgot}
                  className="self-end text-xs font-semibold text-primary hover:text-primary/70 transition-colors mt-1"
                >
                  Mot de passe oublié ?
                </button>
              </div>

              {successMsg && (
                <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                  <Icon name="check_circle" size={16} className="text-green-700 flex-shrink-0 mt-0.5" />
                  <p className="text-green-700 text-sm">{successMsg}</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-xl px-3 py-2.5">
                  <Icon name="error" size={16} className="text-error flex-shrink-0 mt-0.5" />
                  <p className="text-error text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading
                  ? <><Icon name="progress_activity" size={20} className="animate-spin" /> Connexion…</>
                  : <><Icon name="login" size={20} /> Se connecter</>
                }
              </button>
            </form>
          </div>

          {/* Live indicator */}
          <div className="border-t border-outline-variant/10 px-6 py-3 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-on-surface-variant">
              Synchronisation temps réel — Firebase
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-on-surface-variant mt-6">
          © {new Date().getFullYear()} Minsouah — Gestion immobilière Côte d'Ivoire
        </p>
        <p className="text-center text-[10px] text-on-surface-variant/40 mt-1">v2.5 — 2026-05-17</p>
      </div>
    </div>
  );
}
