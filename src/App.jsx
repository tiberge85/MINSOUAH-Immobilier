import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';

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
import Inspections      from './pages/Inspections';
import ConciergePortal  from './pages/ConciergePortal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
});

const ROLE_HOME = {
  TENANT:     '/portal/tenant',
  OWNER:      '/portal/owner',
  CONCIERGE:  '/concierge',
  TECHNICIAN: '/maintenance',
  ACCOUNTANT: '/finance',
};

function ProtectedRoute({ children, allowedRoles }) {
  const { state } = useApp();
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

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={
          user.firstLogin ? '/change-password' :
          ROLE_HOME[user.role] || '/'
        } replace /> : <Login />}
      />
      <Route
        path="/change-password"
        element={user ? <ChangePassword /> : <Navigate to="/login" replace />}
      />

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Dashboard /></ProtectedRoute>} />
        <Route path="assets"      element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Assets /></ProtectedRoute>} />
        <Route path="rental"      element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Rental /></ProtectedRoute>} />
        <Route path="finance"     element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'ACCOUNTANT']}><Finance /></ProtectedRoute>} />
        <Route path="payments"    element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'ACCOUNTANT']}><Payments /></ProtectedRoute>} />
        <Route path="maintenance"  element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'TECHNICIAN', 'CONCIERGE']}><Maintenance /></ProtectedRoute>} />
        <Route path="inspections" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'CONCIERGE']}><Inspections /></ProtectedRoute>} />
        <Route path="inbox"       element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'CONCIERGE', 'TECHNICIAN', 'ACCOUNTANT']}><Inbox /></ProtectedRoute>} />
        <Route path="concierge"   element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'CONCIERGE']}><ConciergePortal /></ProtectedRoute>} />
        <Route path="portal/tenant" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'TENANT']}><TenantPortal /></ProtectedRoute>} />
        <Route path="portal/owner"  element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'OWNER']}><OwnerPortal /></ProtectedRoute>} />
        <Route path="settings"    element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

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
