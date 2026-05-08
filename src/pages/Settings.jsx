import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const TABS = [
  { key: 'profile',  label: 'Mon Profil',       icon: 'account_circle' },
  { key: 'org',      label: 'Organisation',      icon: 'business' },
  { key: 'users',    label: 'Utilisateurs',      icon: 'group' },
  { key: 'notif',    label: 'Notifications',     icon: 'notifications' },
  { key: 'security', label: 'Sécurité',          icon: 'lock' },
];

export default function Settings() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { currentUser, orgSettings } = state;
  const [tab, setTab] = useState('profile');
  const [saved, setSaved] = useState(false);

  // Profile form
  const [profile, setProfile] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
  });

  // Org form
  const [org, setOrg] = useState({
    companyName: orgSettings?.companyName || 'Minsouah Immobilier',
    address: orgSettings?.address || 'Abidjan, Côte d\'Ivoire',
    phone: orgSettings?.phone || '',
    email: orgSettings?.email || '',
    currency: orgSettings?.currency || 'XOF',
    language: orgSettings?.language || 'fr',
  });

  // Notifications
  const [notif, setNotif] = useState({
    whatsapp: orgSettings?.notif?.whatsapp ?? true,
    email: orgSettings?.notif?.email ?? true,
    rentReminder: orgSettings?.notif?.rentReminder ?? true,
    paymentConfirm: orgSettings?.notif?.paymentConfirm ?? true,
    overdueAlert: orgSettings?.notif?.overdueAlert ?? true,
    maintenanceUpdate: orgSettings?.notif?.maintenanceUpdate ?? false,
  });

  // Security
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [showUsers, setShowUsers] = useState(false);

  const save = (type, data) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { type, data } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
    navigate('/login');
  };

  const handlePwChange = (e) => {
    e.preventDefault();
    if (pwForm.current !== 'admin123') { setPwError('Mot de passe actuel incorrect.'); return; }
    if (pwForm.next.length < 8) { setPwError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return; }
    setPwError('');
    dispatch({ type: 'UPDATE_SETTINGS', payload: { type: 'password', data: { password: pwForm.next } } });
    setPwForm({ current: '', next: '', confirm: '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-margin max-w-4xl mx-auto">
      {/* Toast */}
      {saved && (
        <div className="fixed top-6 right-6 z-50 bg-tertiary text-on-tertiary px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 animate-pulse">
          <Icon name="check_circle" size={18} filled />
          Modifications enregistrées
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar tabs */}
        <div className="md:w-52 flex-shrink-0">
          <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all text-left ${
                  tab === t.key
                    ? 'bg-primary-container text-on-primary-container border-l-4 border-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <Icon name={t.icon} size={18} filled={tab === t.key} />
                {t.label}
              </button>
            ))}
            <div className="border-t border-outline-variant/20">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-error hover:bg-error-container/40 transition-all text-left"
              >
                <Icon name="logout" size={18} />
                Déconnexion
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">

          {/* ── Profil ─────────────────────────────────────────── */}
          {tab === 'profile' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <Icon name="account_circle" filled /> Mon Profil
              </h2>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-black text-xl">
                  {currentUser?.initials || 'AD'}
                </div>
                <div>
                  <p className="font-bold text-on-surface">{currentUser?.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    currentUser?.role === 'ADMIN' ? 'bg-primary-container text-on-primary-container' :
                    currentUser?.role === 'TENANT' ? 'bg-secondary-container text-on-secondary-container' :
                    'bg-tertiary-container text-on-tertiary-container'
                  }`}>
                    {currentUser?.role === 'ADMIN' ? 'Administrateur' :
                     currentUser?.role === 'TENANT' ? 'Locataire' : 'Propriétaire'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'name', label: 'Nom complet', icon: 'badge' },
                  { key: 'email', label: 'Email', icon: 'email' },
                  { key: 'phone', label: 'Téléphone', icon: 'phone' },
                ].map(f => (
                  <div key={f.key} className={f.key === 'name' ? 'md:col-span-2' : ''}>
                    <label className="text-sm font-medium text-on-surface-variant mb-1 flex items-center gap-1">
                      <Icon name={f.icon} size={14} /> {f.label}
                    </label>
                    <input
                      value={profile[f.key]}
                      onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => save('profile', profile)}
                className="mt-6 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Icon name="save" size={18} /> Enregistrer
              </button>
            </div>
          )}

          {/* ── Organisation ───────────────────────────────────── */}
          {tab === 'org' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <Icon name="business" filled /> Organisation
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'companyName', label: 'Nom de la société', span: true },
                  { key: 'address', label: 'Adresse', span: true },
                  { key: 'phone', label: 'Téléphone' },
                  { key: 'email', label: 'Email professionnel' },
                ].map(f => (
                  <div key={f.key} className={f.span ? 'md:col-span-2' : ''}>
                    <label className="text-sm font-medium text-on-surface-variant mb-1 block">{f.label}</label>
                    <input
                      value={org[f.key]}
                      onChange={e => setOrg(o => ({ ...o, [f.key]: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                    />
                  </div>
                ))}

                <div>
                  <label className="text-sm font-medium text-on-surface-variant mb-1 block">Devise</label>
                  <select
                    value={org.currency}
                    onChange={e => setOrg(o => ({ ...o, currency: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                  >
                    <option value="XOF">XOF — Franc CFA (BCEAO)</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="USD">USD — Dollar US</option>
                    <option value="GHS">GHS — Cedi ghanéen</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-on-surface-variant mb-1 block">Langue</label>
                  <select
                    value={org.language}
                    onChange={e => setOrg(o => ({ ...o, language: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <button
                onClick={() => save('org', org)}
                className="mt-6 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Icon name="save" size={18} /> Enregistrer
              </button>
            </div>
          )}

          {/* ── Utilisateurs ───────────────────────────────────── */}
          {tab === 'users' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-lg text-on-surface flex items-center gap-2">
                  <Icon name="group" filled /> Utilisateurs
                </h2>
                <button
                  onClick={() => setShowUsers(v => !v)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Icon name="person_add" size={16} /> Ajouter
                </button>
              </div>

              {/* Comptes Admin */}
              <div className="mb-6">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Administrateurs</p>
                <div className="flex items-center gap-3 p-3 bg-surface-container-high rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm">AD</div>
                  <div className="flex-1">
                    <p className="font-semibold text-on-surface text-sm">Administrateur</p>
                    <p className="text-xs text-on-surface-variant">admin@minsouah.ci</p>
                  </div>
                  <span className="text-xs bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full font-semibold">Admin</span>
                </div>
              </div>

              {/* Locataires */}
              <div className="mb-6">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Locataires ({state.tenants.length})</p>
                <div className="flex flex-col gap-2">
                  {state.tenants.map(t => (
                    <div key={t.id} className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${t.color}`}>{t.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-on-surface text-sm truncate">{t.name}</p>
                        <p className="text-xs text-on-surface-variant truncate">{t.email}</p>
                      </div>
                      <span className="text-xs bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Locataire</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Propriétaires */}
              <div>
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Propriétaires ({state.owners.length})</p>
                <div className="flex flex-col gap-2">
                  {state.owners.map(o => (
                    <div key={o.id} className="flex items-center gap-3 p-3 bg-surface-container rounded-xl">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${o.color}`}>{o.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-on-surface text-sm truncate">{o.name}</p>
                        <p className="text-xs text-on-surface-variant truncate">{o.email}</p>
                      </div>
                      <span className="text-xs bg-tertiary-container text-on-tertiary-container px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Propriétaire</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add user form */}
              {showUsers && (
                <div className="mt-6 p-4 bg-surface-container rounded-2xl border border-outline-variant/20">
                  <p className="font-semibold text-on-surface mb-4">Ajouter un locataire ou propriétaire</p>
                  <p className="text-sm text-on-surface-variant">
                    Pour ajouter des locataires et propriétaires, utilisez les pages
                    <span className="font-semibold text-primary"> Gestion Locative</span> et
                    <span className="font-semibold text-primary"> Patrimoine</span>.
                    Ils apparaîtront automatiquement ici.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Notifications ──────────────────────────────────── */}
          {tab === 'notif' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <Icon name="notifications" filled /> Notifications
              </h2>

              <div className="flex flex-col gap-1">
                {/* Channels */}
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">Canaux</p>
                {[
                  { key: 'whatsapp', label: 'WhatsApp Business', sub: 'Rappels et confirmations par WhatsApp', icon: 'chat' },
                  { key: 'email', label: 'Email', sub: 'Notifications par e-mail', icon: 'email' },
                ].map(n => (
                  <div key={n.key} className="flex items-center justify-between p-4 bg-surface-container rounded-xl mb-2">
                    <div className="flex items-center gap-3">
                      <Icon name={n.icon} size={20} className="text-primary" />
                      <div>
                        <p className="font-medium text-on-surface text-sm">{n.label}</p>
                        <p className="text-xs text-on-surface-variant">{n.sub}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setNotif(v => ({ ...v, [n.key]: !v[n.key] }))}
                      className={`relative w-12 h-6 rounded-full transition-colors ${notif[n.key] ? 'bg-primary' : 'bg-outline-variant'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${notif[n.key] ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}

                {/* Events */}
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2 mt-2">Événements</p>
                {[
                  { key: 'rentReminder', label: 'Rappels de loyer', sub: 'J-5 avant échéance' },
                  { key: 'paymentConfirm', label: 'Confirmation de paiement', sub: 'À chaque encaissement' },
                  { key: 'overdueAlert', label: 'Alertes impayés', sub: 'Loyers en retard' },
                  { key: 'maintenanceUpdate', label: 'Suivi maintenance', sub: 'Mises à jour des tickets' },
                ].map(n => (
                  <div key={n.key} className="flex items-center justify-between p-4 bg-surface-container rounded-xl mb-2">
                    <div>
                      <p className="font-medium text-on-surface text-sm">{n.label}</p>
                      <p className="text-xs text-on-surface-variant">{n.sub}</p>
                    </div>
                    <button
                      onClick={() => setNotif(v => ({ ...v, [n.key]: !v[n.key] }))}
                      className={`relative w-12 h-6 rounded-full transition-colors ${notif[n.key] ? 'bg-primary' : 'bg-outline-variant'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${notif[n.key] ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => save('notif', notif)}
                className="mt-2 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Icon name="save" size={18} /> Enregistrer
              </button>
            </div>
          )}

          {/* ── Sécurité ───────────────────────────────────────── */}
          {tab === 'security' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <Icon name="lock" filled /> Sécurité
              </h2>

              <form onSubmit={handlePwChange} className="flex flex-col gap-4 max-w-sm">
                <p className="text-sm text-on-surface-variant">Modifiez votre mot de passe administrateur.</p>
                {[
                  { key: 'current', label: 'Mot de passe actuel' },
                  { key: 'next', label: 'Nouveau mot de passe' },
                  { key: 'confirm', label: 'Confirmer le nouveau mot de passe' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-sm font-medium text-on-surface-variant mb-1 block">{f.label}</label>
                    <input
                      type="password"
                      value={pwForm[f.key]}
                      onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                      required
                    />
                  </div>
                ))}
                {pwError && <p className="text-error text-sm">{pwError}</p>}
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 w-fit"
                >
                  <Icon name="lock_reset" size={18} /> Changer le mot de passe
                </button>
              </form>

              <div className="mt-8 p-4 bg-error-container/30 rounded-xl border border-error/20">
                <p className="font-semibold text-error mb-1 text-sm flex items-center gap-2">
                  <Icon name="warning" size={16} /> Zone dangereuse
                </p>
                <p className="text-xs text-on-surface-variant mb-3">Réinitialiser toutes les données de démonstration.</p>
                <button
                  onClick={() => { if (window.confirm('Réinitialiser toutes les données ?')) dispatch({ type: 'RESET' }); }}
                  className="px-4 py-2 bg-error text-on-error rounded-lg text-sm font-semibold hover:bg-error/90 transition-colors"
                >
                  Réinitialiser les données
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
