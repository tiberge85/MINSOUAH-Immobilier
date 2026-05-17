import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { verifyPwd } from '../lib/auth';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { sendOTP, verifyOTP } from '../lib/otp';
import { logSec, SEC } from '../lib/securityLog';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';

const ROLE_HOME = {
  SUPER_ADMIN:           '/superadmin',
  ORGANIZATION_ADMIN:    '/',
  AGENT:                 '/',
  TENANT:                '/portal/tenant',
  OWNER:                 '/portal/owner',
};

export default function Login() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [verifyEmail, setVerifyEmail] = useState(null); // { fbUser, email }
  const [resendMsg, setResendMsg]     = useState('');

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
    // Must await so usersByUid exists in Firestore BEFORE the page reloads.
    // Firestore rules for orgs/licenses/users depend on this doc — without it
    // all collection snapshots return empty and the user sees "Accès suspendu".
    if (firebaseUid) {
      try {
        await setDoc(doc(db, 'workspaces', WS, 'usersByUid', firebaseUid), {
          userId: String(user.id), orgId: user.orgId || 'default',
          role: user.role, updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (e) {
        console.warn('[usersByUid write]', e);
      }
    }
    dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: user.email, success: true } });
    // LOGIN saves the session to localStorage then calls window.location.reload().
    // Navigation after reload is handled by AppRoutes based on the session.
    dispatch({
      type: 'LOGIN',
      payload: {
        id: user.id, role: user.role, name: user.name, initials: user.initials,
        email: user.email, color: user.color, avatar: user.avatar || null,
        personId: user.personId || null, firstLogin: user.firstLogin || false,
        orgId: user.orgId || 'default',
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

  // ── Password login ─────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailLow = email.trim().toLowerCase();
      const user = users.find((u) => u.email.toLowerCase() === emailLow);

      if (!user) { setError('Aucun compte trouvé avec cet email.'); return; }
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
        if (!cred.user.emailVerified && user.emailVerificationRequired && user.role !== 'SUPER_ADMIN') {
          setVerifyEmail({ fbUser: cred.user, email: emailLow });
          return;
        }
      } catch (fbErr) {
        const isUnknown = ['auth/user-not-found', 'auth/invalid-credential', 'auth/wrong-password',
          'auth/invalid-email', 'auth/user-disabled'].includes(fbErr.code);
        if (!isUnknown) {
          dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: emailLow, success: false } });
          const attempts = (user.failedAttempts || 0) + 1;
          await logSec({ action: SEC.LOGIN_FAIL, userId: user.id, userEmail: emailLow, role: user.role, details: `Attempt ${attempts}` });
          setError(attempts >= 5
            ? 'Compte bloqué pour 15 minutes après 5 tentatives échouées.'
            : `Mot de passe incorrect. ${5 - attempts} tentative(s) restante(s).`);
          return;
        }
        const ok = await verifyPwd(password, user.password);
        if (!ok) {
          dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: emailLow, success: false } });
          const attempts = (user.failedAttempts || 0) + 1;
          setError(attempts >= 5
            ? 'Compte bloqué pour 15 minutes après 5 tentatives échouées.'
            : `Mot de passe incorrect. ${5 - attempts} tentative(s) restante(s).`);
          return;
        }
        try {
          const newCred = await createUserWithEmailAndPassword(auth, emailLow, password);
          firebaseUid = newCred.user.uid;
        } catch { /* ignore */ }
      }

      // ── 2FA: required for SUPER_ADMIN and twoFaEnabled ORGANIZATION_ADMIN ──
      const needs2FA = user.role === 'SUPER_ADMIN' || (user.role === 'ORGANIZATION_ADMIN' && user.twoFaEnabled);
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
              </div>

              {verifyEmail && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <Icon name="mark_email_unread" size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-800 text-sm">Email non vérifié</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Vérifiez votre boîte mail <strong>{verifyEmail.email}</strong> et cliquez sur le lien de confirmation.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await sendEmailVerification(verifyEmail.fbUser);
                          setResendMsg('Email de vérification renvoyé !');
                        } catch {
                          setResendMsg("Erreur lors de l'envoi — réessayez dans 1 min.");
                        }
                      }}
                      className="text-xs text-amber-800 underline font-semibold"
                    >
                      Renvoyer l'email
                    </button>
                    <button
                      type="button"
                      onClick={() => { setVerifyEmail(null); setResendMsg(''); }}
                      className="text-xs text-on-surface-variant underline"
                    >
                      Retour
                    </button>
                  </div>
                  {resendMsg && <p className="text-xs text-green-700 font-semibold">{resendMsg}</p>}
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
      </div>
    </div>
  );
}
