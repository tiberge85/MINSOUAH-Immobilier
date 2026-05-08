import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppProvider } from './context/AppContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
  },
});
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import Rental from './pages/Rental';
import Finance from './pages/Finance';
import Payments from './pages/Payments';
import Maintenance from './pages/Maintenance';
import Inbox from './pages/Inbox';
import TenantPortal from './pages/TenantPortal';
import OwnerPortal from './pages/OwnerPortal';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="assets" element={<Assets />} />
            <Route path="rental" element={<Rental />} />
            <Route path="finance" element={<Finance />} />
            <Route path="payments" element={<Payments />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="portal/tenant" element={<TenantPortal />} />
            <Route path="portal/owner" element={<OwnerPortal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
    </QueryClientProvider>
  );
}
