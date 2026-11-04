import { useState, useEffect, Component, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { isLicenseValid } from './lib/licenses';
import { canView, firstAllowedPath } from './lib/permissions';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from './lib/firebase';
import Layout from './components/Layout';
import Icon from './components/Icon';

// Login reste en import direct : c'est le premier écran, on le veut instantané.
import Login from './pages/Login';

// Les autres pages sont chargées À LA DEMANDE (code-splitting). Au lieu d'un seul
// fichier de 2 Mo à télécharger avant d'afficher quoi que ce soit, chaque page a
// désormais son propre petit fichier chargé seulement quand on l'ouvre → l'accès
// à la plateforme est bien plus rapide. Un court écran de chargement s'affiche le
// temps qu'une page se télécharge la première fois (voir <Suspense> plus bas).
// Fonctions d'import (réutilisées pour le lazy ET pour le préchargement en
// arrière-plan — voir usePrefetchPages plus bas).
const load = {
  ChangePassword:     () => import('./pages/ChangePassword'),
  Dashboard:          () => import('./pages/Dashboard'),
  Assets:             () => import('./pages/Assets'),
  Rental:             () => import('./pages/Rental'),
  Finance:            () => import('./pages/Finance'),
  Payments:           () => import('./pages/Payments'),
  Maintenance:        () => import('./pages/Maintenance'),
  Inbox:              () => import('./pages/Inbox'),
  TenantPortal:       () => import('./pages/TenantPortal'),
  OwnerPortal:        () => import('./pages/OwnerPortal'),
  Settings:           () => import('./pages/Settings'),
  Inspections:        () => import('./pages/Inspections'),
  ConciergePortal:    () => import('./pages/ConciergePortal'),
  SuperAdmin:         () => import('./pages/SuperAdmin'),
  OrgRegistration:    () => import('./pages/OrgRegistration'),
  Marketplace:        () => import('./pages/Marketplace'),
  Calendar:           () => import('./pages/Calendar'),
  Insurance:          () => import('./pages/Insurance'),
  PublicTenantPortal: () => import('./pages/PublicTenantPortal'),
  Referrers:          () => import('./pages/Referrers'),
  Prestataires:       () => import('./pages/Prestataires'),
  Reports:            () => import('./pages/Reports'),
  Bordereaux:         () => import('./pages/Bordereaux'),
  RevenusMinsouah:    () => import('./pages/RevenusMinsouah'),
  PublicBordereau:    () => import('./pages/PublicBordereau'),
  PublicQuittance:    () => import('./pages/PublicQuittance'),
};

const ChangePassword     = lazy(load.ChangePassword);
const Dashboard          = lazy(load.Dashboard);
const Assets             = lazy(load.Assets);
const Rental             = lazy(load.Rental);
const Finance            = lazy(load.Finance);
const Payments           = lazy(load.Payments);
const Maintenance        = lazy(load.Maintenance);
const Inbox              = lazy(load.Inbox);
const TenantPortal       = lazy(load.TenantPortal);
const OwnerPortal        = lazy(load.OwnerPortal);
const Settings           = lazy(load.Settings);
const Inspections        = lazy(load.Inspections);
const ConciergePortal    = lazy(load.ConciergePortal);
const SuperAdmin         = lazy(load.SuperAdmin);
const OrgRegistration    = lazy(load.OrgRegistration);
const Marketplace        = lazy(load.Marketplace);
const Calendar           = lazy(load.Calendar);
const Insurance          = lazy(load.Insurance);
const PublicTenantPortal = lazy(load.PublicTenantPortal);
const Referrers          = lazy(load.Referrers);
const Prestataires       = lazy(load.Prestataires);
const Reports            = lazy(load.Reports);
const Bordereaux         = lazy(load.Bordereaux);
const RevenusMinsouah    = lazy(load.RevenusMinsouah);
const PublicBordereau    = lazy(load.PublicBordereau);
const PublicQuittance    = lazy(load.PublicQuittance);

// Précharge les pages courantes en arrière-plan APRÈS le premier affichage, pour
// que la navigation soit instantanée (plus d'écran de chargement à chaque page)
// sans alourdir le démarrage. Les pages rares (super-admin, inscription, portails
// publics) ne sont pas préchargées.
function usePrefetchPages() {
  useEffect(() => {
    const prefetch = () => {
      ['Dashboard', 'Assets', 'Rental', 'Payments', 'Finance', 'Settings',
       'Reports', 'Bordereaux', 'RevenusMinsouah', 'Calendar', 'Maintenance',
       'Inbox', 'Inspections', 'Insurance', 'Referrers', 'Prestataires']
        .forEach((k) => { try { load[k] && load[k](); } catch { /* ignore */ } });
    };
    const w = window;
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(prefetch, { timeout: 3000 })
      : setTimeout(prefetch, 1500);
    return () => { try { w.cancelIdleCallback ? w.cancelIdleCallback(id) : clearTimeout(id); } catch { /* ignore */ } };
  }, []);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
});

const ROLE_HOME = {
  SUPER_ADMIN:        '/superadmin',
  ORGANIZATION_ADMIN: '/',
  AGENT:              '/',
  TENANT:             '/portal/tenant',
  OWNER:              '/portal/owner',
  // legacy (kept for existing sessions until migration runs)
  ADMIN:     '/',
  MANAGER:   '/',
  CONCIERGE: '/concierge',
  TECHNICIAN:'/',
  ACCOUNTANT:'/',
};

function BootstrapScreen() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
        <Icon name="domain" size={32} className="text-on-primary" />
      </div>
      <h1 className="font-black text-3xl text-primary tracking-tight">Minsouah</h1>
      <div className="flex items-center gap-2 text-on-surface-variant text-sm">
        <Icon name="progress_activity" size={18} className="animate-spin text-primary" />
        Chargement des données…
      </div>
    </div>
  );
}

function SuspendedScreen({ license, onLogout }) {
  const isExpired = license?.status === 'suspended' || (license?.expiresAt && new Date(license.expiresAt) < new Date());
  const wasTrialExpired = license?.trialDays > 0 && isExpired;
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-error/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
          <Icon name="lock" size={36} className="text-error" />
        </div>
        <h1 className="font-black text-2xl text-on-surface mb-2">
          {wasTrialExpired ? 'Période d\'essai terminée' : 'Accès suspendu'}
        </h1>
        <p className="text-on-surface-variant text-sm mb-6">
          {wasTrialExpired
            ? 'Votre période d\'essai gratuite est arrivée à expiration. Contactez votre administrateur pour activer une licence.'
            : 'Votre licence a été suspendue. Contactez votre administrateur Minsouah pour rétablir l\'accès.'}
        </p>
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5 mb-6 text-left">
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Que faire ?</p>
          <ul className="flex flex-col gap-2.5">
            <li className="flex items-start gap-2.5 text-sm text-on-surface">
              <Icon name="mail" size={16} className="text-primary flex-shrink-0 mt-0.5" />
              Contactez votre administrateur ou l'équipe Minsouah
            </li>
            <li className="flex items-start gap-2.5 text-sm text-on-surface">
              <Icon name="verified" size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
              Choisissez un plan Standard, Pro ou Enterprise
            </li>
            <li className="flex items-start gap-2.5 text-sm text-on-surface">
              <Icon name="check_circle" size={16} className="text-primary flex-shrink-0 mt-0.5" />
              Votre accès sera restauré immédiatement
            </li>
          </ul>
        </div>
        <button
          onClick={onLogout}
          className="w-full py-3 bg-surface border border-outline-variant/30 text-on-surface-variant font-semibold rounded-xl hover:bg-surface-container transition-colors flex items-center justify-center gap-2"
        >
          <Icon name="logout" size={18} /> Se déconnecter
        </button>
        <p className="text-xs text-on-surface-variant mt-4">
          © {new Date().getFullYear()} Minsouah — Gestion immobilière
        </p>
      </div>
    </div>
  );
}

function EmailVerificationBlockedScreen({ onLogout }) {
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setMsg('');
    try {
      const fbUser = auth.currentUser;
      if (!fbUser) { onLogout(); return; }
      await fbUser.reload();
      if (fbUser.emailVerified) {
        window.location.reload();
      } else {
        setMsg("Email pas encore vérifié. Cliquez sur le lien dans votre boîte mail.");
      }
    } catch {
      setMsg("Erreur de connexion. Réessayez.");
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    setSending(true);
    setMsg('');
    try {
      const fbUser = auth.currentUser;
      if (fbUser) await sendEmailVerification(fbUser);
      setMsg("Email de vérification renvoyé !");
    } catch {
      setMsg("Erreur lors de l'envoi — réessayez dans 1 minute.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-20 h-20 bg-amber-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
          <Icon name="mark_email_unread" size={36} className="text-amber-700" />
        </div>
        <h1 className="font-black text-2xl text-on-surface mb-2">Email non vérifié</h1>
        <p className="text-on-surface-variant text-sm mb-6">
          Votre adresse email doit être vérifiée avant d'accéder au tableau de bord.<br />
          Consultez votre boîte mail et cliquez sur le lien de confirmation.
        </p>
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5 mb-4 flex flex-col gap-3">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {checking
              ? <><Icon name="progress_activity" size={18} className="animate-spin" /> Vérification…</>
              : <><Icon name="check_circle" size={18} /> J'ai cliqué sur le lien</>}
          </button>
          <button
            onClick={handleResend}
            disabled={sending}
            className="w-full py-3 bg-surface border border-outline-variant/30 text-on-surface-variant font-semibold rounded-xl hover:bg-surface-container flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Icon name="refresh" size={18} /> {sending ? 'Envoi…' : 'Renvoyer l\'email'}
          </button>
          <button
            onClick={onLogout}
            className="w-full py-3 text-sm text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-2 transition-colors"
          >
            <Icon name="logout" size={16} /> Se déconnecter
          </button>
        </div>
        {msg && (
          <p className={`text-sm font-semibold ${msg.startsWith('Email de') ? 'text-green-700' : 'text-amber-700'}`}>{msg}</p>
        )}
        <p className="text-xs text-on-surface-variant mt-4">© {new Date().getFullYear()} Minsouah</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles, module }) {
  const { state, dispatch } = useApp();
  if (state._bootstrapping) return <BootstrapScreen />;
  const user = state.currentUser;
  if (!user) return <Navigate to="/login" replace />;

  // Block dashboard if email verification is required but not yet done.
  // Only applies to accounts explicitly marked emailVerificationRequired: true.
  if (user.role !== 'SUPER_ADMIN' && !!user.emailVerificationRequired) {
    const fbUser = auth.currentUser;
    if (fbUser && !fbUser.emailVerified) {
      return <EmailVerificationBlockedScreen onLogout={() => dispatch({ type: 'LOGOUT' })} />;
    }
  }

  // Le rôle limite l'accès SAUF si l'utilisateur a explicitement la permission du
  // module (case cochée dans Réglages → Utilisateurs) : dans ce cas la permission
  // prime. Sinon, cocher « Calendrier »/« Prestataires » pour un concierge ne
  // donnait aucun accès (le rôle n'était pas dans la liste autorisée de la page).
  if (allowedRoles && !allowedRoles.includes(user.role) && !(module && canView(user, module))) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  }
  // Fine-grained module gate — a restricted agent is redirected to the first
  // page they CAN open. TENANT/OWNER are exempt (portals/settings are their own
  // surfaces). If the only landing spot is /settings itself, let them through to
  // avoid a redirect loop.
  if (module && !canView(user, module) && user.role !== 'TENANT' && user.role !== 'OWNER') {
    const target = firstAllowedPath(user);
    if (target !== '/settings' || module !== 'settings') {
      return <Navigate to={target} replace />;
    }
  }
  // License + org guard — SUPER_ADMIN is always exempt
  if (user.role !== 'SUPER_ADMIN') {
    // Sur réseau lent, le délai de démarrage (12 s) peut expirer AVANT l'arrivée des
    // organisations/licences. Tant que ces listes sont vides, les données ne sont pas
    // encore chargées : on affiche le chargement, JAMAIS « Accès suspendu » (sinon un
    // faux « suspendu » clignote, ou bloque les utilisateurs sur connexion lente).
    const orgsLoaded = (state.organizations || []).length > 0;
    const licsLoaded = (state.licenses || []).length > 0;
    if (!orgsLoaded || !licsLoaded) {
      return <BootstrapScreen />;
    }
    const org      = (state.organizations || []).find(o => o.id === user.orgId);
    // Une organisation peut avoir PLUSIEURS licences (anciennes suspendues + une
    // active). On prend une licence VALIDE si elle existe — sinon .find() renvoyait
    // parfois une vieille licence « suspended » et affichait un faux « Accès suspendu ».
    const orgLicenses = (state.licenses || []).filter(l => l.orgId === user.orgId);
    const license = orgLicenses.find(isLicenseValid) || orgLicenses[0];
    // Block if: org deleted, no license at all, or license invalid/expired/suspended
    if (!org || !license || !isLicenseValid(license)) {
      return <SuspendedScreen license={license} onLogout={() => dispatch({ type: 'LOGOUT' })} />;
    }
  }
  return children;
}

function AppRoutes() {
  const { state } = useApp();
  const user = state.currentUser;

  // Précharge les pages en arrière-plan pour une navigation instantanée.
  usePrefetchPages();

  // Show global bootstrap screen before routing
  if (state._bootstrapping) return <BootstrapScreen />;

  return (
    <Suspense fallback={<BootstrapScreen />}>
    <Routes>
      {/* Public marketplace — accessible sans connexion */}
      <Route path="/marketplace" element={<Marketplace />} />

      <Route path="/register" element={user ? <Navigate to={ROLE_HOME[user.role] || '/'} replace /> : <OrgRegistration />} />
      <Route
        path="/login"
        element={user
          ? <Navigate to={user.firstLogin ? '/change-password' : (ROLE_HOME[user.role] || '/')} replace />
          : <Login />}
      />
      <Route
        path="/change-password"
        element={user ? <ChangePassword /> : <Navigate to="/login" replace />}
      />

      <Route path="/locataire/:token" element={<PublicTenantPortal />} />
      <Route path="/bordereau/:id" element={<PublicBordereau />} />
      <Route path="/quittance/:id" element={<PublicQuittance />} />

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER']} module="dashboard"><Dashboard /></ProtectedRoute>} />
        <Route path="assets"       element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']} module="assets"><Assets /></ProtectedRoute>} />
        <Route path="rental"       element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']} module="rental"><Rental /></ProtectedRoute>} />
        <Route path="finance"      element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'ACCOUNTANT']} module="finance"><Finance /></ProtectedRoute>} />
        <Route path="payments"     element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'ACCOUNTANT']} module="payments"><Payments /></ProtectedRoute>} />
        <Route path="bordereaux"   element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'ACCOUNTANT']} module="bordereaux"><Bordereaux /></ProtectedRoute>} />
        <Route path="revenus-minsouah" element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'ACCOUNTANT']} module="revenus"><RevenusMinsouah /></ProtectedRoute>} />
        <Route path="maintenance"  element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'CONCIERGE']} module="maintenance"><Maintenance /></ProtectedRoute>} />
        <Route path="inspections"  element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']} module="inspections"><Inspections /></ProtectedRoute>} />
        <Route path="inbox"        element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE', 'TECHNICIAN', 'ACCOUNTANT']} module="inbox"><Inbox /></ProtectedRoute>} />
        <Route path="concierge"    element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']}><ConciergePortal /></ProtectedRoute>} />
        <Route path="portal/tenant" element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'TENANT']}><TenantPortal /></ProtectedRoute>} />
        <Route path="portal/owner"  element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'OWNER']}><OwnerPortal /></ProtectedRoute>} />
        <Route path="settings"     element={<ProtectedRoute module="settings"><Settings /></ProtectedRoute>} />
        <Route path="calendar"    element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'ACCOUNTANT']} module="calendar"><Calendar /></ProtectedRoute>} />
        <Route path="insurance"   element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER']} module="insurance"><Insurance /></ProtectedRoute>} />
        <Route path="referrers"    element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER']} module="referrers"><Referrers /></ProtectedRoute>} />
        <Route path="prestataires" element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'TECHNICIAN']} module="prestataires"><Prestataires /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE', 'TECHNICIAN', 'ACCOUNTANT']} module="reports"><Reports /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      <Route path="/superadmin" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']}><SuperAdmin /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </Suspense>
  );
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'Arial, sans-serif', background: '#f5f5f5' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '32px', maxWidth: '600px', width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,.1)' }}>
            <h1 style={{ color: '#dc2626', marginBottom: '12px', fontSize: '20px' }}>Erreur de l'application</h1>
            <p style={{ color: '#374151', marginBottom: '16px', fontSize: '14px' }}>Une erreur inattendue s'est produite. Copiez le message ci-dessous et contactez le support.</p>
            <pre style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', fontSize: '12px', overflowX: 'auto', color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error?.message || String(this.state.error)}{'\n\n'}{this.state.error?.stack}
            </pre>
            <button onClick={() => window.location.reload()} style={{ marginTop: '16px', padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              Recharger la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <ToastProvider>
              <HashRouter>
                <AppRoutes />
              </HashRouter>
            </ToastProvider>
          </AppProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
