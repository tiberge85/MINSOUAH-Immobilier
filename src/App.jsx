import { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { isLicenseValid } from './lib/licenses';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from './lib/firebase';
import Layout from './components/Layout';
import Icon from './components/Icon';

// Direct imports — no lazy loading = no blank page flash during navigation
import Login          from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import Dashboard      from './pages/Dashboard';
import Assets         from './pages/Assets';
import Rental         from './pages/Rental';
import Finance        from './pages/Finance';
import Payments       from './pages/Payments';
import Maintenance    from './pages/Maintenance';
import Inbox          from './pages/Inbox';
import TenantPortal   from './pages/TenantPortal';
import OwnerPortal    from './pages/OwnerPortal';
import Settings       from './pages/Settings';
import Inspections    from './pages/Inspections';
import ConciergePortal from './pages/ConciergePortal';
import SuperAdmin     from './pages/SuperAdmin';
import OrgRegistration from './pages/OrgRegistration';

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
  CONCIERGE: '/',
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

function ProtectedRoute({ children, allowedRoles }) {
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

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  }
  // License + org guard — SUPER_ADMIN is always exempt
  if (user.role !== 'SUPER_ADMIN') {
    const org     = (state.organizations || []).find(o => o.id === user.orgId);
    const license = (state.licenses     || []).find(l => l.orgId === user.orgId);
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

  // Show global bootstrap screen before routing
  if (state._bootstrapping) return <BootstrapScreen />;

  return (
    <Routes>
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

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER']}><Dashboard /></ProtectedRoute>} />
        <Route path="assets"       element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']}><Assets /></ProtectedRoute>} />
        <Route path="rental"       element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']}><Rental /></ProtectedRoute>} />
        <Route path="finance"      element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'ACCOUNTANT']}><Finance /></ProtectedRoute>} />
        <Route path="payments"     element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'ACCOUNTANT']}><Payments /></ProtectedRoute>} />
        <Route path="maintenance"  element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'TECHNICIAN', 'CONCIERGE']}><Maintenance /></ProtectedRoute>} />
        <Route path="inspections"  element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']}><Inspections /></ProtectedRoute>} />
        <Route path="inbox"        element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE', 'TECHNICIAN', 'ACCOUNTANT']}><Inbox /></ProtectedRoute>} />
        <Route path="concierge"    element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE']}><ConciergePortal /></ProtectedRoute>} />
        <Route path="portal/tenant" element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'TENANT']}><TenantPortal /></ProtectedRoute>} />
        <Route path="portal/owner"  element={<ProtectedRoute allowedRoles={['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'OWNER']}><OwnerPortal /></ProtectedRoute>} />
        <Route path="settings"     element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      <Route path="/superadmin" element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']}><SuperAdmin /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
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
  );
}
