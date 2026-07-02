import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import * as XLSX from 'xlsx';
import { hashPwd, verifyPwd } from '../lib/auth';
import { auth } from '../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { getPlan } from '../lib/planLimits';
import { getDaysRemaining, getLicenseStatusInfo } from '../lib/licenses';
import { MODULES, ACTIONS, FULL_ACCESS_ROLES, fullPermissions, effectivePermissions } from '../lib/permissions';
import { SCI_NORA_LOGO, SCI_NORA_STAMP } from '../lib/sciNoraAssets';

// Rôles autorisés par catégorie — SUPER_ADMIN a sa propre page /superadmin
const ADMIN_ROLES  = ['ORGANIZATION_ADMIN', 'ADMIN'];
const STAFF_ROLES  = ['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER'];

const ALL_TABS = [
  { key: 'profile',       label: 'Mon Profil',      icon: 'account_circle',  roles: null },
  { key: 'org',           label: 'Organisation',    icon: 'business',        roles: STAFF_ROLES },
  // 'organizations' retiré de Settings — géré exclusivement dans /superadmin
  { key: 'plan',          label: 'Plan & Licence',  icon: 'verified',        roles: ADMIN_ROLES },
  { key: 'users',         label: 'Utilisateurs',    icon: 'group',           roles: ADMIN_ROLES },
  { key: 'notif',         label: 'Notifications',   icon: 'notifications',   roles: null },
  { key: 'data',          label: 'Données',         icon: 'database',        roles: STAFF_ROLES },
  { key: 'system',        label: 'Intégrations',    icon: 'settings_suggest',roles: ADMIN_ROLES },
  { key: 'security',      label: 'Sécurité',        icon: 'lock',            roles: null },
];

const ROLE_LABELS = {
  ORGANIZATION_ADMIN: 'Admin Organisation',
  AGENT:              'Agent',
  ADMIN:              'Administrateur',
  MANAGER:            'Manager',
  TENANT:             'Locataire',
  OWNER:              'Propriétaire',
  ACCOUNTANT:         'Comptable',
  TECHNICIAN:         'Technicien',
  CONCIERGE:          'Concierge',
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
  const isSciNora = /sci\s*nora/i.test(orgSettings?.companyName || '');
  const [org, setOrg] = useState({
    companyName:  orgSettings?.companyName  || 'Minsouah Immobilier',
    tagline:      orgSettings?.tagline      || '',
    description:  orgSettings?.description  || '',
    address:      orgSettings?.address      || "Abidjan, Côte d'Ivoire",
    city:         orgSettings?.city         || '',
    phone:        orgSettings?.phone        || '',
    phone2:       orgSettings?.phone2       || '',
    email:        orgSettings?.email        || '',
    website:      orgSettings?.website      || '',
    whatsapp:     orgSettings?.whatsapp     || '',
    facebook:     orgSettings?.facebook     || '',
    instagram:    orgSettings?.instagram    || '',
    linkedin:     orgSettings?.linkedin     || '',
    rccm:         orgSettings?.rccm         || '',
    currency:     orgSettings?.currency     || 'XOF',
    language:     orgSettings?.language     || 'fr',
    logo:         orgSettings?.logo         || (isSciNora ? SCI_NORA_LOGO  : ''),
    stamp:        orgSettings?.stamp        || (isSciNora ? SCI_NORA_STAMP : ''),
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
    if (file.size > 10 * 1024 * 1024) { showToast('Image trop grande (max 10 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 256;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setProfile(p => ({ ...p, avatar: canvas.toDataURL('image/jpeg', 0.80) }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  /* ── Org logo ── */
  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('Image trop grande (max 10 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setOrg(o => ({ ...o, logo: canvas.toDataURL('image/png', 0.90) }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  /* ── Org stamp (cachet) ── */
  const handleStampChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('Image trop grande (max 10 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setOrg(o => ({ ...o, stamp: canvas.toDataURL('image/png', 0.90) }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  /* ── Password ── */
  const handlePwChange = async (e) => {
    e.preventDefault();
    const dbUser = (state.users || []).find(u => u.email === currentUser?.email);
    const ok = await verifyPwd(pwForm.current, dbUser?.password);
    if (!ok) { setPwError('Mot de passe actuel incorrect.'); return; }
    if (pwForm.next.length < 8) { setPwError('Au moins 8 caractères requis.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Les mots de passe ne correspondent pas.'); return; }
    setPwError('');
    const hashed = await hashPwd(pwForm.next);
    dispatch({ type: 'CHANGE_PASSWORD', payload: { email: currentUser.email, newPassword: hashed } });
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
  const handleFullReset = async () => {
    if (!window.confirm('Effacer TOUTES les données dans Firestore (biens, locataires, contrats, paiements) ?\n\nLes comptes utilisateurs sont conservés.\nCette action est irréversible.')) return;
    await dispatch({ type: 'RESET' });
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
                    ['ORGANIZATION_ADMIN', 'ADMIN'].includes(currentUser?.role) ? 'bg-primary-container text-on-primary-container' :
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
            <div className="flex flex-col gap-5">

              {/* Brand preview card */}
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5">
                <h2 className="font-bold text-lg text-on-surface mb-4 flex items-center gap-2">
                  <Icon name="business" filled /> Identité visuelle
                </h2>
                <div className="flex items-center gap-5 p-4 bg-surface-container rounded-2xl">
                  <div className="relative flex-shrink-0">
                    {org.logo
                      ? <img src={org.logo} alt="logo" className="w-20 h-20 rounded-2xl object-contain border border-outline-variant/30 bg-white" />
                      : <div className="w-20 h-20 rounded-2xl bg-primary-container flex items-center justify-center text-on-primary-container font-black text-2xl">
                          {(org.companyName || 'M').charAt(0).toUpperCase()}
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-on-surface text-lg leading-tight truncate">{org.companyName || 'Nom de votre agence'}</p>
                    {org.tagline && <p className="text-sm text-on-surface-variant italic mt-0.5 truncate">{org.tagline}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                      {org.phone    && <span className="text-xs text-on-surface-variant flex items-center gap-1"><Icon name="phone" size={12}/>{org.phone}</span>}
                      {org.email    && <span className="text-xs text-on-surface-variant flex items-center gap-1"><Icon name="email" size={12}/>{org.email}</span>}
                      {org.website  && <span className="text-xs text-primary flex items-center gap-1"><Icon name="language" size={12}/>{org.website}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold cursor-pointer hover:bg-primary/90 transition-colors">
                      <Icon name="upload" size={13} /> {org.logo ? 'Changer' : 'Ajouter logo'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                    </label>
                    {org.logo && (
                      <button onClick={() => setOrg(o => ({ ...o, logo: '' }))}
                        className="text-xs text-error text-center hover:underline">Supprimer</button>
                    )}
                  </div>
                </div>

                {/* Cachet / Stamp */}
                <div className="flex items-center gap-4 mt-4 p-4 bg-surface-container rounded-2xl">
                  <div className="relative flex-shrink-0">
                    {org.stamp
                      ? <img src={org.stamp} alt="cachet" className="w-20 h-20 rounded-xl object-contain border border-outline-variant/30 bg-white" />
                      : <div className="w-20 h-20 rounded-xl border-2 border-dashed border-outline-variant flex items-center justify-center text-on-surface-variant">
                          <Icon name="approval" size={32} />
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-on-surface text-sm">Cachet / Tampon officiel</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">Affiché sur les quittances et documents officiels</p>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <label className="flex items-center gap-1.5 px-3 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-semibold cursor-pointer hover:bg-secondary/90 transition-colors">
                      <Icon name="upload" size={13} /> {org.stamp ? 'Changer' : 'Ajouter cachet'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleStampChange} />
                    </label>
                    {org.stamp && (
                      <button onClick={() => setOrg(o => ({ ...o, stamp: '' }))}
                        className="text-xs text-error text-center hover:underline">Supprimer</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Informations générales */}
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5">
                <h3 className="font-bold text-base text-on-surface mb-4 flex items-center gap-2">
                  <Icon name="info" size={18} className="text-primary" /> Informations générales
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nom de l'organisation" icon="business" span>
                    <input value={org.companyName} onChange={e => setOrg(o => ({ ...o, companyName: e.target.value }))} className={inputCls} placeholder="Ex: Agence Cocody Immobilier" />
                  </Field>
                  <Field label="Slogan / Tagline" icon="format_quote" span>
                    <input value={org.tagline} onChange={e => setOrg(o => ({ ...o, tagline: e.target.value }))} className={inputCls} placeholder="Ex: L'immobilier à votre service" />
                  </Field>
                  <Field label="Description courte" icon="description" span>
                    <textarea
                      value={org.description}
                      onChange={e => setOrg(o => ({ ...o, description: e.target.value }))}
                      className={inputCls + ' resize-none'}
                      rows={3}
                      placeholder="Présentez votre agence en quelques lignes…"
                    />
                  </Field>
                  <Field label="N° RCCM / Registre" icon="badge">
                    <input value={org.rccm} onChange={e => setOrg(o => ({ ...o, rccm: e.target.value }))} className={inputCls} placeholder="Ex: CI-ABJ-2023-B-12345" />
                  </Field>
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
              </div>

              {/* Coordonnées */}
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5">
                <h3 className="font-bold text-base text-on-surface mb-4 flex items-center gap-2">
                  <Icon name="location_on" size={18} className="text-primary" /> Coordonnées
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Adresse complète" icon="home" span>
                    <input value={org.address} onChange={e => setOrg(o => ({ ...o, address: e.target.value }))} className={inputCls} placeholder="Ex: Rue des Jardins, Cocody" />
                  </Field>
                  <Field label="Ville" icon="location_city">
                    <input value={org.city} onChange={e => setOrg(o => ({ ...o, city: e.target.value }))} className={inputCls} placeholder="Ex: Abidjan" />
                  </Field>
                  <Field label="Téléphone principal" icon="phone">
                    <input value={org.phone} onChange={e => setOrg(o => ({ ...o, phone: e.target.value }))} className={inputCls} placeholder="+225 07 00 00 00 00" />
                  </Field>
                  <Field label="Téléphone secondaire" icon="phone">
                    <input value={org.phone2} onChange={e => setOrg(o => ({ ...o, phone2: e.target.value }))} className={inputCls} placeholder="+225 05 00 00 00 00" />
                  </Field>
                  <Field label="Email professionnel" icon="email">
                    <input type="email" value={org.email} onChange={e => setOrg(o => ({ ...o, email: e.target.value }))} className={inputCls} placeholder="contact@agence.ci" />
                  </Field>
                  <Field label="Site web" icon="language">
                    <input value={org.website} onChange={e => setOrg(o => ({ ...o, website: e.target.value }))} className={inputCls} placeholder="www.agence.ci" />
                  </Field>
                  <Field label="WhatsApp Business" icon="chat">
                    <input value={org.whatsapp} onChange={e => setOrg(o => ({ ...o, whatsapp: e.target.value }))} className={inputCls} placeholder="+225 07 00 00 00 00" />
                  </Field>
                </div>
              </div>

              {/* Réseaux sociaux */}
              <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5">
                <h3 className="font-bold text-base text-on-surface mb-4 flex items-center gap-2">
                  <Icon name="share" size={18} className="text-primary" /> Réseaux sociaux
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Page Facebook" icon="thumb_up">
                    <input value={org.facebook} onChange={e => setOrg(o => ({ ...o, facebook: e.target.value }))} className={inputCls} placeholder="facebook.com/votre-agence" />
                  </Field>
                  <Field label="Instagram" icon="photo_camera">
                    <input value={org.instagram} onChange={e => setOrg(o => ({ ...o, instagram: e.target.value }))} className={inputCls} placeholder="instagram.com/votre-agence" />
                  </Field>
                  <Field label="LinkedIn" icon="work">
                    <input value={org.linkedin} onChange={e => setOrg(o => ({ ...o, linkedin: e.target.value }))} className={inputCls} placeholder="linkedin.com/company/votre-agence" />
                  </Field>
                </div>
              </div>

              <button onClick={() => save('org', org)}
                className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors flex items-center gap-2 self-start">
                <Icon name="save" size={18} /> Enregistrer les modifications
              </button>
            </div>
          )}

          {/* ══════════ PLAN & LICENCE ══════════ */}
          {tab === 'plan' && (
            <PlanLicenceTab state={state} />
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

              {/* Reset section — admin only */}
              {['ORGANIZATION_ADMIN', 'ADMIN'].includes(currentUser?.role) && (
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

/* ── SystemTab (Intégrations par organisation) ──────────────────────────────── */
// SMTP, sync cloud et monitoring sont SUPER_ADMIN uniquement → /superadmin
// Cet onglet expose uniquement les intégrations propres à l'organisation.
function SystemTab({ state, dispatch, showToast }) {
  const sys = state.systemSettings || {};
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
  const [section, setSection] = useState('whatsapp');

  const saveWa = () => {
    dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { whatsapp: wa } });
    showToast('Configuration WhatsApp enregistrée');
  };
  const saveMM = () => {
    dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { mobileMoney: { cinetpay, orange, mtn, wave, moov } } });
    showToast('Configuration Mobile Money enregistrée');
  };

  // Sections disponibles pour ORGANIZATION_ADMIN — SMTP/monitoring réservés au SuperAdmin
  const SECTIONS = [
    { key: 'whatsapp', label: 'WhatsApp Business', icon: 'chat' },
    { key: 'mobilemoney', label: 'Mobile Money', icon: 'payments' },
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

    </div>
  );
}

/* ── Role config ────────────────────────────────────────────────────────────── */
const ALL_ROLES = [
  { value: 'ORGANIZATION_ADMIN', label: 'Admin Organisation', color: 'bg-primary-container text-on-primary-container',     icon: 'admin_panel_settings' },
  { value: 'AGENT',              label: 'Agent',              color: 'bg-secondary-container text-on-secondary-container', icon: 'manage_history' },
  { value: 'OWNER',              label: 'Propriétaire',       color: 'bg-tertiary-container text-on-tertiary-container',   icon: 'manage_accounts' },
  { value: 'TENANT',             label: 'Locataire',          color: 'bg-secondary-container text-on-secondary-container', icon: 'person' },
];

const ROLE_MAP = Object.fromEntries(ALL_ROLES.map(r => [r.value, r]));

// Permissions apply only to staff roles that aren't full-access admins and aren't
// portal-only accounts (tenant/owner). In practice: AGENT (+ legacy staff roles).
const rolePermissionsApply = (role) =>
  !FULL_ACCESS_ROLES.includes(role) && role !== 'TENANT' && role !== 'OWNER';

/* ── Fine-grained permissions editor (module × action matrix) ──────────────── */
function PermissionsEditor({ value, onChange }) {
  const perms = value || {};

  const toggle = (modKey, action) => {
    const cur = new Set(perms[modKey] || []);
    if (cur.has(action)) {
      cur.delete(action);
      if (action === 'view') cur.clear(); // no "view" → no access to the module at all
    } else {
      cur.add(action);
      if (action !== 'view') cur.add('view'); // any action implies the ability to view
    }
    const next = { ...perms };
    if (cur.size) next[modKey] = [...cur]; else delete next[modKey];
    onChange(next);
  };

  const toggleModuleRow = (mod) => {
    const cur = perms[mod.key] || [];
    const next = { ...perms };
    if (cur.length >= mod.actions.length) delete next[mod.key];
    else next[mod.key] = [...mod.actions];
    onChange(next);
  };

  const grantedCount = MODULES.filter(m => (perms[m.key] || []).includes('view')).length;

  return (
    <div className="md:col-span-2">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide flex items-center gap-1.5">
          <Icon name="lock" size={14} className="text-primary" />
          Accès autorisés · {grantedCount}/{MODULES.length} module(s)
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => onChange(fullPermissions())}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
            Tout cocher
          </button>
          <button type="button" onClick={() => onChange({})}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container transition-colors">
            Tout décocher
          </button>
        </div>
      </div>
      <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-high">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-bold text-on-surface-variant uppercase tracking-wide">Fonction</th>
                {ACTIONS.map(a => (
                  <th key={a.key} className="px-2 py-2 text-xs font-bold text-on-surface-variant text-center w-20">{a.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {MODULES.map(mod => {
                const cur = perms[mod.key] || [];
                return (
                  <tr key={mod.key} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => toggleModuleRow(mod)}
                        className="flex items-center gap-2 text-on-surface font-medium hover:text-primary transition-colors text-left">
                        <Icon name={mod.icon} size={16} className="text-on-surface-variant" />
                        {mod.label}
                      </button>
                    </td>
                    {ACTIONS.map(a => {
                      const supported = mod.actions.includes(a.key);
                      const checked = cur.includes(a.key);
                      return (
                        <td key={a.key} className="px-2 py-2 text-center">
                          {supported ? (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(mod.key, a.key)}
                              className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/40 cursor-pointer accent-primary"
                            />
                          ) : (
                            <span className="text-outline">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant mt-1.5">
        Cocher une action active automatiquement « Consulter ». Décocher « Consulter » retire tout l'accès au module.
      </p>
    </div>
  );
}

function UserManagementTab({ state, dispatch, currentUser, showToast }) {
  // Only show users from the same org (state.users is unfiltered for cross-org login to work)
  const users = (state.users || []).filter(u =>
    u.orgId === currentUser?.orgId && u.role !== 'SUPER_ADMIN'
  );
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [filter, setFilter] = useState('');
  const [subTab, setSubTab] = useState('users'); // 'users' | 'log' | 'sync'
  const [quickRoleUserId, setQuickRoleUserId] = useState(null);
  const [newUser, setNewUser] = useState({
    name: '', email: '', password: '', role: 'TENANT',
    personId: null, firstLogin: true, permissions: null,
  });
  const importRef2 = useRef();

  const filtered = users.filter(u =>
    u.name?.toLowerCase().includes(filter.toLowerCase()) ||
    u.email?.toLowerCase().includes(filter.toLowerCase())
  );

  const getInitials = (name) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

  const handleCreate = async () => {
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
    // Firebase Auth needs plain-text password — create account before hashing
    let firebaseUid = null;
    try {
      const cred = await createUserWithEmailAndPassword(auth, newUser.email.trim().toLowerCase(), newUser.password);
      firebaseUid = cred.user.uid;
    } catch (fbErr) {
      if (fbErr?.code !== 'auth/email-already-in-use') {
        console.warn('Firebase Auth createUser:', fbErr?.code, fbErr?.message);
      }
    }
    const hashedPw = await hashPwd(newUser.password);
    const permissions = rolePermissionsApply(newUser.role)
      ? (newUser.permissions || fullPermissions())
      : null;
    dispatch({
      type: 'ADD_USER',
      payload: {
        ...newUser,
        password: hashedPw,
        email: newUser.email.trim().toLowerCase(),
        initials,
        color: roleInfo.color,
        firstLogin: true,
        firebaseUid,
        permissions,
      },
    });
    showToast(`Compte créé pour ${newUser.name} — mot de passe temporaire : ${newUser.password}`);
    setNewUser({ name: '', email: '', password: '', role: 'TENANT', personId: null, firstLogin: true, permissions: null });
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

  const handleResetPassword = async (u) => {
    const tmpPw = 'Tmp' + Math.random().toString(36).slice(2, 8);
    const hashedTmp = await hashPwd(tmpPw);
    dispatch({ type: 'CHANGE_PASSWORD', payload: { email: u.email, newPassword: hashedTmp } });
    dispatch({ type: 'UPDATE_USER', payload: { ...u, firstLogin: true, password: hashedTmp } });
    showToast(`Nouveau mot de passe pour ${u.name} : ${tmpPw}`);
    alert(`Mot de passe temporaire de ${u.name} :\n\n${tmpPw}\n\nCommuniquez-le à l'utilisateur. Il devra le changer à sa prochaine connexion.`);
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({
      name: u.name, email: u.email, role: u.role, phone: u.phone || '', personId: u.personId || null,
      // reflect the user's *effective* access so the admin edits from the real state
      permissions: rolePermissionsApply(u.role) ? effectivePermissions(u) : (u.permissions || null),
      orgIds: u.orgIds?.length ? u.orgIds : [u.orgId || currentUser?.orgId || 'default'],
    });
  };

  const handleSaveEdit = () => {
    if (!editForm.name.trim() || !editForm.email.trim()) { showToast('Nom et email requis'); return; }
    const emailConflict = users.some(u => u.email.toLowerCase() === editForm.email.trim().toLowerCase() && u.id !== editUser.id);
    if (emailConflict) { showToast('Cet email est déjà utilisé'); return; }
    const initials = editForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const roleInfo = ROLE_MAP[editForm.role] || ROLE_MAP.TENANT;
    const permissions = rolePermissionsApply(editForm.role)
      ? (editForm.permissions || fullPermissions())
      : null;
    // keep orgId consistent with the org membership list
    const orgIds = editForm.orgIds?.length ? editForm.orgIds : [editUser.orgId || currentUser?.orgId || 'default'];
    const orgId = orgIds.includes(editUser.orgId) ? editUser.orgId : orgIds[0];
    dispatch({ type: 'UPDATE_USER', payload: { ...editUser, ...editForm, orgIds, orgId, permissions, email: editForm.email.trim().toLowerCase(), initials, color: roleInfo.color } });
    showToast(`Compte de ${editForm.name} mis à jour`);
    setEditUser(null); setEditForm(null);
  };

  const handleQuickRole = (u, newRole) => {
    const roleInfo = ROLE_MAP[newRole] || ROLE_MAP.TENANT;
    dispatch({ type: 'UPDATE_USER', payload: { ...u, role: newRole, color: roleInfo.color } });
    showToast(`Rôle de ${u.name} changé en ${roleInfo.label}`);
    setQuickRoleUserId(null);
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
        {['ORGANIZATION_ADMIN', 'ADMIN'].includes(currentUser?.role) && subTab === 'users' && (
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
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
              <Icon name="edit" size={18} className="text-primary" />Modifier le compte
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

              {rolePermissionsApply(editForm.role) && (
                <PermissionsEditor
                  value={editForm.permissions || fullPermissions()}
                  onChange={perms => setEditForm(f => ({ ...f, permissions: perms }))}
                />
              )}
              {FULL_ACCESS_ROLES.includes(editForm.role) && (
                <div className="md:col-span-2 p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-2">
                  <Icon name="admin_panel_settings" size={16} className="text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-on-surface">Un <strong>Admin Organisation</strong> a accès complet à toutes les fonctions — aucune restriction possible.</p>
                </div>
              )}

              {/* Multi-organisation — assign the agent to several organizations */}
              {['ORGANIZATION_ADMIN', 'ADMIN'].includes(currentUser?.role) && (state.organizations || []).length > 1 && (
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <Icon name="corporate_fare" size={14} className="text-primary" />
                    Organisations gérées · {editForm.orgIds?.length || 1}
                  </label>
                  <div className="border border-outline-variant/30 rounded-xl divide-y divide-outline-variant/20 max-h-40 overflow-y-auto">
                    {(state.organizations || []).map(org => {
                      const checked = (editForm.orgIds || []).includes(org.id);
                      const isPrimary = org.id === editUser.orgId;
                      return (
                        <label key={org.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-container-low cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isPrimary}
                            onChange={() => setEditForm(f => {
                              const set = new Set(f.orgIds || []);
                              if (set.has(org.id)) set.delete(org.id); else set.add(org.id);
                              set.add(editUser.orgId); // always keep the primary org
                              return { ...f, orgIds: [...set] };
                            })}
                            className="w-4 h-4 rounded accent-primary cursor-pointer"
                          />
                          <span className="text-sm text-on-surface flex-1">{org.name || org.id}</span>
                          {isPrimary && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Principale</span>}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1.5">
                    L'agent pourra basculer entre ces organisations depuis le sélecteur en haut de la barre latérale.
                  </p>
                </div>
              )}
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
          {/* Firebase sync status */}
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-green-800 text-sm mb-1">Synchronisation temps réel active — Firebase Firestore</p>
              <p className="text-xs text-green-700">
                Toutes les données sont stockées dans Firebase et synchronisées automatiquement sur tous les appareils et navigateurs en temps réel.
                Aucune action manuelle n'est nécessaire.
              </p>
            </div>
          </div>

          {/* Backup / restore */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 border border-outline-variant/30 rounded-2xl flex flex-col gap-3">
              <p className="font-semibold text-on-surface flex items-center gap-2">
                <Icon name="backup" size={18} className="text-primary" />Sauvegarde locale
              </p>
              <p className="text-xs text-on-surface-variant">
                Téléchargez une copie JSON de toutes vos données Firestore (comptes, biens, contrats, paiements…) à titre de sauvegarde.
              </p>
              <button onClick={handleExportState}
                className="px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors w-fit">
                <Icon name="download" size={16} />Télécharger la sauvegarde
              </button>
              <button onClick={handleExportUsers}
                className="px-4 py-2 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors w-fit">
                <Icon name="group" size={15} />Exporter comptes seulement
              </button>
            </div>
            <div className="p-5 border border-outline-variant/30 rounded-2xl flex flex-col gap-3">
              <p className="font-semibold text-on-surface flex items-center gap-2">
                <Icon name="restore" size={18} className="text-primary" />Restauration
              </p>
              <p className="text-xs text-on-surface-variant">
                Importez une sauvegarde JSON dans Firestore.{' '}
                <strong className="text-error">Fusionne avec les données existantes.</strong>
              </p>
              <label className="px-4 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors w-fit cursor-pointer">
                <Icon name="upload_file" size={16} />Importer depuis JSON
                <input ref={importRef2} type="file" accept=".json" className="hidden" onChange={handleImportState} />
              </label>
            </div>
          </div>

          <div className="p-4 bg-surface-container-low rounded-xl">
            <p className="font-semibold text-on-surface text-sm mb-2 flex items-center gap-1">
              <Icon name="info" size={15} className="text-primary" />Comment ça fonctionne
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs text-on-surface-variant">
              <li>Chaque modification est enregistrée <strong className="text-on-surface">instantanément</strong> dans Firebase Firestore</li>
              <li>Tous les appareils connectés (téléphone, tablette, desktop) reçoivent les mises à jour en temps réel</li>
              <li>Les données persistent même après fermeture du navigateur ou redémarrage</li>
              <li>Aucune synchronisation manuelle n'est requise</li>
            </ul>
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
            {rolePermissionsApply(newUser.role) && (
              <PermissionsEditor
                value={newUser.permissions || fullPermissions()}
                onChange={perms => setNewUser(u => ({ ...u, permissions: perms }))}
              />
            )}
            {FULL_ACCESS_ROLES.includes(newUser.role) && (
              <div className="md:col-span-2 p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-2">
                <Icon name="admin_panel_settings" size={16} className="text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-on-surface">Un <strong>Admin Organisation</strong> a accès complet à toutes les fonctions — aucune restriction possible.</p>
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

      {/* Overlay to close quick role picker */}
      {quickRoleUserId && (
        <div className="fixed inset-0 z-10" onClick={() => setQuickRoleUserId(null)} />
      )}

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
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {/* Role badge — clickable for ADMIN to quick-change role */}
                  <div className="relative">
                    {['ORGANIZATION_ADMIN', 'ADMIN'].includes(currentUser?.role) && !isMe ? (
                      <button
                        onClick={() => setQuickRoleUserId(quickRoleUserId === u.id ? null : u.id)}
                        className={`text-xs px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-1 hover:ring-2 hover:ring-primary/40 transition-all ${roleInfo.color}`}
                        title="Cliquer pour changer le rôle">
                        {roleInfo.label}
                        <Icon name="expand_more" size={12} />
                      </button>
                    ) : (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${roleInfo.color}`}>{roleInfo.label}</span>
                    )}
                    {/* Quick role picker popover */}
                    {quickRoleUserId === u.id && (
                      <div className="absolute left-0 top-7 z-20 bg-surface rounded-xl shadow-xl border border-outline-variant/30 py-1 min-w-[160px]">
                        <p className="px-3 py-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wide border-b border-outline-variant/20 mb-1">
                          Changer le rôle
                        </p>
                        {ALL_ROLES.map(r => (
                          <button key={r.value} onClick={() => handleQuickRole(u, r.value)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold hover:bg-surface-container transition-colors text-left ${u.role === r.value ? 'text-primary' : 'text-on-surface'}`}>
                            <Icon name={r.icon} size={14} />
                            {r.label}
                            {u.role === r.value && <Icon name="check" size={12} className="ml-auto text-primary" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
              {['ORGANIZATION_ADMIN', 'ADMIN'].includes(currentUser?.role) && (
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


/* ── PlanLicenceTab ─────────────────────────────────────────────────────────── */
const PLAN_COLORS = {
  standard:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-800' },
  pro:        { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-800' },
  enterprise: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800' },
};

const FEATURE_LIST = [
  { key: 'advancedExport',   icon: 'picture_as_pdf',    label: 'Export PDF avancé' },
  { key: 'apiAccess',        icon: 'api',               label: 'Accès API' },
  { key: 'multiOrg',         icon: 'corporate_fare',    label: 'Multi-organisations' },
  { key: 'prioritySupport',  icon: 'support_agent',     label: 'Support prioritaire' },
];

function UsageGauge({ label, icon, current, max }) {
  const isUnlimited = max === Infinity || max == null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100));
  const critical = !isUnlimited && pct >= 90;
  const warn = !isUnlimited && pct >= 70;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-on-surface">
          <Icon name={icon} size={15} className="text-on-surface-variant" />
          {label}
        </span>
        <span className={`font-bold text-xs ${critical ? 'text-error' : warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>
          {current} / {isUnlimited ? '∞' : max}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${critical ? 'bg-error' : warn ? 'bg-amber-400' : 'bg-primary'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <div className="h-2 rounded-full bg-green-100 overflow-hidden">
          <div className="h-full w-full bg-green-400 opacity-40 rounded-full" />
        </div>
      )}
    </div>
  );
}

function PlanLicenceTab({ state }) {
  const orgId = state.currentUser?.orgId || 'default';
  const license = (state.licenses || []).find(l =>
    l.orgId === orgId && (l.status === 'trial' || l.status === 'active')
  ) || (state.licenses || []).find(l => l.orgId === orgId);

  const planId = license?.plan || 'pro';
  const plan = getPlan(planId);
  const statusInfo = getLicenseStatusInfo(license);
  const daysLeft = getDaysRemaining(license);
  const pc = PLAN_COLORS[planId] || PLAN_COLORS.pro;

  const userCount   = (state.users       || []).filter(u => u.orgId === orgId && u.role !== 'SUPER_ADMIN').length;
  const propCount   = (state.properties  || []).filter(p => p.orgId === orgId).length;
  const tenantCount = (state.tenants     || []).filter(t => t.orgId === orgId).length;

  return (
    <div className="flex flex-col gap-4">

      {/* ── Licence card ── */}
      <div className={`rounded-2xl border p-5 ${pc.bg} ${pc.border}`}>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Plan actuel</p>
            <h3 className={`text-2xl font-black capitalize ${pc.text}`}>{planId}</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {plan.monthlyPrice
                ? `${plan.monthlyPrice.toLocaleString('fr-FR')} XOF / mois`
                : 'Sur devis'}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-bold flex items-center gap-1.5 ${statusInfo.color}`}>
            <Icon name={statusInfo.icon} size={14} />
            {statusInfo.label}
          </span>
        </div>

        {license?.key && (
          <div className="flex items-center gap-2 bg-white/60 rounded-xl px-3 py-2 mb-2">
            <Icon name="key" size={14} className="text-on-surface-variant flex-shrink-0" />
            <code className="text-xs font-mono text-on-surface flex-1 select-all break-all">{license.key}</code>
          </div>
        )}

        {daysLeft !== null && (
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <Icon name="schedule" size={13} />
            {license?.status === 'trial' ? "Essai · " : "Expire dans "}
            <strong className={daysLeft <= 7 ? 'text-error' : daysLeft <= 30 ? 'text-amber-600' : 'text-on-surface'}>
              {daysLeft} jour{daysLeft !== 1 ? 's' : ''}
            </strong>
            {license?.expiresAt && (
              <span className="ml-1">· {new Date(license.expiresAt).toLocaleDateString('fr-FR')}</span>
            )}
          </div>
        )}

        {!license && (
          <p className="text-sm text-on-surface-variant italic">Aucune licence trouvée pour cette organisation.</p>
        )}
      </div>

      {/* ── Usage gauges ── */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5">
        <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2">
          <Icon name="bar_chart" size={18} /> Utilisation des ressources
        </h3>
        <div className="flex flex-col gap-4">
          <UsageGauge label="Utilisateurs"       icon="group"  current={userCount}   max={plan.maxUsers} />
          <UsageGauge label="Biens immobiliers"  icon="domain" current={propCount}   max={plan.maxProperties} />
          <UsageGauge label="Locataires"         icon="person" current={tenantCount} max={plan.maxTenants} />
        </div>
      </div>

      {/* ── Features ── */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5">
        <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2">
          <Icon name="star" size={18} /> Fonctionnalités du plan
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURE_LIST.map(({ key, label }) => {
            const included = plan.features?.[key];
            return (
              <div key={key} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium ${
                included
                  ? 'bg-green-50 text-green-700'
                  : 'bg-surface-container text-on-surface-variant/50'
              }`}>
                <Icon name={included ? 'check_circle' : 'cancel'} size={16} filled={included} className={included ? 'text-green-600' : 'text-on-surface-variant/40'} />
                {label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Upgrade CTA ── */}
      {planId !== 'enterprise' && (
        <div className="bg-gradient-to-br from-primary/5 to-secondary/10 border border-primary/20 rounded-2xl p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="font-bold text-on-surface mb-1">
                {planId === 'standard' ? 'Passer au plan Pro' : 'Passer au plan Enterprise'}
              </p>
              <p className="text-sm text-on-surface-variant">
                {planId === 'standard'
                  ? '5 utilisateurs · 150 biens · 1 000 locataires · Export PDF avancé'
                  : 'Ressources illimitées · API · Support prioritaire dédié'}
              </p>
            </div>
            <a
              href="mailto:contact@minsouah.ci?subject=Demande upgrade plan Minsouah"
              className="px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors flex items-center gap-2 flex-shrink-0"
            >
              <Icon name="upgrade" size={15} /> Mettre à niveau
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
