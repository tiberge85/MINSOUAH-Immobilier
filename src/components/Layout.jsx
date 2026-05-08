import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import Icon from './Icon';

const ROLE_LABELS = { ADMIN: 'Administrateur', MANAGER: 'Manager', TENANT: 'Locataire', OWNER: 'Propriétaire', ACCOUNTANT: 'Comptable', TECHNICIAN: 'Technicien' };

const navItems = [
  { path: '/',            label: 'Tableau de Bord',  icon: 'dashboard',              mobileIcon: 'home' },
  { path: '/assets',      label: 'Patrimoine',        icon: 'domain',                 mobileIcon: 'apartment' },
  { path: '/rental',      label: 'Gestion Locative',  icon: 'contract',               mobileIcon: 'contract' },
  { path: '/finance',     label: 'Finances',          icon: 'account_balance_wallet',  mobileIcon: 'assessment' },
  { path: '/payments',    label: 'Paiements',         icon: 'payments',               mobileIcon: 'payments' },
  { path: '/maintenance', label: 'Maintenance',       icon: 'engineering',             mobileIcon: 'engineering' },
  { path: '/inbox',       label: 'Messagerie',        icon: 'support_agent',           mobileIcon: 'mail' },
];

const pageTitles = {
  '/':                'Tableau de Bord',
  '/assets':          'Patrimoine Immobilier',
  '/rental':          'Gestion Locative',
  '/finance':         'Rapports Financiers',
  '/payments':        'Suivi des Paiements',
  '/maintenance':     'Maintenance',
  '/inbox':           'Messagerie',
  '/portal/tenant':   'Portail Locataires',
  '/portal/owner':    'Portail Propriétaires',
  '/settings':        'Paramètres',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { dark, toggle: toggleDark } = useTheme();
  const { currentUser } = state;
  const unpaidCount = state.payments.filter(p => p.status !== 'Payé').length;
  const title = pageTitles[location.pathname] || 'Minsouah';

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed left-0 top-0 h-full w-72 bg-surface-container border-r border-outline-variant/30
          shadow-lg z-50 flex flex-col py-md transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
        {/* Brand */}
        <div className="px-margin mb-md">
          <h1 className="font-h1 text-h1 text-primary font-black tracking-tight">Minsouah</h1>
          <p className="text-label-sm text-on-surface-variant uppercase tracking-widest mt-1">
            L'immobilier réinventé
          </p>
        </div>

        {/* User */}
        <div className="px-sm mb-md flex items-center gap-sm bg-surface-container-high mx-sm rounded-xl py-sm">
          {currentUser?.avatar
            ? <img src={currentUser.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            : <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm flex-shrink-0">{currentUser?.initials || '?'}</div>
          }
          <div className="min-w-0 flex-1">
            <p className="font-label-md text-label-md text-on-surface truncate">{currentUser?.name || 'Utilisateur'}</p>
            <p className="text-label-sm text-on-surface-variant">{ROLE_LABELS[currentUser?.role] || ''}</p>
          </div>
          <button onClick={handleLogout} className="text-on-surface-variant hover:text-error transition-colors p-1" title="Déconnexion">
            <Icon name="logout" size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1 px-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                isActive
                  ? 'flex items-center gap-md py-3 pl-margin bg-primary-container text-on-primary-container border-l-4 border-primary font-bold rounded-r-full mr-4 transition-all duration-200'
                  : 'flex items-center gap-md py-3 pl-margin text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface rounded-r-full mr-4 transition-all duration-200'
              }
            >
              {({ isActive }) => (
                <>
                  <Icon name={item.icon} filled={isActive} />
                  <span className="font-label-md text-label-md flex-1">{item.label}</span>
                  {item.path === '/payments' && unpaidCount > 0 && (
                    <span className="bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center mr-3">
                      {unpaidCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom — Portals + Settings */}
        <div className="px-1 pt-md border-t border-outline-variant/30 mt-auto flex flex-col gap-1">
          <p className="px-margin text-label-sm text-on-surface-variant uppercase tracking-widest mb-1">Portails</p>
          <button
            onClick={() => { navigate('/portal/tenant'); setSidebarOpen(false); }}
            className="flex items-center gap-md py-3 pl-margin text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface rounded-r-full mr-4 transition-all duration-200"
          >
            <Icon name="person" />
            <span className="font-label-md text-label-md">Portail Locataires</span>
          </button>
          <button
            onClick={() => { navigate('/portal/owner'); setSidebarOpen(false); }}
            className="flex items-center gap-md py-3 pl-margin text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface rounded-r-full mr-4 transition-all duration-200"
          >
            <Icon name="manage_accounts" />
            <span className="font-label-md text-label-md">Portail Propriétaires</span>
          </button>
          <div className="border-t border-outline-variant/30 mt-1 pt-1">
            <button
              onClick={() => { navigate('/settings'); setSidebarOpen(false); }}
              className="flex items-center gap-md py-3 pl-margin text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all w-full rounded-r-full mr-4"
            >
              <Icon name="settings" />
              <span className="font-label-md text-label-md">Paramètres</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────── */}
      <div className="md:ml-72 min-h-screen flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-surface shadow-topbar border-b border-outline-variant/10 h-20 flex items-center justify-between px-margin">
          <div className="flex items-center gap-md">
            <button
              className="md:hidden text-primary p-1 rounded-lg hover:bg-surface-container-high transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <h2 className="font-h2 text-h2 text-primary font-bold">{title}</h2>
          </div>

          <div className="flex items-center gap-sm">
            {/* Search (desktop) */}
            <div className="hidden lg:flex items-center bg-surface-container rounded-full px-4 py-2 border border-outline-variant/30 gap-2">
              <Icon name="search" className="text-outline" size={18} />
              <input
                type="text"
                placeholder="Rechercher..."
                className="bg-transparent border-none focus:ring-0 focus:outline-none text-body-sm w-48 text-on-surface placeholder:text-outline"
              />
            </div>

            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors text-on-surface-variant"
              title={dark ? 'Mode clair' : 'Mode sombre'}
            >
              <Icon name={dark ? 'light_mode' : 'dark_mode'} size={20} />
            </button>

            <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors text-on-surface-variant relative">
              <Icon name="notifications" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full" />
            </button>

            <button onClick={() => navigate('/settings')}
              className="w-10 h-10 rounded-full overflow-hidden bg-primary-container flex items-center justify-center text-on-primary-container font-bold text-sm cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              title="Paramètres">
              {currentUser?.avatar
                ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" />
                : (currentUser?.initials || '?')}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-20 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav ─────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 w-full z-40 bg-surface border-t border-outline-variant shadow-[0px_-4px_20px_rgba(62,56,54,0.05)] flex justify-around items-center h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 transition-transform active:scale-90 duration-150 ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.mobileIcon} filled={isActive} size={22} />
                <span className="text-[10px] font-medium leading-none">{item.label.split(' ')[0]}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
