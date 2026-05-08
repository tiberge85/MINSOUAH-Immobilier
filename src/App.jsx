import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider, useApp } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import Icon from './components/Icon';

const Login          = lazy(() => import('./pages/Login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Dashboard   = lazy(() => import('./pages/Dashboard'));
const Assets      = lazy(() => import('./pages/Assets'));
const Rental      = lazy(() => import('./pages/Rental'));
const Finance     = lazy(() => import('./pages/Finance'));
const Payments    = lazy(() => import('./pages/Payments'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Inbox       = lazy(() => import('./pages/Inbox'));
const TenantPortal = lazy(() => import('./pages/TenantPortal'));
const OwnerPortal  = lazy(() => import('./pages/OwnerPortal'));
const Settings     = lazy(() => import('./pages/Settings'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <p className="text-on-surface-variant text-body-sm">Chargement...</p>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }) {
  const { state } = useApp();
  const user = state.currentUser;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'TENANT') return <Navigate to="/portal/tenant" replace />;
    if (user.role === 'OWNER') return <Navigate to="/portal/owner" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
}

function AppRoutes() {
  const { state } = useApp();
  const user = state.currentUser;

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to={
            user.firstLogin ? '/change-password' :
            user.role === 'TENANT' ? '/portal/tenant' :
            user.role === 'OWNER' ? '/portal/owner' : '/'
          } replace /> : <Login />}
        />
        <Route
          path="/change-password"
          element={user ? <ChangePassword /> : <Navigate to="/login" replace />}
        />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="assets" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}>
              <Assets />
            </ProtectedRoute>
          } />
          <Route path="rental" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}>
              <Rental />
            </ProtectedRoute>
          } />
          <Route path="finance" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'ACCOUNTANT']}>
              <Finance />
            </ProtectedRoute>
          } />
          <Route path="payments" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'ACCOUNTANT']}>
              <Payments />
            </ProtectedRoute>
          } />
          <Route path="maintenance" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'TECHNICIAN']}>
              <Maintenance />
            </ProtectedRoute>
          } />
          <Route path="inbox" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}>
              <Inbox />
            </ProtectedRoute>
          } />
          <Route path="portal/tenant" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'TENANT']}>
              <TenantPortal />
            </ProtectedRoute>
          } />
          <Route path="portal/owner" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'OWNER']}>
              <OwnerPortal />
            </ProtectedRoute>
          } />
          <Route path="settings" element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
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
