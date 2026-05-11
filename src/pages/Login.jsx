import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const ROLE_LABELS = {
  ADMIN: 'Administrateur',
  MANAGER: 'Manager',
  ACCOUNTANT: 'Comptable',
  TECHNICIAN: 'Technicien',
  OWNER: 'Propriétaire',
  TENANT: 'Locataire',
};

const ROLE_ICON = {
  ADMIN: 'admin_panel_settings',
  MANAGER: 'manage_history',
  ACCOUNTANT: 'calculate',
  TECHNICIAN: 'engineering',
  OWNER: 'manage_accounts',
  TENANT: 'person',
};

export default function Login() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [syncCode, setSyncCode] = useState('');
  const [syncError, setSyncError] = useState('');

  const users = state.users || [];

  const handleImportSync = () => {
    setSyncError('');
    try {
      const json = decodeURIComponent(escape(atob(syncCode.trim())));
      const parsed = JSON.parse(json);
      if (!parsed.users) { setSyncError('Code invalide — aucun compte trouvé.'); return; }
      dispatch({ type: 'IMPORT_STATE', payload: parsed });
      setShowSync(false);
      setSyncCode('');
    } catch {
      setSyncError("Code invalide. Vérifiez qu'il est complet.");
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const emailLow = email.trim().toLowerCase();
      const user = users.find(u => u.email.toLowerCase() === emailLow);

      if (!user) {
        setError('Aucun compte trouvé avec cet email.');
        setLoading(false);
        return;
      }

      // Check if account is locked
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remaining = Math.ceil((new Date(user.lockedUntil) - Date.now()) / 60000);
        setError(`Compte temporairement bloqué. Réessayez dans ${remaining} min.`);
        setLoading(false);
        return;
      }

      // Check if suspended
      if (user.suspended) {
        setError('Ce compte a été suspendu. Contactez l\'administrateur.');
        setLoading(false);
        return;
      }

      // Check password
      if (user.password !== password) {
        dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: user.email, success: false } });
        const attempts = (user.failedAttempts || 0) + 1;
        const remaining = 5 - attempts;
        if (remaining > 0) {
          setError(`Mot de passe incorrect. ${remaining} tentative(s) restante(s).`);
        } else {
          setError('Compte bloqué pour 15 minutes après 5 tentatives échouées.');
        }
        setLoading(false);
        return;
      }

      // Login success
      dispatch({ type: 'LOGIN_ATTEMPT', payload: { email: user.email, success: true } });
      dispatch({
        type: 'LOGIN',
        payload: {
          id: user.id,
          role: user.role,
          name: user.name,
          initials: user.initials,
          email: user.email,
          color: user.color,
          avatar: user.avatar || null,
          personId: user.personId || null,
          firstLogin: user.firstLogin || false,
        },
      });

      if (user.firstLogin) {
        navigate('/change-password');
      } else {
        const dest =
          user.role === 'TENANT' ? '/portal/tenant' :
          user.role === 'OWNER'  ? '/portal/owner' : '/';
        navigate(dest);
      }
      setLoading(false);
    }, 600);
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
          <p className="text-on-surface-variant text-sm mt-1 tracking-widest uppercase">L'immobilier réinventé</p>
        </div>

        <div className="bg-surface rounded-3xl shadow-xl overflow-hidden border border-outline-variant/20">
          <div className="p-6">
            <h2 className="font-bold text-xl text-on-surface mb-1">Connexion</h2>
            <p className="text-sm text-on-surface-variant mb-6">
              Tous les utilisateurs se connectent avec leur email et mot de passe.
            </p>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-on-surface">Adresse email</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
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
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pl-11 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface pr-12"
                    required
                    autoComplete="current-password"
                  />
                  <Icon name="lock" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
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
                  ? <><Icon name="progress_activity" size={20} className="animate-spin" /> Connexion...</>
                  : <><Icon name="login" size={20} /> Se connecter</>
                }
              </button>
            </form>
          </div>

          <div className="border-t border-outline-variant/10">
            <button
              type="button"
              onClick={() => setShowSync(v => !v)}
              className="w-full py-3 text-sm text-on-surface-variant hover:text-primary flex items-center justify-center gap-2 transition-colors"
            >
              <Icon name="sync" size={15} />
              Synchroniser depuis un autre appareil
              <Icon name={showSync ? 'expand_less' : 'expand_more'} size={15} />
            </button>
            {showSync && (
              <div className="px-6 pb-5 flex flex-col gap-3">
                <p className="text-xs text-on-surface-variant text-center">
                  Collez le code généré depuis <strong>Paramètres → Utilisateurs → Sync</strong>
                </p>
                <textarea
                  value={syncCode}
                  onChange={e => setSyncCode(e.target.value)}
                  placeholder="Collez votre code de synchronisation ici..."
                  rows={3}
                  className="w-full border border-outline-variant/40 bg-surface-container rounded-xl px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                />
                {syncError && (
                  <div className="flex items-center gap-2 text-xs text-error">
                    <Icon name="error" size={13} /> {syncError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleImportSync}
                  disabled={!syncCode.trim()}
                  className="py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  <Icon name="download" size={16} /> Importer les données
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bouton de récupération d'urgence */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Réinitialiser la session locale ? Vos données seront rechargées depuis le serveur.')) {
                localStorage.removeItem('minsouah_v1');
                window.location.reload();
              }
            }}
            className="text-xs text-on-surface-variant/50 hover:text-on-surface-variant transition-colors underline underline-offset-2"
          >
            Problème de connexion ? Réinitialiser la session
          </button>
        </div>

        <p className="text-center text-xs text-on-surface-variant mt-4">
          © {new Date().getFullYear()} Minsouah — Gestion immobilière Côte d'Ivoire
        </p>
      </div>
    </div>
  );
}
