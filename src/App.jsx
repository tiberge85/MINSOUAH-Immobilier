import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
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

function ProtectedRoute({ children, allowedRoles }) {
  const { state } = useApp();
  if (state._bootstrapping) return <BootstrapScreen />;
  const user = state.currentUser;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
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
