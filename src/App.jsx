import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import Rental from './pages/Rental';
import Finance from './pages/Finance';
import Maintenance from './pages/Maintenance';
import Inbox from './pages/Inbox';

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="assets" element={<Assets />} />
            <Route path="rental" element={<Rental />} />
            <Route path="finance" element={<Finance />} />
            <Route path="maintenance" element={<Maintenance />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}
