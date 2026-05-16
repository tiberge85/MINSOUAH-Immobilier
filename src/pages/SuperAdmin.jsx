import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getPlan, PLANS, fmtLimit } from '../lib/planLimits';
import { getLicenseStatusInfo, getDaysRemaining, createLicensePayload } from '../lib/licenses';
import { hashPwd } from '../lib/auth';
import { sendEmail } from '../lib/email';
import Icon from '../components/Icon';

const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

function StatCard({ label, value, sub, icon, color }) {
  return (
    <div className="bg-surface rounded-xl border border-outline-variant/20 p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-on-surface leading-none">{value}</p>
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mt-0.5">{label}</p>
        {sub && <p className="text-xs text-on-surface-variant mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function SuperAdmin() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [licenseModal, setLicenseModal] = useState(null); // { orgId, action: 'extend'|'suspend'|'activate'|'new' }
  const [extendDays, setExtendDays] = useState(30);
  const [newLicensePlan, setNewLicensePlan] = useState('pro');
  const [orgDeleteConfirm, setOrgDeleteConfirm] = useState(null);
  const [toast, setToast] = useState('');
  const [licSearch, setLicSearch] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [createOrgForm, setCreateOrgForm] = useState({ orgName: '', plan: 'pro', adminName: '', adminEmail: '', adminPassword: '' });
  const [createOrgLoading, setCreateOrgLoading] = useState(false);
  const [newLicenseOrgId, setNewLicenseOrgId] = useState('');

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const { organizations = [], users = [], properties = [], contracts = [], payments = [], activityLog = [] } = state;
  const licenses = state.licenses || [];

  // Global stats
  const activeOrgs = organizations.filter(o => o.active !== false).length;
  const activeLicenses = licenses.filter(l => {
    const info = getLicenseStatusInfo(l);
    return info.icon !== 'block' && info.icon !== 'cancel';
  }).length;
  const totalUsers = users.filter(u => u.role !== 'SUPER_ADMIN').length;
  const totalProperties = properties.length;
  const trialLicenses = licenses.filter(l => l.status === 'trial').length;
  const expiredLicenses = licenses.filter(l => {
    if (l.status === 'suspended') return false;
    if (l.expiresAt && new Date(l.expiresAt) < new Date()) return true;
    return l.status === 'expired';
  }).length;

  // Per-org stats
  const orgStats = useMemo(() => organizations.map(o => {
    const orgLicense = licenses.find(l => l.orgId === o.id);
    const orgUsers = users.filter(u => u.orgId === o.id);
    const orgProps = properties.filter(p => p.orgId === o.id);
    const orgContracts = contracts.filter(c => c.orgId === o.id);
    const orgPayments = payments.filter(p => p.orgId === o.id);
    const revenue = orgPayments.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
    return { ...o, license: orgLicense, userCount: orgUsers.length, propCount: orgProps.length, contractCount: orgContracts.length, revenue };
  }), [organizations, licenses, users, properties, contracts, payments]);

  const filteredOrgs = orgStats.filter(o => !orgSearch || o.name?.toLowerCase().includes(orgSearch.toLowerCase()));
  const filteredLicenses = licenses.filter(l => !licSearch ||
    l.key?.toLowerCase().includes(licSearch.toLowerCase()) ||
    organizations.find(o => o.id === l.orgId)?.name?.toLowerCase().includes(licSearch.toLowerCase())
  );

  // License actions
  const handleLicenseAction = async () => {
    if (!licenseModal) return;
    const { license, action } = licenseModal;

    if (action === 'suspend') {
      await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, status: 'suspended' } });
      showToast('Licence suspendue');
    } else if (action === 'activate') {
      await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, status: 'active' } });
      showToast('Licence activée');
    } else if (action === 'extend') {
      const newExpiry = new Date(Math.max(new Date(license.expiresAt || Date.now()), new Date()) .getTime() + extendDays * 24 * 60 * 60 * 1000);
      await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, status: 'active', expiresAt: newExpiry.toISOString() } });
      showToast(`Licence prolongée de ${extendDays} jours`);
    } else if (action === 'new') {
      const targetOrgId = license.orgId || newLicenseOrgId;
      if (!targetOrgId) { showToast('Sélectionnez une organisation'); return; }
      const payload = createLicensePayload({ orgId: targetOrgId, plan: newLicensePlan, trialDays: 365 });
      await dispatch({ type: 'ADD_LICENSE', payload: { ...payload, id: payload.key, status: 'active' } });
      const org = organizations.find(o => o.id === targetOrgId);
      if (org) await dispatch({ type: 'UPDATE_ORGANIZATION', payload: { ...org, plan: newLicensePlan, licenseKey: payload.key } });
      showToast('Nouvelle licence créée');
    }
    setLicenseModal(null);
  };

  const handleDeleteOrg = async () => {
    if (!orgDeleteConfirm) return;
    await dispatch({ type: 'DELETE_ORGANIZATION', payload: orgDeleteConfirm.id });
    showToast('Organisation supprimée');
    setOrgDeleteConfirm(null);
  };

  const handleCreateOrg = async () => {
    const { orgName, plan, adminName, adminEmail, adminPassword } = createOrgForm;
    if (!orgName.trim()) { showToast("Nom d'organisation requis"); return; }
    if (!adminName.trim() || !adminEmail.trim()) { showToast('Nom et email admin requis'); return; }
    if (adminPassword.length < 8) { showToast('Mot de passe : 8 caractères minimum'); return; }
    if (users.some(u => u.email === adminEmail.trim().toLowerCase())) { showToast('Cet email est déjà utilisé'); return; }
    setCreateOrgLoading(true);
    try {
      const orgId = `org_${Date.now()}`;
      const initials = adminName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const hashedPwd = await hashPwd(adminPassword);
      const license = createLicensePayload({ orgId, plan, trialDays: 365 });
      await dispatch({ type: 'ADD_ORGANIZATION', payload: { id: orgId, name: orgName.trim(), plan, active: true, licenseKey: license.key } });
      await dispatch({ type: 'ADD_LICENSE', payload: { ...license, id: license.key, status: 'active' } });
      await dispatch({ type: 'ADD_USER', payload: {
        name: adminName.trim(), email: adminEmail.trim().toLowerCase(),
        password: hashedPwd, role: 'ADMIN', orgId, initials,
        color: 'bg-primary-container text-on-primary-container', firstLogin: false,
      }});
      showToast(`Organisation "${orgName.trim()}" créée`);
      setShowCreateOrg(false);
      setCreateOrgForm({ orgName: '', plan: 'pro', adminName: '', adminEmail: '', adminPassword: '' });
    } catch (err) {
      showToast('Erreur : ' + (err.message || 'Réessayez'));
    } finally {
      setCreateOrgLoading(false);
    }
  };

  const TABS = [
    { id: 'overview',  label: 'Vue d\'ensemble', icon: 'dashboard' },
    { id: 'orgs',      label: 'Organisations',   icon: 'corporate_fare' },
    { id: 'licenses',  label: 'Licences',        icon: 'verified' },
    { id: 'activity',  label: 'Activité',        icon: 'history' },
    { id: 'platform',  label: 'Plateforme',      icon: 'settings_suggest' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {toast && (
        <div className="fixed top-5 right-5 z-[9999] bg-tertiary text-on-tertiary px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold">
          <Icon name="check_circle" size={16} /> {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-surface border-b border-outline-variant/20 px-4 sm:px-8 h-16 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Icon name="admin_panel_settings" size={20} className="text-on-primary" />
          </div>
          <div>
            <h1 className="font-black text-base text-on-surface">Super Admin</h1>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Minsouah Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreateOrg(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors">
            <Icon name="add_business" size={14} /> Nouvelle organisation
          </button>
          <button onClick={() => { dispatch({ type: 'LOGOUT' }); navigate('/login'); }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            title="Déconnexion">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Organisations" value={organizations.length} sub={`${activeOrgs} actives`} icon="corporate_fare" color="bg-primary/10 text-primary" />
          <StatCard label="Licences actives" value={activeLicenses} sub={`${trialLicenses} essais`} icon="verified" color="bg-green-100 text-green-700" />
          <StatCard label="Expirées" value={expiredLicenses} icon="cancel" color={expiredLicenses > 0 ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'} />
          <StatCard label="Utilisateurs" value={totalUsers} icon="group" color="bg-blue-100 text-blue-700" />
          <StatCard label="Biens" value={totalProperties} icon="apartment" color="bg-purple-100 text-purple-700" />
          <StatCard label="Contrats" value={contracts.length} icon="contract" color="bg-amber-100 text-amber-700" />
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 no-scrollbar">
          <div className="flex gap-1 bg-surface-container rounded-xl p-1 min-w-max sm:min-w-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-bold transition-all ${tab === t.id ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
                <Icon name={t.icon} size={15} filled={tab === t.id} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Plan distribution */}
            <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
              <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="pie_chart" size={16} className="text-primary" />Répartition des plans</h3>
              {Object.keys(PLANS).map(planId => {
                const count = organizations.filter(o => {
                  const lic = licenses.find(l => l.orgId === o.id);
                  return (lic?.plan || o.plan || 'standard') === planId;
                }).length;
                const pct = organizations.length > 0 ? Math.round(count / organizations.length * 100) : 0;
                const p = getPlan(planId);
                return (
                  <div key={planId} className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold text-on-surface">{p.name}</span>
                      <span className="text-on-surface-variant">{count} org · {pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent orgs */}
            <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
              <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="corporate_fare" size={16} className="text-primary" />Organisations récentes</h3>
              {orgStats.slice(0, 5).map(o => {
                const licInfo = getLicenseStatusInfo(o.license);
                const p = getPlan(o.license?.plan || o.plan || 'standard');
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center font-bold text-on-primary-container text-xs flex-shrink-0">
                      {o.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{o.name}</p>
                      <p className="text-xs text-on-surface-variant">{o.userCount} user · {o.propCount} biens</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${licInfo.color}`}>{licInfo.label}</span>
                    </div>
                  </div>
                );
              })}
              {organizations.length === 0 && <p className="text-center text-sm text-on-surface-variant py-6">Aucune organisation</p>}
            </div>

            {/* Expiring soon */}
            <div className="bg-surface rounded-xl border border-outline-variant/20 p-5 lg:col-span-2">
              <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
                <Icon name="schedule" size={16} className="text-amber-600" />Licences expirant dans 30 jours
              </h3>
              {(() => {
                const expiring = licenses.filter(l => {
                  if (!l.expiresAt) return false;
                  const days = getDaysRemaining(l);
                  return days !== null && days <= 30 && (l.status === 'trial' || l.status === 'active');
                });
                if (expiring.length === 0) return <p className="text-sm text-on-surface-variant text-center py-4"><Icon name="check_circle" size={20} className="text-green-600 inline mr-1" />Aucune licence n'expire dans les 30 prochains jours.</p>;
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="text-xs text-on-surface-variant uppercase tracking-wide border-b border-outline-variant/20">
                        <th className="pb-2">Organisation</th><th className="pb-2">Plan</th><th className="pb-2">Statut</th><th className="pb-2 text-right">Jours restants</th><th className="pb-2" />
                      </tr></thead>
                      <tbody>{expiring.map(l => {
                        const org = organizations.find(o => o.id === l.orgId);
                        const days = getDaysRemaining(l);
                        const p = getPlan(l.plan);
                        return (
                          <tr key={l.key || l.id} className="border-b border-outline-variant/10 last:border-0">
                            <td className="py-2 font-medium text-on-surface">{org?.name || l.orgId}</td>
                            <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span></td>
                            <td className="py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{l.status}</span></td>
                            <td className="py-2 text-right font-bold text-amber-700">{days}j</td>
                            <td className="py-2 text-right">
                              <button onClick={() => setLicenseModal({ license: l, action: 'extend' })}
                                className="text-xs text-primary hover:underline">Prolonger</button>
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── ORGANISATIONS ── */}
        {tab === 'orgs' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Rechercher..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <button onClick={() => setShowCreateOrg(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
                <Icon name="add_business" size={16} /> Nouvelle org
              </button>
            </div>
            <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container text-xs text-on-surface-variant uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Organisation</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Users</th>
                      <th className="px-4 py-3">Biens</th>
                      <th className="px-4 py-3">Licence</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {filteredOrgs.map(o => {
                      const licInfo = getLicenseStatusInfo(o.license);
                      const p = getPlan(o.license?.plan || o.plan || 'standard');
                      const days = getDaysRemaining(o.license);
                      return (
                        <tr key={o.id} className="hover:bg-surface-container/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center font-bold text-on-primary-container text-xs flex-shrink-0">
                                {o.name?.[0]?.toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-on-surface text-sm">{o.name}</p>
                                <p className="text-xs text-on-surface-variant">{o.id === 'default' ? 'Org par défaut' : o.email || ''}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span></td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`font-bold ${o.userCount >= p.maxUsers ? 'text-error' : 'text-on-surface'}`}>{o.userCount}</span>
                            <span className="text-on-surface-variant">/{fmtLimit(p.maxUsers)}</span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`font-bold ${o.propCount >= p.maxProperties ? 'text-error' : 'text-on-surface'}`}>{o.propCount}</span>
                            <span className="text-on-surface-variant">/{fmtLimit(p.maxProperties)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-mono text-on-surface-variant">{o.license?.key?.slice(0, 12) || '—'}…</p>
                          </td>
                          <td className="px-4 py-3">
                            {o.active === false
                              ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-error/10 text-error">Suspendue</span>
                              : <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${licInfo.color}`}>{licInfo.label}</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {o.license && (
                                <button onClick={() => setLicenseModal({ license: o.license, action: 'extend' })}
                                  className="text-xs text-primary hover:underline px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">Prolonger</button>
                              )}
                              <button onClick={() => setLicenseModal({ license: { orgId: o.id }, action: 'new' })}
                                className="text-xs text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-lg hover:bg-surface-container transition-colors">Licence</button>
                              {o.id !== 'default' && (
                                <>
                                  <button
                                    onClick={() => dispatch({ type: 'UPDATE_ORGANIZATION', payload: { ...o, active: o.active === false } })}
                                    className={`text-xs px-2 py-1 rounded-lg transition-colors font-semibold ${o.active === false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                                    title={o.active === false ? 'Réactiver l\'organisation' : 'Suspendre l\'organisation'}
                                  >
                                    {o.active === false ? 'Activer' : 'Suspendre'}
                                  </button>
                                  <button onClick={() => setOrgDeleteConfirm(o)}
                                    className="text-xs text-error hover:bg-error/10 px-2 py-1 rounded-lg transition-colors">Supp.</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOrgs.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-10 text-on-surface-variant">Aucune organisation trouvée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── LICENCES ── */}
        {tab === 'licenses' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input value={licSearch} onChange={e => setLicSearch(e.target.value)} placeholder="Clé ou organisation..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <button
                onClick={() => {
                  const firstOrgId = organizations[0]?.id || '';
                  setNewLicenseOrgId(firstOrgId);
                  setLicenseModal({ license: { orgId: '' }, action: 'new' });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
                <Icon name="add_card" size={16} /> Nouvelle licence
              </button>
            </div>
            <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container text-xs text-on-surface-variant uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Clé de licence</th>
                      <th className="px-4 py-3">Organisation</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Expiration</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {filteredLicenses.map(l => {
                      const org = organizations.find(o => o.id === l.orgId);
                      const licInfo = getLicenseStatusInfo(l);
                      const p = getPlan(l.plan);
                      const days = getDaysRemaining(l);
                      const isExpired = !licInfo.color.includes('green') && !licInfo.color.includes('amber') || licInfo.icon === 'cancel' || licInfo.icon === 'block';
                      return (
                        <tr key={l.key || l.id} className="hover:bg-surface-container/50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-on-surface">{l.key || l.id}</td>
                          <td className="px-4 py-3 text-sm font-medium text-on-surface">{org?.name || l.orgId || '—'}</td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span></td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${licInfo.color}`}>{licInfo.label}</span></td>
                          <td className="px-4 py-3 text-xs text-on-surface-variant">
                            {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('fr-FR') : '—'}
                            {days !== null && days <= 30 && !isExpired && <span className="ml-1 text-amber-600 font-bold">({days}j)</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => setLicenseModal({ license: l, action: 'extend' })}
                                className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg hover:bg-primary/20 transition-colors font-semibold">+Jours</button>
                              {l.status !== 'suspended' ? (
                                <button onClick={() => setLicenseModal({ license: l, action: 'suspend' })}
                                  className="text-xs bg-error/10 text-error px-2 py-1 rounded-lg hover:bg-error/20 transition-colors font-semibold">Suspendre</button>
                              ) : (
                                <button onClick={() => setLicenseModal({ license: l, action: 'activate' })}
                                  className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-200 transition-colors font-semibold">Activer</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredLicenses.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-on-surface-variant">Aucune licence trouvée</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVITÉ ── */}
        {tab === 'activity' && (
          <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
            {activityLog.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant">
                <Icon name="history" size={40} className="opacity-20 mb-2" />
                <p>Aucune activité enregistrée</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10 max-h-[600px] overflow-y-auto">
                {activityLog.map((log, i) => (
                  <div key={log.id || i} className="px-5 py-3 flex items-start gap-3 hover:bg-surface-container/50">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon name="history" size={14} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface">{log.details}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {log.action} · {log.timestamp ? new Date(log.timestamp).toLocaleString('fr-FR') : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PLATEFORME ── */}
        {tab === 'platform' && <PlatformTab state={state} dispatch={dispatch} showToast={showToast} />}
      </div>

      {/* License action modal */}
      {licenseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {licenseModal.action === 'suspend' && (
              <>
                <div className="w-12 h-12 bg-error/10 rounded-xl flex items-center justify-center mb-4"><Icon name="block" size={24} className="text-error" /></div>
                <h3 className="font-bold text-lg text-on-surface mb-2">Suspendre la licence ?</h3>
                <p className="text-sm text-on-surface-variant mb-5">L'organisation perdra l'accès immédiatement.</p>
                <div className="flex gap-3">
                  <button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold hover:bg-surface-container-high">Annuler</button>
                  <button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-bold hover:bg-error/90">Suspendre</button>
                </div>
              </>
            )}
            {licenseModal.action === 'activate' && (
              <>
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4"><Icon name="verified" size={24} className="text-green-700" /></div>
                <h3 className="font-bold text-lg text-on-surface mb-2">Activer la licence ?</h3>
                <p className="text-sm text-on-surface-variant mb-5">L'organisation retrouvera l'accès.</p>
                <div className="flex gap-3">
                  <button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button>
                  <button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold">Activer</button>
                </div>
              </>
            )}
            {licenseModal.action === 'extend' && (
              <>
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4"><Icon name="schedule" size={24} className="text-primary" /></div>
                <h3 className="font-bold text-lg text-on-surface mb-4">Prolonger la licence</h3>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 block">Nombre de jours à ajouter</label>
                <div className="flex gap-2 mb-5">
                  {[7, 30, 90, 365].map(d => (
                    <button key={d} onClick={() => setExtendDays(d)} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${extendDays === d ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>{d}j</button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button>
                  <button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold">+{extendDays} jours</button>
                </div>
              </>
            )}
            {licenseModal.action === 'new' && (
              <>
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4"><Icon name="add_card" size={24} className="text-primary" /></div>
                <h3 className="font-bold text-lg text-on-surface mb-4">Nouvelle licence</h3>
                {licenseModal.license?.orgId ? (
                  <p className="text-xs text-on-surface-variant mb-3">Organisation : <strong>{organizations.find(o => o.id === licenseModal.license?.orgId)?.name || licenseModal.license?.orgId}</strong></p>
                ) : (
                  <div className="mb-3">
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Organisation *</label>
                    <select
                      value={newLicenseOrgId}
                      onChange={e => setNewLicenseOrgId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
                    >
                      <option value="">— Choisir —</option>
                      {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                )}
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 block">Plan</label>
                <div className="flex gap-2 mb-5">
                  {Object.keys(PLANS).map(p => (
                    <button key={p} onClick={() => setNewLicensePlan(p)} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${newLicensePlan === p ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>{getPlan(p).name}</button>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant mb-5">Validité 1 an · statut : Actif</p>
                <div className="flex gap-3">
                  <button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button>
                  <button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold">Créer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Create Org Modal ── */}
      {showCreateOrg && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg flex items-center gap-2">
                <Icon name="add_business" size={20} className="text-primary" /> Nouvelle organisation
              </h3>
              <button onClick={() => setShowCreateOrg(false)} className="text-on-surface-variant hover:text-on-surface">
                <Icon name="close" size={20} />
              </button>
            </div>

            {/* Plan */}
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 block">Plan</label>
              <div className="flex gap-2">
                {Object.keys(PLANS).map(p => (
                  <button key={p} onClick={() => setCreateOrgForm(f => ({ ...f, plan: p }))}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${createOrgForm.plan === p ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                    {getPlan(p).name}
                  </button>
                ))}
              </div>
            </div>

            {/* Org name */}
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom de l'organisation *</label>
              <input
                value={createOrgForm.orgName}
                onChange={e => setCreateOrgForm(f => ({ ...f, orgName: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
                placeholder="Ex: Agence Cocody Immobilier"
              />
            </div>

            <div className="border-t border-outline-variant/20 pt-3">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Compte administrateur</p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom complet *</label>
                  <input
                    value={createOrgForm.adminName}
                    onChange={e => setCreateOrgForm(f => ({ ...f, adminName: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
                    placeholder="Prénom Nom"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Email *</label>
                  <input
                    type="email"
                    value={createOrgForm.adminEmail}
                    onChange={e => setCreateOrgForm(f => ({ ...f, adminEmail: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
                    placeholder="admin@agence.ci"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Mot de passe * (min. 8 caractères)</label>
                  <input
                    type="password"
                    value={createOrgForm.adminPassword}
                    onChange={e => setCreateOrgForm(f => ({ ...f, adminPassword: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant bg-surface-container rounded-xl px-3 py-2">
              Une licence <strong>Active 1 an</strong> sera automatiquement générée pour cette organisation.
            </p>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCreateOrg(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">
                Annuler
              </button>
              <button onClick={handleCreateOrg} disabled={createOrgLoading}
                className="flex-1 py-2.5 text-sm font-bold text-on-primary bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {createOrgLoading
                  ? <><Icon name="progress_activity" size={16} className="animate-spin" /> Création…</>
                  : <><Icon name="add_business" size={16} /> Créer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Org delete confirm */}
      {orgDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-error/10 rounded-xl flex items-center justify-center mb-4"><Icon name="delete" size={24} className="text-error" /></div>
            <h3 className="font-bold text-lg text-on-surface mb-2">Supprimer l'organisation ?</h3>
            <p className="text-sm text-on-surface-variant mb-5"><strong>{orgDeleteConfirm.name}</strong> et sa licence seront supprimées définitivement.</p>
            <div className="flex gap-3">
              <button onClick={() => setOrgDeleteConfirm(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button>
              <button onClick={handleDeleteOrg} className="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-bold">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── PlatformTab — SMTP + Monitoring global (SUPER_ADMIN uniquement) ─────────── */
const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm';

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-outline-variant'}`}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

function PlatformTab({ state, dispatch, showToast }) {
  const sys = state.systemSettings || {};
  const [section, setSection] = useState('smtp');
  const [smtp, setSmtp] = useState({
    host: sys.smtp?.host || '',
    port: sys.smtp?.port || 587,
    user: sys.smtp?.user || '',
    password: sys.smtp?.password || '',
    from: sys.smtp?.from || '',
    encryption: sys.smtp?.encryption || 'TLS',
    enabled: sys.smtp?.enabled || false,
  });
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'ok' | 'error'

  const saveSmtp = () => {
    dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { smtp } });
    showToast('Configuration SMTP enregistrée');
  };

  const handleTestEmail = async () => {
    if (!testEmail.trim()) { showToast('Entrez un email de destination'); return; }
    setTestLoading(true);
    setTestResult(null);
    const { ok } = await sendEmail({
      to: testEmail.trim(),
      subject: 'Test SMTP — Minsouah',
      html: `<p>Bonjour,</p><p>Cet email confirme que la configuration SMTP de votre plateforme <strong>Minsouah</strong> fonctionne correctement.</p><p>— Super Admin Minsouah</p>`,
    });
    setTestResult(ok ? 'ok' : 'error');
    setTestLoading(false);
    showToast(ok ? 'Email de test envoyé avec succès !' : 'Erreur — vérifiez la configuration SMTP');
  };

  const SECTIONS = [
    { key: 'smtp',       label: 'SMTP / Email',  icon: 'email' },
    { key: 'monitoring', label: 'Monitoring',     icon: 'monitor_heart' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-nav */}
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              section === s.key ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
            }`}>
            <Icon name={s.icon} size={15} />{s.label}
          </button>
        ))}
      </div>

      {/* ── SMTP ── */}
      {section === 'smtp' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="email" filled />Configuration SMTP Plateforme</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Les emails transitent via la collection <code className="bg-surface-container px-1 rounded">mail</code> Firestore —
                l'extension <strong>Trigger Email</strong> les envoie côté serveur (aucune clé SMTP dans le navigateur).
              </p>
            </div>
            <Toggle checked={smtp.enabled} onChange={() => setSmtp(s => ({ ...s, enabled: !s.enabled }))} />
          </div>

          {/* Notice Firebase Extension */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-on-surface-variant">
            <p className="font-semibold text-primary mb-1 flex items-center gap-1"><Icon name="tips_and_updates" size={14} />Prérequis : Firebase Trigger Email Extension</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Firebase Console → <strong className="text-on-surface">Extensions</strong> → chercher «&nbsp;Trigger Email&nbsp;»</li>
              <li>Installer et configurer l'URI SMTP (ex: <code>smtps://user:pass@smtp.sendgrid.net:465</code>)</li>
              <li>Définir la collection source : <code>mail</code></li>
              <li>Enregistrer la config ci-dessous pour référence et activer le toggle</li>
            </ol>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!smtp.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Serveur SMTP</label>
              <input value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} className={inputCls} placeholder="smtp.sendgrid.net" />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Port</label>
              <select value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: Number(e.target.value) }))} className={inputCls}>
                <option value={587}>587 (TLS)</option>
                <option value={465}>465 (SSL)</option>
                <option value={25}>25</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Email expéditeur</label>
              <input type="email" value={smtp.from} onChange={e => setSmtp(s => ({ ...s, from: e.target.value }))} className={inputCls} placeholder="noreply@minsouah.ci" />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Chiffrement</label>
              <select value={smtp.encryption} onChange={e => setSmtp(s => ({ ...s, encryption: e.target.value }))} className={inputCls}>
                <option value="TLS">TLS (STARTTLS)</option>
                <option value="SSL">SSL</option>
                <option value="NONE">Aucun</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Utilisateur SMTP</label>
              <input value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} className={inputCls} placeholder="apikey" />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Mot de passe / API Key</label>
              <input type="password" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} className={inputCls} placeholder="••••••••" />
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button onClick={saveSmtp}
              className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors">
              <Icon name="save" size={16} />Enregistrer la config
            </button>
          </div>

          {/* Test email réel */}
          <div className="border-t border-outline-variant/20 pt-5">
            <p className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
              <Icon name="send" size={16} className="text-primary" />Envoyer un email de test (réel)
            </p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Adresse de destination</label>
                <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                  className={inputCls} placeholder="test@example.com" />
              </div>
              <button onClick={handleTestEmail} disabled={testLoading || !testEmail}
                className="px-5 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors disabled:opacity-50 flex-shrink-0">
                {testLoading
                  ? <><Icon name="progress_activity" size={16} className="animate-spin" />Envoi…</>
                  : <><Icon name="send" size={16} />Tester</>
                }
              </button>
            </div>
            {testResult === 'ok' && (
              <div className="mt-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                <Icon name="check_circle" size={16} />Email enregistré dans la queue Firestore — il sera envoyé par l'extension Trigger Email.
              </div>
            )}
            {testResult === 'error' && (
              <div className="mt-3 flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm">
                <Icon name="error" size={16} />Échec — vérifiez que Firestore est accessible et que l'extension est installée.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Monitoring global ── */}
      {section === 'monitoring' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
          <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="monitor_heart" filled />Monitoring Plateforme</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Organisations actives', value: (state.organizations || []).filter(o => o.active !== false).length, icon: 'corporate_fare', color: 'text-primary bg-primary/10' },
              { label: 'Utilisateurs totaux',   value: (state.users || []).filter(u => u.role !== 'SUPER_ADMIN').length,   icon: 'group',          color: 'text-secondary bg-secondary/10' },
              { label: 'Biens totaux',          value: (state.properties || []).length,                                     icon: 'apartment',      color: 'text-tertiary bg-tertiary/10' },
              { label: 'Contrats actifs',       value: (state.contracts || []).filter(c => c.status === 'Actif').length,    icon: 'contract',       color: 'text-green-600 bg-green-50' },
              { label: 'Paiements en attente',  value: (state.payments || []).filter(p => p.status !== 'Payé').length,      icon: 'pending',        color: 'text-amber-600 bg-amber-50' },
              { label: 'Tickets ouverts',       value: (state.tickets || []).filter(t => t.status !== 'Fermé' && t.status !== 'Résolu').length, icon: 'engineering', color: 'text-error bg-error/10' },
            ].map(s => (
              <div key={s.label} className={`p-4 rounded-xl ${s.color.split(' ')[1]} flex items-center gap-3`}>
                <Icon name={s.icon} size={22} className={s.color.split(' ')[0]} />
                <div>
                  <p className={`font-black text-xl ${s.color.split(' ')[0]}`}>{s.value}</p>
                  <p className="text-xs text-on-surface-variant">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 bg-surface-container-low rounded-xl p-4">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Dernières connexions</p>
            {(state.activityLog || []).filter(e => e.action === 'LOGIN' || e.action === 'LOGIN_FAIL').slice(0, 10).length === 0
              ? <p className="text-xs text-on-surface-variant">Aucune activité.</p>
              : (state.activityLog || []).filter(e => e.action === 'LOGIN' || e.action === 'LOGIN_FAIL').slice(0, 10).map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${e.action === 'LOGIN' ? 'bg-green-100 text-green-600' : 'bg-error/10 text-error'}`}>
                    <Icon name={e.action === 'LOGIN' ? 'login' : 'block'} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-on-surface truncate">{e.userEmail || e.details}</p>
                    <p className="text-xs text-on-surface-variant">{e.action === 'LOGIN' ? 'Connexion réussie' : 'Tentative échouée'}</p>
                  </div>
                  <p className="text-xs text-on-surface-variant flex-shrink-0">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
