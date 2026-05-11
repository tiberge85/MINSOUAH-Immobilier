import { useState, useRef, useEffect, useMemo } from 'react';
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
  { path: '/maintenance',  label: 'Maintenance',       icon: 'engineering',             mobileIcon: 'engineering' },
  { path: '/inspections', label: 'États des lieux',   icon: 'home_work',               mobileIcon: 'home_work' },
  { path: '/inbox',       label: 'Messagerie',        icon: 'support_agent',           mobileIcon: 'mail' },
];

const pageTitles = {
  '/':                'Tableau de Bord',
  '/assets':          'Patrimoine Immobilier',
  '/rental':          'Gestion Locative',
  '/finance':         'Rapports Financiers',
  '/payments':        'Suivi des Paiements',
  '/maintenance':     'Maintenance',
  '/inspections':     'États des lieux',
  '/inbox':           'Messagerie',
  '/portal/tenant':   'Portail Locataires',
  '/portal/owner':    'Portail Propriétaires',
  '/settings':        'Paramètres',
};

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const notifRef = useRef(null);
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { dark, toggle: toggleDark } = useTheme();
  const { currentUser } = state;
  const unpaidCount = (state.payments || []).filter(p => p.status !== 'Payé').length;
  const title = pageTitles[location.pathname] || 'Minsouah';

  // Parse contract endDate — handles both "12/12/2025" and "12 Déc 2025" formats
  const parseContractDate = (str) => {
    if (!str || str === '—') return null;
    if (str.includes('/')) {
      const [d, m, y] = str.split('/');
      const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return isNaN(dt.getTime()) ? null : dt;
    }
    const FR_MONTHS = { jan: 0, fév: 1, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5, jul: 6, jui: 6, aoû: 7, aou: 7, sep: 8, oct: 9, nov: 10, déc: 11, dec: 11 };
    const m = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/i);
    if (m) {
      const key = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3);
      const monthIdx = FR_MONTHS[key];
      if (monthIdx !== undefined) return new Date(parseInt(m[3]), monthIdx, parseInt(m[1]));
    }
    return null;
  };

  // Auto-generated notifications
  const notifications = useMemo(() => {
    const now = Date.now();
    return [
      ...(state.payments || [])
        .filter(p => p.status === 'Impayé' || p.status === 'En retard')
        .slice(0, 4)
        .map(p => ({ id: `pay-${p.id}`, icon: 'payments', color: 'text-error', bg: 'bg-error/10', label: `Loyer impayé`, sub: `${p.tenantName || ''} — ${p.month || ''}`, path: '/payments' })),
      ...(state.contracts || [])
        .filter(c => {
          if (c.status !== 'Actif' || !c.endDate || c.endDate === '—') return false;
          try { const dt = parseContractDate(c.endDate); return dt && ((dt.getTime() - now) / 86400000) <= 30; } catch { return false; }
        })
        .slice(0, 3)
        .map(c => ({ id: `cont-${c.id}`, icon: 'contract', color: 'text-amber-600', bg: 'bg-amber-100', label: 'Contrat expirant', sub: `${c.tenant} — ${c.endDate}`, path: '/rental' })),
      ...(state.tickets || [])
        .filter(t => t.priority === 'Urgent' && t.status !== 'Fermé' && t.status !== 'Résolu')
        .slice(0, 3)
        .map(t => ({ id: `tick-${t.id}`, icon: 'engineering', color: 'text-error', bg: 'bg-error/10', label: 'Ticket urgent', sub: t.title, path: '/maintenance' })),
      ...(state.conversations || [])
        .filter(c => (c.unread || 0) > 0)
        .slice(0, 3)
        .map(c => ({ id: `msg-${c.id}`, icon: 'mail', color: 'text-primary', bg: 'bg-primary/10', label: 'Nouveau message', sub: c.contact?.name || 'Messagerie', path: '/inbox' })),
    ];
  }, [state.payments, state.contracts, state.tickets, state.conversations]);

  // Idle session timeout
  const IDLE_MS = ((state.systemSettings?.sessionTimeout) || 30) * 60 * 1000;
  const WARN_MS = 2 * 60 * 1000;
  useEffect(() => {
    if (!currentUser) return;
    const reset = () => {
      setShowIdleWarning(false);
      clearTimeout(idleTimerRef.current);
      clearTimeout(warningTimerRef.current);
      if (IDLE_MS > WARN_MS) {
        warningTimerRef.current = setTimeout(() => setShowIdleWarning(true), IDLE_MS - WARN_MS);
      }
      idleTimerRef.current = setTimeout(() => {
        dispatch({ type: 'LOGOUT' });
        navigate('/login');
      }, IDLE_MS);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(idleTimerRef.current);
      clearTimeout(warningTimerRef.current);
      events.forEach(e => window.removeEventListener(e, reset));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, IDLE_MS]);

  // Close notif panel when clicking outside
  useEffect(() => {
    if (!showNotif) return;
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showNotif]);

  const handleLogout = () => {
    dispatch({ type: 'LOGOUT' });
    navigate('/login');
  };

  const idleModal = showIdleWarning ? (
    <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl p-6 max-w-sm w-full text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="timer" size={32} className="text-amber-600" />
        </div>
        <h3 className="font-bold text-lg text-on-surface mb-2">Session inactive</h3>
        <p className="text-sm text-on-surface-variant mb-5">
          Vous allez être déconnecté dans 2 minutes par mesure de sécurité.
        </p>
        <button onClick={() => setShowIdleWarning(false)}
          className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90">
          Je suis là — Continuer
        </button>
      </div>
    </div>
  ) : null;

  /* ── Minimal layout for TENANT / OWNER accounts ────────────── */
  const isPortalOnly = currentUser?.role === 'TENANT' || currentUser?.role === 'OWNER';
  if (isPortalOnly) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 bg-surface shadow-topbar border-b border-outline-variant/10 h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <h1 className="font-black text-xl text-primary tracking-tight">Minsouah</h1>
            <span className="text-label-sm text-on-surface-variant hidden sm:block">
              {currentUser.role === 'TENANT' ? 'Espace Locataire' : 'Espace Propriétaire'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant transition-colors"
              title={dark ? 'Mode clair' : 'Mode sombre'}
            >
              <Icon name={dark ? 'light_mode' : 'dark_mode'} size={18} />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-surface-container-high transition-colors"
            >
              {currentUser?.avatar
                ? <img src={currentUser.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                : <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${currentUser?.color || 'bg-primary-container text-on-primary-container'}`}>{currentUser?.initials || '?'}</div>
              }
              <span className="text-sm font-medium text-on-surface hidden sm:block">{currentUser?.name}</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"
              title="Déconnexion"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>
        <main className="pb-8">
          <Outlet />
        </main>
        {idleModal}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {idleModal}
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
                  {item.path === '/inbox' && (state.conversations || []).some(c => (c.unread || 0) > 0) && (
                    <span className="bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center mr-3">
                      {(state.conversations || []).reduce((s, c) => s + (c.unread || 0), 0)}
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

            <div className="relative" ref={notifRef}>
              <button onClick={() => setShowNotif(v => !v)}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-container-high transition-colors text-on-surface-variant relative">
                <Icon name="notifications" />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-error text-on-error text-[9px] font-bold rounded-full flex items-center justify-center">
                    {notifications.length > 9 ? '9+' : notifications.length}
                  </span>
                )}
              </button>
              {showNotif && (
                <div className="absolute right-0 top-12 w-80 bg-surface rounded-2xl shadow-xl border border-outline-variant/20 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                    <p className="font-bold text-on-surface text-sm">Notifications</p>
                    {notifications.length > 0 && (
                      <span className="text-xs bg-error text-on-error px-2 py-0.5 rounded-full font-bold">{notifications.length}</span>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="text-center py-8 text-on-surface-variant">
                        <Icon name="check_circle" size={32} className="opacity-30 mb-2 text-green-600" />
                        <p className="text-xs">Aucune notification</p>
                      </div>
                    ) : notifications.map(n => (
                      <button key={n.id} onClick={() => { navigate(n.path); setShowNotif(false); }}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-surface-container transition-colors border-b border-outline-variant/10 last:border-0 text-left">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${n.bg}`}>
                          <Icon name={n.icon} size={16} className={n.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-on-surface">{n.label}</p>
                          <p className="text-xs text-on-surface-variant truncate">{n.sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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

      {/* ── Floating notification badge ────────────────────────────────── */}
      {notifications.length > 0 && (
        <button
          onClick={() => setShowNotif(v => !v)}
          className="fixed bottom-20 right-4 md:bottom-8 md:right-8 z-50 w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform"
          title="Voir les notifications"
        >
          <Icon name="notifications" size={26} />
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] bg-error text-on-error text-[11px] font-black rounded-full flex items-center justify-center px-1 shadow animate-bounce">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        </button>
      )}

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
