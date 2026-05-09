import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import * as XLSX from 'xlsx';

const ALL_TABS = [
  { key: 'profile',  label: 'Mon Profil',      icon: 'account_circle', roles: null },
  { key: 'org',      label: 'Organisation',     icon: 'business',       roles: ['ADMIN', 'MANAGER'] },
  { key: 'users',    label: 'Utilisateurs',     icon: 'group',          roles: ['ADMIN'] },
  { key: 'notif',    label: 'Notifications',    icon: 'notifications',  roles: null },
  { key: 'data',     label: 'Données',          icon: 'database',       roles: ['ADMIN', 'MANAGER'] },
  { key: 'system',   label: 'Système',          icon: 'settings_suggest', roles: ['ADMIN'] },
  { key: 'security', label: 'Sécurité',         icon: 'lock',           roles: null },
];

const ROLE_LABELS = {
  ADMIN: 'Administrateur', MANAGER: 'Manager', TENANT: 'Locataire',
  OWNER: 'Propriétaire', ACCOUNTANT: 'Comptable', TECHNICIAN: 'Technicien',
};
const COLORS = [
  'bg-primary-container text-on-primary-container',
  'bg-secondary-container text-on-secondary-container',
  'bg-tertiary-container text-on-tertiary-container',
  'bg-error-container text-on-error-container',
];

/* ── CSV Templates ─────────────────────────────────────────────────────────── */
const TENANT_COLUMNS  = ['nom','prenom','email','telephone','bien','date_entree','statut'];
const OWNER_COLUMNS   = ['nom','prenom','email','telephone','banque','iban','statut'];
const PROPERTY_COLUMNS = ['nom','adresse','type','loyer','surface','pieces','statut'];

function downloadTemplate(cols, filename) {
  const ws = XLSX.utils.aoa_to_sheet([cols]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modèle');
  XLSX.writeFile(wb, filename);
}

/* ── Field input helper ─────────────────────────────────────────────────────── */
function Field({ label, icon, children, span }) {
  return (
    <div className={span ? 'md:col-span-2' : ''}>
      <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 flex items-center gap-1">
        {icon && <Icon name={icon} size={13} />}{label}
      </label>
      {children}
    </div>
  );
}
const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm';

export default function Settings() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { currentUser, orgSettings } = state;
  const [tab, setTab] = useState('profile');
  const TABS = ALL_TABS.filter(t => !t.roles || t.roles.includes(currentUser?.role));
  const [toast, setToast] = useState('');
  const avatarRef = useRef();
  const importRef = useRef();

  /* ── Profile ── */
  const [profile, setProfile] = useState({
    name:        currentUser?.name || '',
    email:       currentUser?.email || '',
    phone:       currentUser?.phone || '',
    whatsapp:    currentUser?.whatsapp || '',
    profession:  currentUser?.profession || '',
    address:     currentUser?.address || '',
    birthdate:   currentUser?.birthdate || '',
    gender:      currentUser?.gender || '',
    nationalId:  currentUser?.nationalId || '',
    avatar:      currentUser?.avatar || '',
  });

  /* ── Org ── */
  const [org, setOrg] = useState({
    companyName: orgSettings?.companyName || 'Minsouah Immobilier',
    address:     orgSettings?.address || 'Abidjan, Côte d\'Ivoire',
    phone:       orgSettings?.phone || '',
    email:       orgSettings?.email || '',
    currency:    orgSettings?.currency || 'XOF',
    language:    orgSettings?.language || 'fr',
    logo:        orgSettings?.logo || '',
  });

  /* ── Notifications ── */
  const [notif, setNotif] = useState({
    whatsapp:          orgSettings?.notif?.whatsapp ?? true,
    email:             orgSettings?.notif?.email ?? true,
    rentReminder:      orgSettings?.notif?.rentReminder ?? true,
    paymentConfirm:    orgSettings?.notif?.paymentConfirm ?? true,
    overdueAlert:      orgSettings?.notif?.overdueAlert ?? true,
    maintenanceUpdate: orgSettings?.notif?.maintenanceUpdate ?? false,
  });

  /* ── Security ── */
  const [pwForm, setPwForm]   = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');

  /* ── Import ── */
  const [importType, setImportType]     = useState('tenants');
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError]   = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2800); };

  const save = (type, data) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { type, data } });
    showToast('Modifications enregistrées');
  };

  /* ── Avatar ── */
  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Image trop grande (max 2 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setProfile(p => ({ ...p, avatar: ev.target.result }));
    reader.readAsDataURL(file);
  };

  /* ── Org logo ── */
  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setOrg(o => ({ ...o, logo: ev.target.result }));
    reader.readAsDataURL(file);
  };

  /* ── Password ── */
  const handlePwChange = (e) => {
    e.preventDefault();
    const dbUser = (state.users || []).find(u => u.email === currentUser?.email);
    const storedPw = dbUser?.password || 'admin123';
    if (pwForm.current !== storedPw) { setPwError('Mot de passe actuel incorrect.'); return; }
    if (pwForm.next.length < 8) { setPwError('Au moins 8 caractères requis.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return; }
    setPwError('');
    dispatch({ type: 'CHANGE_PASSWORD', payload: { email: currentUser.email, newPassword: pwForm.next } });
    setPwForm({ current: '', next: '', confirm: '' });
    showToast('Mot de passe mis à jour');
  };

  /* ── Excel/CSV Import ── */
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportPreview(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2) { setImportError('Fichier vide ou sans données.'); return; }
        setImportPreview({ headers: rows[0], rows: rows.slice(1).filter(r => r.some(c => c)) });
      } catch {
        setImportError('Fichier invalide. Utilisez un fichier .xlsx ou .csv.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const applyImport = () => {
    if (!importPreview) return;
    const { headers, rows } = importPreview;
    const idx = (k) => headers.findIndex(h => String(h).toLowerCase().trim() === k);

    if (importType === 'tenants') {
      const iNom      = idx('nom');
      const iPrenom   = idx('prenom');
      const iEmail    = idx('email');
      const iPhone    = idx('telephone');
      const iProp     = idx('bien');
      const iDate     = idx('date_entree');
      const iStatus   = idx('statut');
      rows.forEach(r => {
        const nom    = r[iNom] || '';
        const prenom = r[iPrenom] || '';
        const full   = [prenom, nom].filter(Boolean).join(' ') || nom || prenom;
        if (!full) return;
        const initials = full.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        dispatch({
          type: 'ADD_TENANT',
          payload: {
            name:     full,
            initials,
            email:    r[iEmail]  || '',
            phone:    r[iPhone]  || '',
            property: r[iProp]   || '',
            since:    r[iDate]   || '',
            status:   r[iStatus] || 'Actif',
            color:    COLORS[Math.floor(Math.random() * COLORS.length)],
          },
        });
      });
      showToast(`${rows.length} locataire(s) importé(s)`);
    }

    if (importType === 'owners') {
      const iNom    = idx('nom');
      const iPrenom = idx('prenom');
      const iEmail  = idx('email');
      const iPhone  = idx('telephone');
      const iBanque = idx('banque');
      const iIban   = idx('iban');
      const iStatus = idx('statut');
      rows.forEach(r => {
        const nom    = r[iNom] || '';
        const prenom = r[iPrenom] || '';
        const full   = [prenom, nom].filter(Boolean).join(' ') || nom || prenom;
        if (!full) return;
        const initials = full.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        dispatch({
          type: 'ADD_OWNER',
          payload: {
            name:       full,
            initials,
            email:      r[iEmail]  || '',
            phone:      r[iPhone]  || '',
            bank:       r[iBanque] || '',
            iban:       r[iIban]   || '',
            status:     r[iStatus] || 'Actif',
            properties: 0,
            revenue:    0,
            color:      COLORS[Math.floor(Math.random() * COLORS.length)],
          },
        });
      });
      showToast(`${rows.length} propriétaire(s) importé(s)`);
    }

    if (importType === 'properties') {
      const iNom     = idx('nom');
      const iAddr    = idx('adresse');
      const iType    = idx('type');
      const iLoyer   = idx('loyer');
      const iSurface = idx('surface');
      const iPieces  = idx('pieces');
      const iStatus  = idx('statut');
      rows.forEach(r => {
        const name = r[iNom] || '';
        if (!name) return;
        dispatch({
          type: 'ADD_PROPERTY',
          payload: {
            name,
            address:  r[iAddr]   || '',
            type:     r[iType]   || 'Appartement',
            rent:     Number(r[iLoyer])   || 0,
            surface:  Number(r[iSurface]) || 0,
            rooms:    Number(r[iPieces])  || 0,
            status:   r[iStatus] || 'Disponible',
            owner:    '',
            ownerInitials: '',
            isBuilding: false,
            units: [],
          },
        });
      });
      showToast(`${rows.length} bien(s) importé(s)`);
    }

    setImportPreview(null);
    if (importRef.current) importRef.current.value = '';
  };

  /* ── Full reset (truly empty) ── */
  const handleFullReset = () => {
    if (!window.confirm('Effacer TOUTES les données (biens, locataires, contrats, paiements) ?\n\nLes comptes utilisateurs sont conservés.\nCette action est irréversible.')) return;
    localStorage.removeItem('minsouah_v1');
    dispatch({ type: 'RESET' });
    navigate('/login');
  };

  /* ── Demo reload ── */
  const handleDemoReload = () => {
    if (!window.confirm('Recharger les données de démonstration ? Cela remplacera vos données actuelles.')) return;
    dispatch({ type: 'RESET_DEMO' });
    showToast('Données de démonstration rechargées');
  };

  return (
    <div className="p-margin max-w-4xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 bg-tertiary text-on-tertiary px-5 py-3 rounded-xl shadow-xl flex items-center gap-2">
          <Icon name="check_circle" size={18} filled />
          {toast}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar */}
        <div className="md:w-52 flex-shrink-0">
          <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
            {/* Back to portal for TENANT/OWNER */}
            {(currentUser?.role === 'TENANT' || currentUser?.role === 'OWNER') && (
              <button onClick={() => navigate(currentUser.role === 'TENANT' ? '/portal/tenant' : '/portal/owner')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 transition-all text-left border-b border-outline-variant/20">
                <Icon name="arrow_back" size={18} />
                Mon portail
              </button>
            )}
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all text-left ${
                  tab === t.key
                    ? 'bg-primary-container text-on-primary-container border-l-4 border-primary'
                    : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}>
                <Icon name={t.icon} size={18} filled={tab === t.key} />
                {t.label}
              </button>
            ))}
            <div className="border-t border-outline-variant/20">
              <button onClick={() => { dispatch({ type: 'LOGOUT' }); navigate('/login'); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-error hover:bg-error-container/40 transition-all text-left">
                <Icon name="logout" size={18} /> Déconnexion
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">

          {/* ══════════ MON PROFIL ══════════ */}
          {tab === 'profile' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <Icon name="account_circle" filled /> Mon Profil
              </h2>

              {/* Avatar section */}
              <div className="flex items-center gap-5 mb-6 p-4 bg-surface-container rounded-2xl">
                <div className="relative flex-shrink-0">
                  {profile.avatar
                    ? <img src={profile.avatar} alt="avatar" className="w-20 h-20 rounded-full object-cover border-2 border-primary/30" />
                    : <div className="w-20 h-20 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-black text-2xl">
                        {currentUser?.initials || 'AD'}
                      </div>
                  }
                  <button onClick={() => avatarRef.current?.click()}
                    className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors">
                    <Icon name="photo_camera" size={14} />
                  </button>
                  <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>
                <div>
                  <p className="font-bold text-on-surface text-base">{currentUser?.name || 'Utilisateur'}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold mt-1 inline-block ${
                    currentUser?.role === 'ADMIN' ? 'bg-primary-container text-on-primary-container' :
                    currentUser?.role === 'TENANT' ? 'bg-secondary-container text-on-secondary-container' :
                    'bg-tertiary-container text-on-tertiary-container'
                  }`}>
                    {ROLE_LABELS[currentUser?.role] || currentUser?.role}
                  </span>
                  <p className="text-xs text-on-surface-variant mt-1">Cliquez sur l'icône pour changer la photo</p>
                  {profile.avatar && (
                    <button onClick={() => setProfile(p => ({ ...p, avatar: '' }))}
                      className="text-xs text-error hover:underline mt-0.5">Supprimer la photo</button>
                  )}
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Nom complet" icon="badge" span>
                  <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} className={inputCls} placeholder="Prénom Nom" />
                </Field>
                <Field label="Email" icon="email">
                  <input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Téléphone" icon="phone">
                  <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} className={inputCls} placeholder="+225 07 00 00 00 00" />
                </Field>
                <Field label="WhatsApp" icon="chat">
                  <input value={profile.whatsapp} onChange={e => setProfile(p => ({ ...p, whatsapp: e.target.value }))} className={inputCls} placeholder="+225 07 00 00 00 00" />
                </Field>
                <Field label="Profession" icon="work">
                  <input value={profile.profession} onChange={e => setProfile(p => ({ ...p, profession: e.target.value }))} className={inputCls} placeholder="Ex: Gestionnaire immobilier" />
                </Field>
                <Field label="Date de naissance" icon="cake">
                  <input type="date" value={profile.birthdate} onChange={e => setProfile(p => ({ ...p, birthdate: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Genre" icon="person">
                  <select value={profile.gender} onChange={e => setProfile(p => ({ ...p, gender: e.target.value }))} className={inputCls}>
                    <option value="">— Choisir —</option>
                    <option value="M">Masculin</option>
                    <option value="F">Féminin</option>
                  </select>
                </Field>
                <Field label="Pièce d'identité (CNI / Passeport)" icon="badge">
                  <input value={profile.nationalId} onChange={e => setProfile(p => ({ ...p, nationalId: e.target.value }))} className={inputCls} placeholder="N° de pièce" />
                </Field>
                <Field label="Adresse personnelle" icon="home" span>
                  <input value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} className={inputCls} placeholder="Quartier, ville" />
                </Field>
              </div>

              <button onClick={() => save('profile', profile)}
                className="mt-6 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2">
                <Icon name="save" size={18} /> Enregistrer le profil
              </button>
            </div>
          )}

          {/* ══════════ ORGANISATION ══════════ */}
          {tab === 'org' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <Icon name="business" filled /> Organisation
              </h2>

              {/* Logo */}
              <div className="flex items-center gap-4 mb-6 p-4 bg-surface-container rounded-2xl">
                {org.logo
                  ? <img src={org.logo} alt="logo" className="w-16 h-16 rounded-xl object-contain border border-outline-variant/30" />
                  : <div className="w-16 h-16 rounded-xl bg-primary-container flex items-center justify-center text-on-primary-container font-black text-xl">M</div>
                }
                <div>
                  <p className="font-semibold text-on-surface text-sm">{org.companyName}</p>
                  <label className="mt-1 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-semibold cursor-pointer hover:bg-primary/90 transition-colors w-fit">
                    <Icon name="upload" size={13} /> Changer le logo
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'companyName', label: 'Nom de la société', span: true },
                  { key: 'address', label: 'Adresse', span: true },
                  { key: 'phone', label: 'Téléphone' },
                  { key: 'email', label: 'Email professionnel' },
                ].map(f => (
                  <Field key={f.key} label={f.label} span={f.span}>
                    <input value={org[f.key]} onChange={e => setOrg(o => ({ ...o, [f.key]: e.target.value }))} className={inputCls} />
                  </Field>
                ))}
                <Field label="Devise">
                  <select value={org.currency} onChange={e => setOrg(o => ({ ...o, currency: e.target.value }))} className={inputCls}>
                    <option value="XOF">XOF — Franc CFA (BCEAO)</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="USD">USD — Dollar US</option>
                    <option value="GHS">GHS — Cedi ghanéen</option>
                  </select>
                </Field>
                <Field label="Langue">
                  <select value={org.language} onChange={e => setOrg(o => ({ ...o, language: e.target.value }))} className={inputCls}>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </Field>
              </div>

              <button onClick={() => save('org', org)}
                className="mt-6 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2">
                <Icon name="save" size={18} /> Enregistrer
              </button>
            </div>
          )}

          {/* ══════════ UTILISATEURS ══════════ */}
          {tab === 'users' && (
            <UserManagementTab
              state={state}
              dispatch={dispatch}
              currentUser={currentUser}
              showToast={showToast}
            />
          )}

          {/* ══════════ NOTIFICATIONS ══════════ */}
          {tab === 'notif' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
              <h2 className="font-bold text-lg text-on-surface mb-6 flex items-center gap-2">
                <Icon name="notifications" filled /> Notifications
              </h2>

              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Canaux</p>
              {[
                { key: 'whatsapp', label: 'WhatsApp Business', sub: 'Rappels et confirmations', icon: 'chat' },
                { key: 'email',    label: 'Email',              sub: 'Notifications par e-mail', icon: 'email' },
              ].map(n => (
                <div key={n.key} className="flex items-center justify-between p-4 bg-surface-container rounded-xl mb-2">
                  <div className="flex items-center gap-3">
                    <Icon name={n.icon} size={20} className="text-primary" />
                    <div>
                      <p className="font-medium text-on-surface text-sm">{n.label}</p>
                      <p className="text-xs text-on-surface-variant">{n.sub}</p>
                    </div>
                  </div>
                  <Toggle checked={notif[n.key]} onChange={() => setNotif(v => ({ ...v, [n.key]: !v[n.key] }))} />
                </div>
              ))}

              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3 mt-4">Événements</p>
              {[
                { key: 'rentReminder',      label: 'Rappels de loyer',        sub: 'J-5 avant échéance' },
                { key: 'paymentConfirm',    label: 'Confirmation de paiement', sub: 'À chaque encaissement' },
                { key: 'overdueAlert',      label: 'Alertes impayés',          sub: 'Loyers en retard' },
                { key: 'maintenanceUpdate', label: 'Suivi maintenance',         sub: 'Mises à jour tickets' },
              ].map(n => (
                <div key={n.key} className="flex items-center justify-between p-4 bg-surface-container rounded-xl mb-2">
                  <div>
                    <p className="font-medium text-on-surface text-sm">{n.label}</p>
                    <p className="text-xs text-on-surface-variant">{n.sub}</p>
                  </div>
                  <Toggle checked={notif[n.key]} onChange={() => setNotif(v => ({ ...v, [n.key]: !v[n.key] }))} />
                </div>
              ))}

              <button onClick={() => save('notif', notif)}
                className="mt-4 px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2">
                <Icon name="save" size={18} /> Enregistrer
              </button>
            </div>
          )}

          {/* ══════════ DONNÉES ══════════ */}
          {tab === 'data' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-6">
              <h2 className="font-bold text-lg text-on-surface flex items-center gap-2">
                <Icon name="database" filled /> Import / Export de données
              </h2>

              {/* Import type selector */}
              <div>
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Type de données à importer</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { key: 'tenants',    label: 'Locataires',    icon: 'person' },
                    { key: 'owners',     label: 'Propriétaires', icon: 'manage_accounts' },
                    { key: 'properties', label: 'Biens',         icon: 'apartment' },
                  ].map(t => (
                    <button key={t.key} onClick={() => { setImportType(t.key); setImportPreview(null); setImportError(''); if (importRef.current) importRef.current.value = ''; }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${importType === t.key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                      <Icon name={t.icon} size={16} />{t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Download template */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">1. Télécharger le modèle Excel</p>
                <button onClick={() => {
                  const cols = importType === 'tenants' ? TENANT_COLUMNS : importType === 'owners' ? OWNER_COLUMNS : PROPERTY_COLUMNS;
                  downloadTemplate(cols, `modele_${importType}.xlsx`);
                }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-surface-container border border-outline-variant/30 rounded-xl text-sm font-semibold hover:bg-surface-container-high transition-colors w-fit">
                  <Icon name="download" size={16} className="text-primary" />
                  Télécharger modele_{importType}.xlsx
                </button>
                <p className="text-xs text-on-surface-variant">
                  Colonnes attendues :&nbsp;
                  <span className="font-mono text-xs bg-surface-container-high px-1.5 py-0.5 rounded">
                    {(importType === 'tenants' ? TENANT_COLUMNS : importType === 'owners' ? OWNER_COLUMNS : PROPERTY_COLUMNS).join(', ')}
                  </span>
                </p>
              </div>

              {/* File upload */}
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">2. Charger votre fichier (.xlsx ou .csv)</p>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-outline-variant rounded-2xl p-8 cursor-pointer hover:border-primary hover:bg-primary-container/10 transition-all">
                  <Icon name="upload_file" size={36} className="text-primary/50 mb-2" />
                  <p className="font-semibold text-on-surface text-sm">Cliquez ou glissez un fichier ici</p>
                  <p className="text-xs text-on-surface-variant mt-1">Format .xlsx ou .csv accepté</p>
                  <input ref={importRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={handleImportFile} />
                </label>
                {importError && <p className="text-xs text-error flex items-center gap-1"><Icon name="error" size={13} />{importError}</p>}
              </div>

              {/* Preview */}
              {importPreview && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest">3. Aperçu — {importPreview.rows.length} ligne(s) détectée(s)</p>
                  <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                    <table className="w-full text-xs">
                      <thead className="bg-primary text-on-primary">
                        <tr>{importPreview.headers.map((h, i) => <th key={i} className="px-3 py-2 text-left font-bold uppercase tracking-wider">{h}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10">
                        {importPreview.rows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="hover:bg-surface-container-low">
                            {importPreview.headers.map((_, j) => <td key={j} className="px-3 py-2 text-on-surface">{r[j] ?? '—'}</td>)}
                          </tr>
                        ))}
                        {importPreview.rows.length > 5 && (
                          <tr><td colSpan={importPreview.headers.length} className="px-3 py-2 text-on-surface-variant text-center">... et {importPreview.rows.length - 5} ligne(s) supplémentaire(s)</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setImportPreview(null); if (importRef.current) importRef.current.value = ''; }}
                      className="px-4 py-2 bg-surface-container text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high transition-colors">
                      Annuler
                    </button>
                    <button onClick={applyImport}
                      className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2">
                      <Icon name="check_circle" size={16} /> Importer {importPreview.rows.length} enregistrement(s)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════════ SYSTÈME ══════════ */}
          {tab === 'system' && (
            <SystemTab state={state} dispatch={dispatch} showToast={showToast} />
          )}

          {/* ══════════ SÉCURITÉ ══════════ */}
          {tab === 'security' && (
            <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-6">
              <h2 className="font-bold text-lg text-on-surface flex items-center gap-2">
                <Icon name="lock" filled /> Sécurité
              </h2>

              <form onSubmit={handlePwChange} className="flex flex-col gap-4 max-w-sm">
                <p className="text-sm text-on-surface-variant">Modifiez votre mot de passe de connexion.</p>
                {[
                  { key: 'current', label: 'Mot de passe actuel' },
                  { key: 'next',    label: 'Nouveau mot de passe' },
                  { key: 'confirm', label: 'Confirmer le nouveau mot de passe' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">{f.label}</label>
                    <input type="password" value={pwForm[f.key]}
                      onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                      className={inputCls} required />
                  </div>
                ))}
                {pwError && <p className="text-error text-sm flex items-center gap-1"><Icon name="error" size={14} />{pwError}</p>}
                <button type="submit"
                  className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 w-fit">
                  <Icon name="lock_reset" size={18} /> Changer le mot de passe
                </button>
              </form>

              {/* Reset section — ADMIN only */}
              {currentUser?.role === 'ADMIN' && (
                <div className="border-t border-outline-variant/20 pt-6 flex flex-col gap-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="font-semibold text-amber-800 text-sm flex items-center gap-2 mb-1">
                      <Icon name="restart_alt" size={16} /> Réinitialisation partielle
                    </p>
                    <p className="text-xs text-amber-700 mb-3">Recharge les données de démonstration sans toucher au compte.</p>
                    <button onClick={handleDemoReload}
                      className="px-4 py-2 bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-sm font-semibold hover:bg-amber-200 transition-colors">
                      Recharger les données démo
                    </button>
                  </div>

                  <div className="p-4 bg-error-container/30 border border-error/20 rounded-xl">
                    <p className="font-semibold text-error text-sm flex items-center gap-2 mb-1">
                      <Icon name="warning" size={16} /> Zone dangereuse — Réinitialisation complète
                    </p>
                    <p className="text-xs text-on-surface-variant mb-3">
                      Efface toutes les données (locataires, propriétés, paiements, contrats) et retourne à la page de connexion.
                      <strong className="text-error"> Action irréversible.</strong>
                    </p>
                    <button onClick={handleFullReset}
                      className="px-4 py-2 bg-error text-on-error rounded-lg text-sm font-semibold hover:bg-error/90 transition-colors flex items-center gap-2">
                      <Icon name="delete_forever" size={16} /> Tout effacer et réinitialiser
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-outline-variant'}`}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

/* ── SystemTab ──────────────────────────────────────────────────────────────── */
function SystemTab({ state, dispatch, showToast }) {
  const sys = state.systemSettings || {};
  const [smtp, setSmtp] = useState({
    host: sys.smtp?.host || '', port: sys.smtp?.port || 587,
    user: sys.smtp?.user || '', password: sys.smtp?.password || '',
    from: sys.smtp?.from || '', encryption: sys.smtp?.encryption || 'TLS',
    enabled: sys.smtp?.enabled || false,
  });
  const [wa, setWa] = useState({
    apiKey: sys.whatsapp?.apiKey || '', phoneNumber: sys.whatsapp?.phoneNumber || '',
    businessName: sys.whatsapp?.businessName || '', enabled: sys.whatsapp?.enabled || false,
  });
  const mm = sys.mobileMoney || {};
  const [cinetpay, setCinetpay] = useState({ apiKey: mm.cinetpay?.apiKey || '', siteId: mm.cinetpay?.siteId || '', enabled: mm.cinetpay?.enabled || false });
  const [orange, setOrange] = useState({ merchantKey: mm.orange?.merchantKey || '', enabled: mm.orange?.enabled || false });
  const [mtn, setMtn] = useState({ apiKey: mm.mtn?.apiKey || '', enabled: mm.mtn?.enabled || false });
  const [wave, setWave] = useState({ apiKey: mm.wave?.apiKey || '', enabled: mm.wave?.enabled || false });
  const [moov, setMoov] = useState({ apiKey: mm.moov?.apiKey || '', enabled: mm.moov?.enabled || false });
  const [section, setSection] = useState('smtp');

  const saveSmtp = () => {
    dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { smtp } });
    showToast('Configuration SMTP enregistrée');
  };
  const saveWa = () => {
    dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { whatsapp: wa } });
    showToast('Configuration WhatsApp enregistrée');
  };
  const saveMM = () => {
    dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { mobileMoney: { cinetpay, orange, mtn, wave, moov } } });
    showToast('Configuration Mobile Money enregistrée');
  };

  const testSmtp = () => {
    if (!smtp.host || !smtp.user) { showToast('Remplissez au moins le serveur et l\'email'); return; }
    showToast('Test SMTP envoyé (simulation)');
  };

  const SECTIONS = [
    { key: 'smtp', label: 'SMTP / Email', icon: 'email' },
    { key: 'whatsapp', label: 'WhatsApp Business', icon: 'chat' },
    { key: 'mobilemoney', label: 'Mobile Money', icon: 'payments' },
    { key: 'sync', label: 'Sync Cloud', icon: 'cloud_sync' },
    { key: 'monitoring', label: 'Monitoring', icon: 'monitor_heart' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-nav */}
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${section === s.key ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'}`}>
            <Icon name={s.icon} size={15} />{s.label}
          </button>
        ))}
      </div>

      {/* SMTP */}
      {section === 'smtp' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="email" filled />Configuration SMTP</h3>
            <Toggle checked={smtp.enabled} onChange={() => setSmtp(s => ({ ...s, enabled: !s.enabled }))} />
          </div>
          <p className="text-xs text-on-surface-variant -mt-2">Permet l'envoi d'emails de notification (quittances, rappels, alertes).</p>
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!smtp.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <Field label="Serveur SMTP" icon="dns">
              <input value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} className={inputCls} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="Port">
              <select value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: Number(e.target.value) }))} className={inputCls}>
                <option value={587}>587 (TLS)</option><option value={465}>465 (SSL)</option><option value={25}>25</option>
              </select>
            </Field>
            <Field label="Email expéditeur" icon="alternate_email">
              <input type="email" value={smtp.from} onChange={e => setSmtp(s => ({ ...s, from: e.target.value }))} className={inputCls} placeholder="noreply@minsouah.ci" />
            </Field>
            <Field label="Chiffrement">
              <select value={smtp.encryption} onChange={e => setSmtp(s => ({ ...s, encryption: e.target.value }))} className={inputCls}>
                <option value="TLS">TLS (STARTTLS)</option><option value="SSL">SSL</option><option value="NONE">Aucun</option>
              </select>
            </Field>
            <Field label="Nom d'utilisateur SMTP" icon="person">
              <input value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} className={inputCls} placeholder="votre@email.com" />
            </Field>
            <Field label="Mot de passe SMTP" icon="lock">
              <input type="password" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} className={inputCls} placeholder="••••••••" />
            </Field>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={saveSmtp} className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors">
              <Icon name="save" size={16} />Enregistrer
            </button>
            <button onClick={testSmtp} className="px-5 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors">
              <Icon name="send" size={16} />Tester la connexion
            </button>
          </div>
          <div className="p-3 bg-surface-container-low rounded-xl text-xs text-on-surface-variant">
            <strong className="text-on-surface">Gmail :</strong> Activez «&nbsp;Accès moins sécurisé&nbsp;» ou utilisez un mot de passe d'application.<br />
            <strong className="text-on-surface">Recommandé :</strong> SendGrid, Mailgun ou Brevo pour un usage professionnel.
          </div>
        </div>
      )}

      {/* WhatsApp */}
      {section === 'whatsapp' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="chat" filled />WhatsApp Business API</h3>
            <Toggle checked={wa.enabled} onChange={() => setWa(w => ({ ...w, enabled: !w.enabled }))} />
          </div>
          <p className="text-xs text-on-surface-variant -mt-2">Envoi de rappels de loyer, confirmations de paiement et alertes via WhatsApp.</p>
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!wa.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <Field label="Nom de l'entreprise" icon="business">
              <input value={wa.businessName} onChange={e => setWa(w => ({ ...w, businessName: e.target.value }))} className={inputCls} placeholder="Minsouah Immobilier" />
            </Field>
            <Field label="Numéro WhatsApp Business" icon="phone">
              <input value={wa.phoneNumber} onChange={e => setWa(w => ({ ...w, phoneNumber: e.target.value }))} className={inputCls} placeholder="+225 07 00 00 00 00" />
            </Field>
            <Field label="Clé API / Token d'accès" icon="key" span>
              <input type="password" value={wa.apiKey} onChange={e => setWa(w => ({ ...w, apiKey: e.target.value }))} className={inputCls} placeholder="EAAxxxxxxx..." />
            </Field>
          </div>
          <button onClick={saveWa} className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors w-fit">
            <Icon name="save" size={16} />Enregistrer
          </button>
          <div className="p-3 bg-surface-container-low rounded-xl text-xs text-on-surface-variant">
            Fournisseurs compatibles : <strong className="text-on-surface">Meta (WhatsApp Cloud API)</strong>, Twilio, 360dialog, Vonage.<br />
            Obtenez votre token sur <strong className="text-on-surface">developers.facebook.com</strong>.
          </div>
        </div>
      )}

      {/* Mobile Money */}
      {section === 'mobilemoney' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-6">
          <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="payments" filled />Mobile Money</h3>
          <p className="text-xs text-on-surface-variant -mt-4">Configurez les opérateurs acceptés pour le paiement en ligne des loyers.</p>

          {/* CinetPay */}
          <div className="border border-outline-variant/30 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-on-surface text-sm flex items-center gap-2">
                <span className="w-6 h-6 bg-primary-container rounded text-on-primary-container text-xs font-bold flex items-center justify-center">C</span>
                CinetPay (agrégateur)
              </p>
              <Toggle checked={cinetpay.enabled} onChange={() => setCinetpay(c => ({ ...c, enabled: !c.enabled }))} />
            </div>
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${!cinetpay.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <input value={cinetpay.apiKey} onChange={e => setCinetpay(c => ({ ...c, apiKey: e.target.value }))} className={inputCls} placeholder="API Key CinetPay" />
              <input value={cinetpay.siteId} onChange={e => setCinetpay(c => ({ ...c, siteId: e.target.value }))} className={inputCls} placeholder="Site ID" />
            </div>
          </div>

          {/* Orange Money */}
          <div className="border border-outline-variant/30 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-on-surface text-sm flex items-center gap-2">
                <span className="w-6 h-6 bg-orange-100 rounded text-orange-700 text-xs font-bold flex items-center justify-center">O</span>
                Orange Money
              </p>
              <Toggle checked={orange.enabled} onChange={() => setOrange(o => ({ ...o, enabled: !o.enabled }))} />
            </div>
            <input value={orange.merchantKey} onChange={e => setOrange(o => ({ ...o, merchantKey: e.target.value }))} className={`${inputCls} ${!orange.enabled ? 'opacity-50 pointer-events-none' : ''}`} placeholder="Merchant Key Orange Money" />
          </div>

          {/* MTN MoMo */}
          <div className="border border-outline-variant/30 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-on-surface text-sm flex items-center gap-2">
                <span className="w-6 h-6 bg-yellow-100 rounded text-yellow-700 text-xs font-bold flex items-center justify-center">M</span>
                MTN Mobile Money
              </p>
              <Toggle checked={mtn.enabled} onChange={() => setMtn(m => ({ ...m, enabled: !m.enabled }))} />
            </div>
            <input value={mtn.apiKey} onChange={e => setMtn(m => ({ ...m, apiKey: e.target.value }))} className={`${inputCls} ${!mtn.enabled ? 'opacity-50 pointer-events-none' : ''}`} placeholder="API Key MTN MoMo" />
          </div>

          {/* Wave */}
          <div className="border border-outline-variant/30 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-on-surface text-sm flex items-center gap-2">
                <span className="w-6 h-6 bg-blue-100 rounded text-blue-700 text-xs font-bold flex items-center justify-center">W</span>
                Wave
              </p>
              <Toggle checked={wave.enabled} onChange={() => setWave(w => ({ ...w, enabled: !w.enabled }))} />
            </div>
            <input value={wave.apiKey} onChange={e => setWave(w => ({ ...w, apiKey: e.target.value }))} className={`${inputCls} ${!wave.enabled ? 'opacity-50 pointer-events-none' : ''}`} placeholder="API Key Wave" />
          </div>

          {/* Moov */}
          <div className="border border-outline-variant/30 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-on-surface text-sm flex items-center gap-2">
                <span className="w-6 h-6 bg-green-100 rounded text-green-700 text-xs font-bold flex items-center justify-center">M</span>
                Moov Money
              </p>
              <Toggle checked={moov.enabled} onChange={() => setMoov(m => ({ ...m, enabled: !m.enabled }))} />
            </div>
            <input value={moov.apiKey} onChange={e => setMoov(m => ({ ...m, apiKey: e.target.value }))} className={`${inputCls} ${!moov.enabled ? 'opacity-50 pointer-events-none' : ''}`} placeholder="API Key Moov Money" />
          </div>

          <button onClick={saveMM} className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors w-fit">
            <Icon name="save" size={16} />Enregistrer tous les opérateurs
          </button>
        </div>
      )}

      {/* Cloud Sync */}
      {section === 'sync' && (
        <CloudSyncTab state={state} dispatch={dispatch} showToast={showToast} />
      )}

      {/* Monitoring */}
      {section === 'monitoring' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
          <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="monitor_heart" filled />Monitoring Système</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Statut application', value: 'Opérationnel', icon: 'check_circle', color: 'text-green-600 bg-green-50' },
              { label: 'Données locales', value: `${(JSON.stringify(state).length / 1024).toFixed(1)} Ko`, icon: 'database', color: 'text-primary bg-primary/10' },
              { label: 'Utilisateurs actifs', value: (state.users || []).filter(u => !u.suspended).length, icon: 'group', color: 'text-secondary bg-secondary/10' },
              { label: 'Biens enregistrés', value: (state.properties || []).length, icon: 'apartment', color: 'text-tertiary bg-tertiary/10' },
              { label: 'Contrats actifs', value: (state.contracts || []).filter(c => c.status === 'Actif').length, icon: 'contract', color: 'text-primary bg-primary/10' },
              { label: 'Paiements en attente', value: (state.payments || []).filter(p => p.status !== 'Payé').length, icon: 'pending', color: 'text-amber-600 bg-amber-50' },
            ].map(s => (
              <div key={s.label} className={`p-4 rounded-xl ${s.color.split(' ')[1]} flex items-center gap-3`}>
                <Icon name={s.icon} size={22} className={s.color.split(' ')[0]} />
                <div>
                  <p className={`font-black text-lg ${s.color.split(' ')[0]}`}>{s.value}</p>
                  <p className="text-xs text-on-surface-variant">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 p-4 bg-surface-container-low rounded-xl">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Dernières activités</p>
            {(state.activityLog || []).slice(0, 8).length === 0
              ? <p className="text-xs text-on-surface-variant">Aucune activité enregistrée.</p>
              : (state.activityLog || []).slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${e.action === 'LOGIN' ? 'bg-green-100 text-green-600' : e.action === 'LOGIN_FAIL' ? 'bg-error/10 text-error' : e.action === 'ADD_USER' ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    <Icon name={e.action === 'LOGIN' ? 'login' : e.action === 'LOGIN_FAIL' ? 'block' : e.action === 'ADD_USER' ? 'person_add' : 'history'} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-on-surface truncate">{e.details}</p>
                    <p className="text-xs text-on-surface-variant">{e.userEmail || ''}</p>
                  </div>
                  <p className="text-xs text-on-surface-variant flex-shrink-0">{e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Role config ────────────────────────────────────────────────────────────── */
const ALL_ROLES = [
  { value: 'ADMIN',      label: 'Administrateur',  color: 'bg-primary-container text-on-primary-container',     icon: 'admin_panel_settings' },
  { value: 'MANAGER',    label: 'Manager',          color: 'bg-secondary-container text-on-secondary-container', icon: 'manage_history' },
  { value: 'ACCOUNTANT', label: 'Comptable',        color: 'bg-tertiary-container text-on-tertiary-container',   icon: 'calculate' },
  { value: 'TECHNICIAN', label: 'Technicien',       color: 'bg-surface-container-high text-on-surface',         icon: 'engineering' },
  { value: 'OWNER',      label: 'Propriétaire',     color: 'bg-tertiary-container text-on-tertiary-container',   icon: 'manage_accounts' },
  { value: 'TENANT',     label: 'Locataire',        color: 'bg-secondary-container text-on-secondary-container', icon: 'person' },
];

const ROLE_MAP = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]));

function UserManagementTab({ state, dispatch, currentUser, showToast }) {
  const users = state.users || [];
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [filter, setFilter] = useState('');
  const [subTab, setSubTab] = useState('users'); // 'users' | 'log' | 'sync'
  const [newUser, setNewUser] = useState({
    name: '', email: '', password: '', role: 'TENANT',
    personId: null, firstLogin: true,
  });
  const importRef2 = useRef();

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(filter.toLowerCase()) ||
    u.email?.toLowerCase().includes(filter.toLowerCase())
  );

  const getInitials = (name) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

  const handleCreate = () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      showToast('Remplissez tous les champs obligatoires');
      return;
    }
    if (users.some(u => u.email.toLowerCase() === newUser.email.toLowerCase())) {
      showToast('Cet email est déjà utilisé');
      return;
    }
    const initials = getInitials(newUser.name);
    const roleInfo = ROLE_MAP[newUser.role] || ROLE_MAP.TENANT;
    dispatch({
      type: 'ADD_USER',
      payload: {
        ...newUser,
        email: newUser.email.trim().toLowerCase(),
        initials,
        color: roleInfo.color,
        firstLogin: true,
      },
    });
    showToast(`Compte créé pour ${newUser.name} — mot de passe temporaire : ${newUser.password}`);
    setNewUser({ name: '', email: '', password: '', role: 'TENANT', personId: null, firstLogin: true });
    setShowCreate(false);
  };

  const handleSuspend = (u) => {
    dispatch({ type: 'SUSPEND_USER', payload: u.id });
    showToast(u.suspended ? `${u.name} réactivé` : `${u.name} suspendu`);
  };

  const handleDelete = (u) => {
    if (!window.confirm(`Supprimer le compte de ${u.name} ? Cette action est irréversible.`)) return;
    dispatch({ type: 'DELETE_USER', payload: u.id });
    showToast(`Compte de ${u.name} supprimé`);
  };

  const handleResetPassword = (u) => {
    const tmpPw = 'Tmp' + Math.random().toString(36).slice(2, 8);
    dispatch({ type: 'CHANGE_PASSWORD', payload: { email: u.email, newPassword: tmpPw } });
    dispatch({ type: 'UPDATE_USER', payload: { ...u, firstLogin: true, password: tmpPw } });
    showToast(`Nouveau mot de passe pour ${u.name} : ${tmpPw}`);
    alert(`Mot de passe temporaire de ${u.name} :\n\n${tmpPw}\n\nCommuniquez-le à l'utilisateur. Il devra le changer à sa prochaine connexion.`);
  };

  const openEdit = (u) => { setEditUser(u); setEditForm({ name: u.name, email: u.email, role: u.role, phone: u.phone || '', personId: u.personId || null }); };

  const handleSaveEdit = () => {
    if (!editForm.name.trim() || !editForm.email.trim()) { showToast('Nom et email requis'); return; }
    const emailConflict = users.some(u => u.email.toLowerCase() === editForm.email.trim().toLowerCase() && u.id !== editUser.id);
    if (emailConflict) { showToast('Cet email est déjà utilisé'); return; }
    const initials = editForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const roleInfo = ROLE_MAP[editForm.role] || ROLE_MAP.TENANT;
    dispatch({ type: 'UPDATE_USER', payload: { ...editUser, ...editForm, email: editForm.email.trim().toLowerCase(), initials, color: roleInfo.color } });
    showToast(`Compte de ${editForm.name} mis à jour`);
    setEditUser(null); setEditForm(null);
  };

  /* Export users JSON */
  const handleExportUsers = () => {
    const data = JSON.stringify(users, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'minsouah_comptes.json';
    a.click(); URL.revokeObjectURL(url);
    showToast('Comptes exportés en JSON');
  };

  /* Export full state */
  const handleExportState = () => {
    const exportData = { ...state, currentUser: null };
    const data = JSON.stringify(exportData);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `minsouah_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Sauvegarde complète exportée');
  };

  /* Import full state */
  const handleImportState = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.users) { showToast('Fichier invalide — pas de comptes trouvés'); return; }
        if (!window.confirm(`Importer ${parsed.users.length} compte(s) et toutes les données depuis ce fichier ?\n\nAttention : vos données actuelles seront remplacées.`)) return;
        dispatch({ type: 'IMPORT_STATE', payload: parsed });
        showToast('Données importées avec succès — reconnectez-vous');
        if (importRef2.current) importRef2.current.value = '';
      } catch { showToast('Fichier JSON invalide'); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-bold text-lg text-on-surface flex items-center gap-2">
          <Icon name="group" filled /> Gestion des Utilisateurs
        </h2>
        {currentUser?.role === 'ADMIN' && subTab === 'users' && (
          <button onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
            <Icon name={showCreate ? 'close' : 'person_add'} size={16} />
            {showCreate ? 'Annuler' : 'Créer un compte'}
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: 'users', label: 'Comptes', icon: 'group' },
          { key: 'log', label: 'Historique', icon: 'history' },
          { key: 'sync', label: 'Sync multi-appareil', icon: 'sync' },
        ].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${subTab === t.key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
            <Icon name={t.icon} size={14} />{t.label}
          </button>
        ))}
      </div>

      {/* Edit modal */}
      {editUser && editForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
              <Icon name="edit" size={18} className="text-primary" />Modifier le compte
            </h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Nom complet</label>
                <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Prénom Nom" />
              </div>
              <div>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Rôle</label>
                <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
                  {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Téléphone</label>
                <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="+225 07 00 00 00 00" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => { setEditUser(null); setEditForm(null); }} className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors">Annuler</button>
              <button onClick={handleSaveEdit} className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2">
                <Icon name="save" size={15} />Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Log sub-tab ── */}
      {subTab === 'log' && (
        <div className="flex flex-col gap-2">
          {(state.activityLog || []).length === 0
            ? <div className="text-center py-10 text-on-surface-variant"><Icon name="history" size={40} className="opacity-30 mb-2" /><p>Aucune activité enregistrée</p></div>
            : (state.activityLog || []).map((e, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${e.action === 'LOGIN' ? 'bg-green-100 text-green-600' : e.action === 'LOGIN_FAIL' ? 'bg-error/10 text-error' : e.action === 'ADD_USER' ? 'bg-primary/10 text-primary' : e.action === 'DELETE_USER' ? 'bg-error/10 text-error' : 'bg-surface-container-high text-on-surface-variant'}`}>
                  <Icon name={e.action === 'LOGIN' ? 'login' : e.action === 'LOGIN_FAIL' ? 'block' : e.action === 'ADD_USER' ? 'person_add' : e.action === 'DELETE_USER' ? 'person_remove' : 'history'} size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{e.details}</p>
                  <p className="text-xs text-on-surface-variant">{e.userEmail || e.userName || ''}</p>
                </div>
                <p className="text-xs text-on-surface-variant flex-shrink-0">{e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</p>
              </div>
            ))
          }
        </div>
      )}

      {/* ── Sync sub-tab ── */}
      {subTab === 'sync' && (
        <div className="flex flex-col gap-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <Icon name="info" size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm mb-1">Pourquoi les comptes ne sont pas visibles sur un autre navigateur ?</p>
              <p className="text-xs text-amber-700">L'application stocke toutes les données en local (localStorage du navigateur). Chaque navigateur/appareil a sa propre copie. Pour partager les données, exportez depuis l'appareil principal et importez sur les autres.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 border border-outline-variant/30 rounded-2xl flex flex-col gap-3">
              <p className="font-semibold text-on-surface flex items-center gap-2"><Icon name="upload" size={18} className="text-primary" />Exporter</p>
              <p className="text-xs text-on-surface-variant">Téléchargez une sauvegarde complète (comptes, biens, contrats, paiements…)</p>
              <button onClick={handleExportState}
                className="px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors w-fit">
                <Icon name="download" size={16} />Exporter la sauvegarde
              </button>
              <button onClick={handleExportUsers}
                className="px-4 py-2 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors w-fit">
                <Icon name="group" size={15} />Exporter comptes seulement
              </button>
            </div>
            <div className="p-5 border border-outline-variant/30 rounded-2xl flex flex-col gap-3">
              <p className="font-semibold text-on-surface flex items-center gap-2"><Icon name="download" size={18} className="text-primary" />Importer</p>
              <p className="text-xs text-on-surface-variant">Chargez une sauvegarde sur ce navigateur/appareil. <strong className="text-error">Remplace toutes les données actuelles.</strong></p>
              <label className="px-4 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors w-fit cursor-pointer">
                <Icon name="upload_file" size={16} />Importer un fichier JSON
                <input ref={importRef2} type="file" accept=".json" className="hidden" onChange={handleImportState} />
              </label>
            </div>
          </div>
          <div className="p-4 bg-surface-container-low rounded-xl">
            <p className="font-semibold text-on-surface text-sm mb-2 flex items-center gap-1"><Icon name="tips_and_updates" size={15} className="text-primary" />Procédure recommandée</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-on-surface-variant">
              <li>Sur l'<strong className="text-on-surface">appareil principal</strong> (là où vous avez créé les comptes), cliquez sur "Exporter la sauvegarde"</li>
              <li>Envoyez le fichier .json à l'utilisateur par email ou WhatsApp</li>
              <li>Sur le <strong className="text-on-surface">nouvel appareil</strong>, allez dans Paramètres → Utilisateurs → Sync et cliquez "Importer"</li>
              <li>L'utilisateur peut ensuite se connecter avec son email et mot de passe temporaire</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── Users sub-tab ── */}
      {subTab === 'users' && <>

      {/* Create form */}
      {showCreate && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mb-6">
          <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
            <Icon name="person_add" size={18} className="text-primary" />
            Nouveau compte utilisateur
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Nom complet *</label>
              <input
                type="text"
                value={newUser.name}
                onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))}
                placeholder="Prénom Nom"
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Email *</label>
              <input
                type="email"
                value={newUser.email}
                onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
                placeholder="email@exemple.com"
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Rôle *</label>
              <select
                value={newUser.role}
                onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
              >
                {ALL_ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Mot de passe temporaire *</label>
              <input
                type="text"
                value={newUser.password}
                onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                placeholder="Ex: Bienvenue2024!"
                className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm font-mono"
              />
            </div>
            {(newUser.role === 'TENANT') && (
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Lier à un locataire</label>
                <select
                  value={newUser.personId || ''}
                  onChange={e => setNewUser(u => ({ ...u, personId: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
                >
                  <option value="">— Aucun lien —</option>
                  {(state.tenants || []).map(t => (
                    <option key={t.id} value={t.id}>{t.name || `${t.firstName} ${t.lastName}`} — {t.email}</option>
                  ))}
                </select>
              </div>
            )}
            {(newUser.role === 'OWNER') && (
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Lier à un propriétaire</label>
                <select
                  value={newUser.personId || ''}
                  onChange={e => setNewUser(u => ({ ...u, personId: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
                >
                  <option value="">— Aucun lien —</option>
                  {(state.owners || []).map(o => (
                    <option key={o.id} value={o.id}>{o.name} — {o.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
            <Icon name="info" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              L'utilisateur devra <strong>changer son mot de passe</strong> dès sa première connexion.
              Communiquez-lui l'email et le mot de passe temporaire ci-dessus.
            </p>
          </div>
          <div className="flex gap-3 mt-4 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors">
              Annuler
            </button>
            <button onClick={handleCreate} className="px-5 py-2 bg-primary text-on-primary text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2">
              <Icon name="person_add" size={16} />
              Créer le compte
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          type="text"
          placeholder="Rechercher par nom ou email..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total', value: users.length, color: 'bg-primary/10 text-primary' },
          { label: 'Actifs', value: users.filter(u => !u.suspended).length, color: 'bg-green-100 text-green-700' },
          { label: 'Suspendus', value: users.filter(u => u.suspended).length, color: 'bg-error/10 text-error' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color.split(' ')[0]}`}>
            <p className={`font-black text-xl ${s.color.split(' ')[1]}`}>{s.value}</p>
            <p className="text-xs text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </div>

      {/* User list */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-on-surface-variant">
            <Icon name="person_off" size={40} className="opacity-30 mb-2" />
            <p>Aucun compte trouvé</p>
          </div>
        )}
        {filtered.map(u => {
          const roleInfo = ROLE_MAP[u.role] || ROLE_MAP.TENANT;
          const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
          const isMe = u.email === currentUser?.email;
          return (
            <div key={u.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              u.suspended ? 'border-error/20 bg-error/5 opacity-70' :
              isMe ? 'border-primary/30 bg-primary/5' :
              'border-outline-variant/20 bg-surface-container hover:bg-surface-container-high'
            }`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${u.color || roleInfo.color}`}>
                {u.initials || u.name?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-on-surface text-sm truncate">{u.name}</p>
                  {isMe && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Moi</span>}
                  {u.firstLogin && !u.suspended && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Première connexion</span>
                  )}
                  {u.suspended && <span className="text-xs bg-error/20 text-error px-1.5 py-0.5 rounded-full">Suspendu</span>}
                  {isLocked && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Bloqué</span>}
                </div>
                <p className="text-xs text-on-surface-variant truncate">{u.email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${roleInfo.color}`}>{roleInfo.label}</span>
                  {u.lastLogin && (
                    <span className="text-xs text-on-surface-variant">
                      Dernière co. : {new Date(u.lastLogin).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                  {u.failedAttempts > 0 && !isLocked && (
                    <span className="text-xs text-amber-600">{u.failedAttempts} tentative(s) échouée(s)</span>
                  )}
                </div>
              </div>
              {currentUser?.role === 'ADMIN' && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors" title="Modifier">
                    <Icon name="edit" size={15} />
                  </button>
                  {!isMe && (<>
                    <button onClick={() => handleResetPassword(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors" title="Réinitialiser le mot de passe">
                      <Icon name="lock_reset" size={16} />
                    </button>
                    <button onClick={() => handleSuspend(u)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${u.suspended ? 'text-green-600 hover:bg-green-50' : 'text-amber-600 hover:bg-amber-50'}`} title={u.suspended ? 'Réactiver' : 'Suspendre'}>
                      <Icon name={u.suspended ? 'play_circle' : 'pause_circle'} size={16} />
                    </button>
                    {u.id !== 1 && (
                      <button onClick={() => handleDelete(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors" title="Supprimer">
                        <Icon name="delete" size={16} />
                      </button>
                    )}
                  </>)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 p-4 bg-surface-container-low rounded-xl border border-outline-variant/20 text-sm text-on-surface-variant">
        <p className="font-semibold text-on-surface mb-1 flex items-center gap-1">
          <Icon name="info" size={15} className="text-primary" />
          Comment ça fonctionne
        </p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Créez un compte avec un email, rôle et mot de passe temporaire</li>
          <li>L'utilisateur se connecte sur la page de connexion avec cet email</li>
          <li>À la première connexion, il est invité à changer son mot de passe</li>
          <li>Pour les locataires/propriétaires, liez le compte à leur profil</li>
          <li>Un compte suspendu ne peut plus se connecter</li>
          <li>5 tentatives échouées → blocage de 15 minutes</li>
          <li>Pour partager les comptes sur un autre navigateur, utilisez l'onglet <strong className="text-on-surface">Sync multi-appareil</strong></li>
        </ul>
      </div>

      </> /* end subTab === 'users' */}
    </div>
  );
}

/* ── Cloud Sync Tab (Firebase REST) ────────────────────────────────────────── */
function CloudSyncTab({ state, dispatch, showToast }) {
  const fb = state.systemSettings?.firebase || {};
  const [cfg, setCfg] = useState({
    enabled: fb.enabled || false,
    databaseURL: fb.databaseURL || '',
    workspaceId: fb.workspaceId || '',
  });
  const [testing, setTesting] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  const save = () => {
    dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { firebase: cfg } });
    showToast('Configuration Cloud enregistrée');
  };

  const testConnection = async () => {
    if (!cfg.databaseURL || !cfg.workspaceId) { showToast('Remplissez l\'URL et l\'identifiant'); return; }
    setTesting(true);
    try {
      const url = `${cfg.databaseURL.replace(/\/$/, '')}/minsouah/${cfg.workspaceId}/ping.json`;
      await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ts: Date.now() }) });
      setSyncStatus('ok');
      showToast('Connexion Firebase réussie !');
    } catch {
      setSyncStatus('error');
      showToast('Erreur de connexion Firebase — vérifiez l\'URL et les règles');
    }
    setTesting(false);
  };

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="cloud_sync" filled />Synchronisation Cloud</h3>
        <Toggle checked={cfg.enabled} onChange={() => setCfg(c => ({ ...c, enabled: !c.enabled }))} />
      </div>

      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
        <p className="font-semibold text-on-surface mb-2 flex items-center gap-1.5 text-sm"><Icon name="tips_and_updates" size={16} className="text-primary" />Configuration Firebase (gratuit)</p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-on-surface-variant">
          <li>Créez un projet sur <strong className="text-on-surface">console.firebase.google.com</strong></li>
          <li>Activez <strong className="text-on-surface">Realtime Database</strong> → mode test</li>
          <li>Copiez l'URL de la base (ex: <code className="bg-surface-container px-1 rounded">https://mon-projet.firebaseio.com</code>)</li>
          <li>Entrez l'URL + un identifiant d'espace unique ci-dessous et enregistrez</li>
          <li>Faites pareil sur tous les appareils — les données se synchroniseront</li>
        </ol>
      </div>

      <div className={`flex flex-col gap-4 ${!cfg.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <Field label="URL Firebase Realtime Database" icon="link">
          <input value={cfg.databaseURL} onChange={e => setCfg(c => ({ ...c, databaseURL: e.target.value }))} className={inputCls} placeholder="https://mon-projet.firebaseio.com" />
        </Field>
        <Field label="Identifiant d'espace (Workspace ID)" icon="key">
          <input value={cfg.workspaceId} onChange={e => setCfg(c => ({ ...c, workspaceId: e.target.value.replace(/\s/g, '-') }))} className={inputCls} placeholder="minsouah-principal-2024" />
          <p className="text-xs text-on-surface-variant mt-1">Utilisez le même identifiant sur tous les appareils.</p>
        </Field>
      </div>

      <div className="flex gap-3 flex-wrap">
        <button onClick={save} className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors">
          <Icon name="save" size={16} />Enregistrer
        </button>
        <button onClick={testConnection} disabled={testing || !cfg.databaseURL || !cfg.workspaceId}
          className="px-5 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors disabled:opacity-50">
          {testing ? <Icon name="progress_activity" size={16} className="animate-spin" /> : <Icon name="wifi_tethering" size={16} />}
          Tester
        </button>
      </div>

      {syncStatus === 'ok' && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm"><Icon name="check_circle" size={16} />Connexion réussie — sync automatique activée.</div>}
      {syncStatus === 'error' && <div className="flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm"><Icon name="error" size={16} />Erreur — vérifiez l'URL et les règles Firebase (mode test).</div>}
      {cfg.enabled && state.systemSettings?.firebase?.enabled && <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/20 rounded-xl text-primary text-sm"><Icon name="cloud_done" size={16} />Sync activée — sauvegarde Firebase toutes les 3 secondes.</div>}
    </div>
  );
}
