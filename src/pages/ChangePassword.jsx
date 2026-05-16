import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import { hashPwd, verifyPwd } from '../lib/auth';

const WELCOME_GUIDES = {
  ORGANIZATION_ADMIN: {
    title: 'Bienvenue, Administrateur !',
    color: 'bg-primary',
    icon: 'admin_panel_settings',
    steps: [
      { icon: 'group', label: 'Gérer les utilisateurs', desc: 'Créez des comptes pour vos équipes, locataires et propriétaires dans Paramètres → Utilisateurs.' },
      { icon: 'apartment', label: 'Ajouter vos biens', desc: 'Enregistrez votre patrimoine immobilier dans la section Patrimoine.' },
      { icon: 'contract', label: 'Créer des contrats', desc: 'Associez locataires et biens via des contrats dans Gestion Locative.' },
      { icon: 'payments', label: 'Suivre les paiements', desc: 'Enregistrez les loyers et suivez les impayés dans Paiements.' },
    ],
  },
  AGENT: {
    title: 'Bienvenue, Agent !',
    color: 'bg-secondary',
    icon: 'manage_history',
    steps: [
      { icon: 'apartment', label: 'Consulter le patrimoine', desc: 'Accédez à la liste des biens gérés dans Patrimoine.' },
      { icon: 'contract', label: 'Suivi des contrats', desc: 'Gérez les baux et les renouvellements dans Gestion Locative.' },
      { icon: 'payments', label: 'Paiements', desc: 'Suivez les encaissements et les retards dans Paiements.' },
      { icon: 'engineering', label: 'Maintenance', desc: 'Traitez les tickets de maintenance dans la section dédiée.' },
    ],
  },
  // legacy roles (kept until migration runs)
  ADMIN: {
    title: 'Bienvenue, Administrateur !',
    color: 'bg-primary',
    icon: 'admin_panel_settings',
    steps: [
      { icon: 'group', label: 'Gérer les utilisateurs', desc: 'Créez des comptes pour vos équipes, locataires et propriétaires dans Paramètres → Utilisateurs.' },
      { icon: 'apartment', label: 'Ajouter vos biens', desc: 'Enregistrez votre patrimoine immobilier dans la section Patrimoine.' },
      { icon: 'contract', label: 'Créer des contrats', desc: 'Associez locataires et biens via des contrats dans Gestion Locative.' },
      { icon: 'payments', label: 'Suivre les paiements', desc: 'Enregistrez les loyers et suivez les impayés dans Paiements.' },
    ],
  },
  MANAGER: {
    title: 'Bienvenue, Manager !',
    color: 'bg-secondary',
    icon: 'manage_history',
    steps: [
      { icon: 'apartment', label: 'Consulter le patrimoine', desc: 'Accédez à la liste des biens gérés dans Patrimoine.' },
      { icon: 'contract', label: 'Suivi des contrats', desc: 'Gérez les baux et les renouvellements dans Gestion Locative.' },
      { icon: 'payments', label: 'Paiements', desc: 'Suivez les encaissements et les retards dans Paiements.' },
      { icon: 'engineering', label: 'Maintenance', desc: 'Traitez les tickets de maintenance dans la section dédiée.' },
    ],
  },
  ACCOUNTANT: {
    title: 'Bienvenue, Comptable !',
    color: 'bg-tertiary',
    icon: 'calculate',
    steps: [
      { icon: 'account_balance_wallet', label: 'Rapports financiers', desc: 'Consultez les rapports dans la section Finances.' },
      { icon: 'payments', label: 'Paiements', desc: 'Enregistrez et vérifiez les paiements de loyers.' },
      { icon: 'receipt', label: 'Transactions', desc: 'Suivez toutes les opérations comptables.' },
    ],
  },
  TECHNICIAN: {
    title: 'Bienvenue, Technicien !',
    color: 'bg-secondary',
    icon: 'engineering',
    steps: [
      { icon: 'engineering', label: 'Vos tickets', desc: 'Consultez et mettez à jour les tickets de maintenance qui vous sont assignés.' },
      { icon: 'check_circle', label: 'Clôturer les interventions', desc: 'Marquez les interventions terminées pour informer les locataires.' },
    ],
  },
  TENANT: {
    title: 'Bienvenue sur votre Espace Locataire !',
    color: 'bg-secondary',
    icon: 'person',
    steps: [
      { icon: 'home', label: 'Votre logement', desc: 'Consultez les informations de votre bien et votre contrat de bail.' },
      { icon: 'payments', label: 'Payer votre loyer', desc: 'Effectuez vos paiements en ligne via Mobile Money (Orange, MTN, Wave, Moov).' },
      { icon: 'receipt_long', label: 'Vos quittances', desc: 'Téléchargez vos quittances de loyer depuis l\'onglet Paiements.' },
      { icon: 'engineering', label: 'Signaler un problème', desc: 'Créez un ticket de maintenance depuis l\'onglet Maintenance.' },
    ],
  },
  OWNER: {
    title: 'Bienvenue sur votre Espace Propriétaire !',
    color: 'bg-tertiary',
    icon: 'manage_accounts',
    steps: [
      { icon: 'apartment', label: 'Vos biens', desc: 'Consultez l\'état de vos propriétés et leur taux d\'occupation.' },
      { icon: 'account_balance_wallet', label: 'Vos revenus', desc: 'Suivez vos revenus locatifs mensuels et annuels.' },
      { icon: 'trending_up', label: 'Tableaux de bord', desc: 'Analysez les performances de votre patrimoine avec des graphiques.' },
    ],
  },
};

function WelcomeGuide({ user, onClose }) {
  const guide = WELCOME_GUIDES[user?.role] || WELCOME_GUIDES.TENANT;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className={`${guide.color} p-6 text-white`}>
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-3">
            <Icon name={guide.icon} size={30} className="text-white" />
          </div>
          <h2 className="font-black text-2xl leading-tight">{guide.title}</h2>
          <p className="text-white/80 text-sm mt-1">Voici ce que vous pouvez faire sur la plateforme.</p>
        </div>
        <div className="p-6 flex flex-col gap-3">
          {guide.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-surface-container rounded-xl">
              <div className="w-9 h-9 bg-primary-container rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon name={s.icon} size={18} className="text-on-primary-container" />
              </div>
              <div>
                <p className="font-semibold text-on-surface text-sm">{s.label}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
          <button onClick={onClose}
            className="mt-2 w-full py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
            <Icon name="rocket_launch" size={18} />Commencer
          </button>
        </div>
      </div>
    </div>
  );
}

function StrengthBar({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ['', 'Faible', 'Moyen', 'Bon', 'Fort'];
  const colors = ['', 'bg-error', 'bg-amber-500', 'bg-yellow-400', 'bg-green-500'];

  if (!password) return null;
  return (
    <div className="mt-1">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= score ? colors[score] : 'bg-outline-variant/30'}`} />
        ))}
      </div>
      <p className={`text-xs ${score <= 1 ? 'text-error' : score === 2 ? 'text-amber-600' : score === 3 ? 'text-yellow-600' : 'text-green-600'}`}>
        {labels[score]}
      </p>
    </div>
  );
}

export default function ChangePassword() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const user = state.currentUser;
  const isFirstLogin = user?.firstLogin;
  const [showWelcome, setShowWelcome] = useState(false);
  const [pendingDest, setPendingDest] = useState(null);

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isFirstLogin) {
      const dbUser = (state.users || []).find(u => u.email === user.email);
      const ok = await verifyPwd(current, dbUser?.password);
      if (!ok) {
        setError('Mot de passe actuel incorrect.');
        return;
      }
    }

    if (next.length < 8) {
      setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (next !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!isFirstLogin && next === current) {
      setError('Le nouveau mot de passe doit être différent de l\'ancien.');
      return;
    }

    setLoading(true);
    const hashedNext = await hashPwd(next);
    dispatch({ type: 'CHANGE_PASSWORD', payload: { email: user.email, newPassword: hashedNext } });
    toast('Mot de passe modifié avec succès !', 'success');
    const dest =
      user.role === 'TENANT' ? '/portal/tenant' :
      user.role === 'OWNER'  ? '/portal/owner' : '/';
    if (isFirstLogin) {
      setPendingDest(dest);
      setShowWelcome(true);
    } else {
      navigate(dest);
    }
    setLoading(false);
  };

  return (
    <>
    {showWelcome && <WelcomeGuide user={user} onClose={() => { setShowWelcome(false); navigate(pendingDest || '/'); }} />}
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg ${isFirstLogin ? 'bg-amber-500' : 'bg-primary'}`}>
            <Icon name={isFirstLogin ? 'key' : 'lock_reset'} size={32} className="text-white" />
          </div>
          <h1 className="font-black text-3xl text-on-surface">
            {isFirstLogin ? 'Première connexion' : 'Changer le mot de passe'}
          </h1>
          <p className="text-on-surface-variant text-sm mt-2">
            {isFirstLogin
              ? 'Pour sécuriser votre compte, veuillez définir un nouveau mot de passe.'
              : 'Entrez votre mot de passe actuel puis définissez le nouveau.'}
          </p>
        </div>

        <div className="bg-surface rounded-3xl shadow-xl border border-outline-variant/20 overflow-hidden">
          {isFirstLogin && (
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-center gap-3">
              <Icon name="info" size={18} className="text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                Bienvenue <strong>{user.name}</strong> ! Créez votre mot de passe personnel pour continuer.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
            {!isFirstLogin && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-on-surface">Mot de passe actuel</label>
                <div className="relative">
                  <input
                    type={show.current ? 'text' : 'password'}
                    value={current}
                    onChange={e => setCurrent(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pl-11 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface pr-12"
                    required
                  />
                  <Icon name="lock" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <button type="button" onClick={() => setShow(s => ({ ...s, current: !s.current }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                    <Icon name={show.current ? 'visibility_off' : 'visibility'} size={18} />
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-on-surface">Nouveau mot de passe</label>
              <div className="relative">
                <input
                  type={show.next ? 'text' : 'password'}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  className="w-full px-4 py-3 pl-11 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface pr-12"
                  required
                  minLength={8}
                />
                <Icon name="lock_open" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <button type="button" onClick={() => setShow(s => ({ ...s, next: !s.next }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Icon name={show.next ? 'visibility_off' : 'visibility'} size={18} />
                </button>
              </div>
              <StrengthBar password={next} />
              <ul className="mt-2 grid grid-cols-2 gap-1">
                {[
                  { ok: next.length >= 8, label: '8 caractères min' },
                  { ok: /[A-Z]/.test(next), label: 'Majuscule' },
                  { ok: /[0-9]/.test(next), label: 'Chiffre' },
                  { ok: /[^A-Za-z0-9]/.test(next), label: 'Caractère spécial' },
                ].map(r => (
                  <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? 'text-green-600' : 'text-on-surface-variant'}`}>
                    <Icon name={r.ok ? 'check_circle' : 'radio_button_unchecked'} size={14} filled={r.ok} />
                    {r.label}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-semibold text-on-surface">Confirmer le nouveau mot de passe</label>
              <div className="relative">
                <input
                  type={show.confirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className={`w-full px-4 py-3 pl-11 rounded-xl border bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface pr-12 ${
                    confirm && next !== confirm ? 'border-error' : 'border-outline-variant/40'
                  }`}
                  required
                />
                <Icon name="lock" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <button type="button" onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  <Icon name={show.confirm ? 'visibility_off' : 'visibility'} size={18} />
                </button>
              </div>
              {confirm && next !== confirm && (
                <p className="text-xs text-error mt-0.5">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-error/10 border border-error/20 rounded-xl px-3 py-2.5">
                <Icon name="error" size={16} className="text-error flex-shrink-0 mt-0.5" />
                <p className="text-error text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || next.length < 8 || next !== confirm}
              className="w-full py-3.5 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <><Icon name="progress_activity" size={20} className="animate-spin" /> Enregistrement...</>
                : <><Icon name="check_circle" size={20} /> Confirmer le mot de passe</>
              }
            </button>

            {!isFirstLogin && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="w-full py-3 text-on-surface-variant font-semibold text-sm rounded-xl hover:bg-surface-container transition-colors"
              >
                Annuler
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
