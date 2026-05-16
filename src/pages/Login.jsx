import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { verifyPwd } from '../lib/auth';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

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
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const emailLow = email.trim().toLowerCase();
      // Search across all users (unfiltered — needed before org context is established)
      const user = users.find((u) => u.email.toLowerCase() === emailLow);

      if (!user) { setError('Aucun compte trouvé avec cet email.'); return; }
      if (user.suspended) { setError("Ce compte a été suspendu. Contactez l'administrateur."); return; }

      // Check org suspension (SUPER_ADMIN bypasses)
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

      // ── Try Firebase email/password auth ────────────────────────────────
      try {
        const cred = await signInWithEmailAndPassword(auth, emailLow, password);
        firebaseUid = cred.user.uid;
      } catch (fbErr) {
        const isUnknown = ['auth/user-not-found', 'auth/invalid-credential', 'auth/wrong-password',
          'auth/invalid-email', 'auth/user-disabled'].includes(fbErr.code);
        if (!isUnknown) {
          // Real Firebase error (wrong password detected by Firebase)
          dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: emailLow, success: false } });
          const attempts = (user.failedAttempts || 0) + 1;
          setError(attempts >= 5
            ? 'Compte bloqué pour 15 minutes après 5 tentatives échouées.'
            : `Mot de passe incorrect. ${5 - attempts} tentative(s) restante(s).`);
          return;
        }
        // Fallback: verify against Firestore hash (legacy accounts not yet on Firebase Auth)
        const ok = await verifyPwd(password, user.password);
        if (!ok) {
          dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: emailLow, success: false } });
          const attempts = (user.failedAttempts || 0) + 1;
          setError(attempts >= 5
            ? 'Compte bloqué pour 15 minutes après 5 tentatives échouées.'
            : `Mot de passe incorrect. ${5 - attempts} tentative(s) restante(s).`);
          return;
        }
        // Lazy migration: create Firebase Auth account for this legacy user
        try {
          const newCred = await createUserWithEmailAndPassword(auth, emailLow, password);
          firebaseUid = newCred.user.uid;
        } catch { /* ignore — account may already exist */ }
      }

      // ── Write usersByUid for Firestore Rules enforcement ─────────────────
      if (firebaseUid) {
        setDoc(doc(db, 'workspaces', WS, 'usersByUid', firebaseUid), {
          userId: String(user.id),
          orgId: user.orgId || 'default',
          role: user.role,
          updatedAt: new Date().toISOString(),
        }, { merge: true }).catch(console.warn);
      }

      dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: emailLow, success: true } });
      dispatch({
        type: 'LOGIN',
        payload: {
          id: user.id, role: user.role, name: user.name, initials: user.initials,
          email: user.email, color: user.color, avatar: user.avatar || null,
          personId: user.personId || null, firstLogin: user.firstLogin || false,
          orgId: user.orgId || 'default',
        },
      });

      if (user.firstLogin) {
        navigate('/change-password');
      } else {
        navigate(ROLE_HOME[user.role] || '/');
      }
    } finally {
      setLoading(false);
    }
  };

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
