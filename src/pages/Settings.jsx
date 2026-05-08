import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import * as XLSX from 'xlsx';

const TABS = [
  { key: 'profile',  label: 'Mon Profil',      icon: 'account_circle' },
  { key: 'org',      label: 'Organisation',     icon: 'business' },
  { key: 'users',    label: 'Utilisateurs',     icon: 'group' },
  { key: 'notif',    label: 'Notifications',    icon: 'notifications' },
  { key: 'data',     label: 'Données',          icon: 'database' },
  { key: 'security', label: 'Sécurité',         icon: 'lock' },
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
    const storedPw = currentUser?.password || 'admin123';
    if (pwForm.current !== storedPw) { setPwError('Mot de passe actuel incorrect.'); return; }
    if (pwForm.next.length < 8) { setPwError('Au moins 8 caractères requis.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return; }
    setPwError('');
    dispatch({ type: 'UPDATE_SETTINGS', payload: { type: 'profile', data: { password: pwForm.next } } });
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

              {/* Reset section */}
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
  const [filter, setFilter] = useState('');
  const [newUser, setNewUser] = useState({
    name: '', email: '', password: '', role: 'TENANT',
    personId: null, firstLogin: true,
  });

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
    showToast(`Nouveau mot de passe temporaire pour ${u.name} : ${tmpPw}`);
    alert(`Mot de passe temporaire de ${u.name} :\n\n${tmpPw}\n\nCommuniquez-le à l'utilisateur. Il devra le changer à sa prochaine connexion.`);
  };

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="font-bold text-lg text-on-surface flex items-center gap-2">
          <Icon name="group" filled /> Gestion des Comptes
        </h2>
        {currentUser?.role === 'ADMIN' && (
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <Icon name={showCreate ? 'close' : 'person_add'} size={16} />
            {showCreate ? 'Annuler' : 'Créer un compte'}
          </button>
        )}
      </div>

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
              {currentUser?.role === 'ADMIN' && !isMe && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleResetPassword(u)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-colors"
                    title="Réinitialiser le mot de passe"
                  >
                    <Icon name="lock_reset" size={16} />
                  </button>
                  <button
                    onClick={() => handleSuspend(u)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      u.suspended
                        ? 'text-green-600 hover:bg-green-50'
                        : 'text-amber-600 hover:bg-amber-50'
                    }`}
                    title={u.suspended ? 'Réactiver' : 'Suspendre'}
                  >
                    <Icon name={u.suspended ? 'play_circle' : 'pause_circle'} size={16} />
                  </button>
                  {u.id !== 1 && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
                      title="Supprimer"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  )}
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
        </ul>
      </div>
    </div>
  );
}
