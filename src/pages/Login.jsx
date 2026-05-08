import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const DEMO_USERS = [
  {
    role: 'ADMIN',
    name: 'Administrateur',
    email: 'admin@minsouah.ci',
    password: 'admin123',
    initials: 'AD',
    color: 'bg-primary text-on-primary',
    description: 'Accès complet à toutes les fonctionnalités',
  },
];

export default function Login() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('admin'); // 'admin' | 'tenant' | 'owner'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdminLogin = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      if (email === 'admin@minsouah.ci' && password === 'admin123') {
        dispatch({
          type: 'LOGIN',
          payload: { role: 'ADMIN', name: 'Administrateur', initials: 'AD', email },
        });
        navigate('/');
      } else {
        setError('Email ou mot de passe incorrect.');
      }
      setLoading(false);
    }, 600);
  };

  const handlePortalLogin = (role) => {
    if (!selectedId) { setError('Veuillez sélectionner un compte.'); return; }
    setError('');
    setLoading(true);
    const list = role === 'TENANT' ? state.tenants : state.owners;
    const person = list.find(p => p.id === selectedId);
    setTimeout(() => {
      dispatch({
        type: 'LOGIN',
        payload: {
          role,
          name: person.name,
          initials: person.initials,
          email: person.email,
          personId: person.id,
        },
      });
      navigate(role === 'TENANT' ? '/portal/tenant' : '/portal/owner');
      setLoading(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-black text-4xl text-primary tracking-tight">Minsouah</h1>
          <p className="text-on-surface-variant text-sm mt-1 tracking-widest uppercase">L'immobilier réinventé</p>
        </div>

        <div className="bg-surface rounded-3xl shadow-xl overflow-hidden border border-outline-variant/20">
          {/* Tabs */}
          <div className="flex border-b border-outline-variant/20">
            {[
              { key: 'admin', label: 'Admin', icon: 'admin_panel_settings' },
              { key: 'tenant', label: 'Locataire', icon: 'person' },
              { key: 'owner', label: 'Propriétaire', icon: 'manage_accounts' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setError(''); setSelectedId(null); }}
                className={`flex-1 flex flex-col items-center gap-1 py-4 text-xs font-semibold transition-all ${
                  tab === t.key
                    ? 'text-primary border-b-2 border-primary bg-primary-container/30'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <Icon name={t.icon} size={20} filled={tab === t.key} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* ── Admin login ─────────────────────────────────── */}
            {tab === 'admin' && (
              <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
                <div>
                  <p className="text-sm text-on-surface-variant mb-4">
                    Connectez-vous avec vos identifiants administrateur.
                  </p>
                  <div className="bg-primary-container/30 rounded-xl p-3 flex items-center gap-3 mb-4">
                    <Icon name="info" size={16} className="text-primary flex-shrink-0" />
                    <p className="text-xs text-on-surface-variant">
                      Demo — <span className="font-mono font-bold text-on-surface">admin@minsouah.ci</span> / <span className="font-mono font-bold text-on-surface">admin123</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-on-surface">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@minsouah.ci"
                    className="w-full px-4 py-3 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-on-surface">Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                    >
                      <Icon name={showPass ? 'visibility_off' : 'visibility'} size={20} />
                    </button>
                  </div>
                </div>

                {error && <p className="text-error text-sm text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading ? <Icon name="progress_activity" size={20} className="animate-spin" /> : <Icon name="login" size={20} />}
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>
              </form>
            )}

            {/* ── Tenant / Owner portal ───────────────────────── */}
            {(tab === 'tenant' || tab === 'owner') && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-on-surface-variant">
                  {tab === 'tenant'
                    ? 'Sélectionnez votre compte pour accéder à votre espace locataire.'
                    : 'Sélectionnez votre compte pour accéder à votre espace propriétaire.'}
                </p>

                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                  {(tab === 'tenant' ? state.tenants : state.owners).map(person => (
                    <button
                      key={person.id}
                      onClick={() => { setSelectedId(person.id); setError(''); }}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                        selectedId === person.id
                          ? 'border-primary bg-primary-container/40'
                          : 'border-outline-variant/20 hover:border-outline-variant/60 hover:bg-surface-container-high'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${person.color}`}>
                        {person.initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface text-sm truncate">{person.name}</p>
                        <p className="text-xs text-on-surface-variant truncate">{person.email}</p>
                      </div>
                      {selectedId === person.id && (
                        <Icon name="check_circle" size={20} className="text-primary ml-auto flex-shrink-0" filled />
                      )}
                    </button>
                  ))}
                </div>

                {error && <p className="text-error text-sm text-center">{error}</p>}

                <button
                  onClick={() => handlePortalLogin(tab === 'tenant' ? 'TENANT' : 'OWNER')}
                  disabled={loading || !selectedId}
                  className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  {loading ? <Icon name="progress_activity" size={20} className="animate-spin" /> : <Icon name="login" size={20} />}
                  {loading ? 'Connexion...' : 'Accéder à mon espace'}
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-on-surface-variant mt-6">
          © {new Date().getFullYear()} Minsouah — Gestion immobilière Côte d'Ivoire
        </p>
      </div>
    </div>
  );
}
