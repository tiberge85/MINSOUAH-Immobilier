import { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import {
  properties as mockProperties,
  contracts as mockContracts,
  tenants as mockTenants,
  owners as mockOwners,
  transactions as mockTransactions,
  tickets as mockTickets,
  conversations as mockConversations,
  revenueData as mockRevenueData,
  alerts as mockAlerts,
  payments as mockPayments,
} from '../data/mockData';

// ─── Default admin account (always preserved) ─────────────────────────────────
export const DEFAULT_ADMIN = {
  id: 1,
  email: 'admin@minsouah.ci',
  password: 'admin123',
  role: 'ADMIN',
  name: 'Administrateur',
  initials: 'AD',
  color: 'bg-primary text-on-primary',
  personId: null,
  firstLogin: false,
  suspended: false,
  createdAt: new Date().toISOString(),
  lastLogin: null,
  failedAttempts: 0,
  lockedUntil: null,
};

const DEFAULT_ORG = {
  companyName: 'Minsouah Immobilier',
  address: "Abidjan, Côte d'Ivoire",
  phone: '',
  email: '',
  currency: 'XOF',
  language: 'fr',
  notif: {
    whatsapp: true, email: true,
    rentReminder: true, paymentConfirm: true,
    overdueAlert: true, maintenanceUpdate: false,
  },
};

export const DEFAULT_SYSTEM = {
  smtp: { host: '', port: 587, user: '', password: '', from: '', encryption: 'TLS', enabled: false },
  whatsapp: { apiKey: '', phoneNumber: '', businessName: '', enabled: false },
  mobileMoney: {
    cinetpay: { apiKey: '', siteId: '', enabled: false },
    orange: { merchantKey: '', enabled: false },
    mtn: { apiKey: '', enabled: false },
    wave: { apiKey: '', enabled: false },
    moov: { apiKey: '', enabled: false },
  },
  platform: { timezone: 'Africa/Abidjan', dateFormat: 'dd/MM/yyyy' },
  sessionTimeout: 30,
  firebase: {
    databaseURL: import.meta.env.VITE_FIREBASE_URL || 'https://minsouah-7d698-default-rtdb.europe-west1.firebasedatabase.app',
    workspaceId: import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah',
    enabled: true,
  },
};

// ─── EMPTY state — used by full reset (no demo data) ──────────────────────────
const EMPTY_STATE = {
  properties:     [],
  contracts:      [],
  tenants:        [],
  owners:         [],
  transactions:   [],
  tickets:        [],
  conversations:  [],
  revenueData:    mockRevenueData,
  alerts:         [],
  payments:       [],
  inspections:    [],
  currentUser:    null,
  users:          [DEFAULT_ADMIN],
  orgSettings:    DEFAULT_ORG,
  systemSettings: DEFAULT_SYSTEM,
  activityLog:    [],
};

// ─── DEMO state — used by demo reload ─────────────────────────────────────────
const DEMO_STATE = {
  ...EMPTY_STATE,
  properties:    mockProperties,
  contracts:     mockContracts,
  tenants:       mockTenants,
  owners:        mockOwners,
  transactions:  mockTransactions,
  tickets:       mockTickets,
  conversations: mockConversations,
  alerts:        mockAlerts,
  payments:      mockPayments,
};

// ─── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state, action) {
  const { type, payload } = action;

  switch (type) {
    // ── Properties ──────────────────────────────────────────────────────────
    case 'ADD_PROPERTY':
      return { ...state, properties: [{ ...payload, id: Date.now() }, ...(state.properties || [])] };
    case 'UPDATE_PROPERTY':
      return { ...state, properties: (state.properties || []).map(p => p.id === payload.id ? payload : p) };
    case 'DELETE_PROPERTY':
      return { ...state, properties: (state.properties || []).filter(p => p.id !== payload) };

    // ── Contracts ────────────────────────────────────────────────────────────
    case 'ADD_CONTRACT':
      return { ...state, contracts: [{ ...payload, id: Date.now() }, ...(state.contracts || [])] };
    case 'UPDATE_CONTRACT':
      return { ...state, contracts: (state.contracts || []).map(c => c.id === payload.id ? payload : c) };
    case 'DELETE_CONTRACT':
      return { ...state, contracts: (state.contracts || []).filter(c => c.id !== payload) };

    // ── Tenants ──────────────────────────────────────────────────────────────
    case 'ADD_TENANT':
      return { ...state, tenants: [{ ...payload, id: Date.now() }, ...(state.tenants || [])] };
    case 'UPDATE_TENANT':
      return { ...state, tenants: (state.tenants || []).map(t => t.id === payload.id ? payload : t) };
    case 'DELETE_TENANT':
      return { ...state, tenants: (state.tenants || []).filter(t => t.id !== payload) };

    // ── Owners ───────────────────────────────────────────────────────────────
    case 'ADD_OWNER':
      return { ...state, owners: [{ ...payload, id: Date.now() }, ...(state.owners || [])] };
    case 'UPDATE_OWNER':
      return { ...state, owners: (state.owners || []).map(o => o.id === payload.id ? payload : o) };
    case 'DELETE_OWNER':
      return { ...state, owners: (state.owners || []).filter(o => o.id !== payload) };

    // ── Transactions ─────────────────────────────────────────────────────────
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [{ ...payload, id: Date.now() }, ...(state.transactions || [])] };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: (state.transactions || []).filter(t => t.id !== payload) };

    // ── Payments ─────────────────────────────────────────────────────────────
    case 'ADD_PAYMENT':
      return { ...state, payments: [{ ...payload, id: Date.now() }, ...(state.payments || [])] };
    case 'UPDATE_PAYMENT':
      return { ...state, payments: (state.payments || []).map(p => p.id === payload.id ? payload : p) };
    case 'MARK_PAYMENT_PAID':
      return {
        ...state,
        payments: (state.payments || []).map(p =>
          p.id === payload
            ? { ...p, status: 'Payé', paidDate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
            : p
        ),
      };
    case 'SEND_REMINDER':
      return {
        ...state,
        payments: (state.payments || []).map(p =>
          p.id === payload
            ? { ...p, reminderSent: true, reminderCount: (p.reminderCount || 0) + 1, status: p.status === 'Impayé' ? 'En retard' : p.status }
            : p
        ),
      };

    // ── Tickets ──────────────────────────────────────────────────────────────
    case 'ADD_TICKET':
      return { ...state, tickets: [payload, ...(state.tickets || [])] };
    case 'UPDATE_TICKET':
      return { ...state, tickets: (state.tickets || []).map(t => t.id === payload.id ? payload : t) };
    case 'DELETE_TICKET':
      return { ...state, tickets: (state.tickets || []).filter(t => t.id !== payload) };

    // ── Inspections ──────────────────────────────────────────────────────────
    case 'ADD_INSPECTION':
      return { ...state, inspections: [payload, ...(state.inspections || [])] };
    case 'UPDATE_INSPECTION':
      return { ...state, inspections: (state.inspections || []).map(i => i.id === payload.id ? payload : i) };
    case 'DELETE_INSPECTION':
      return { ...state, inspections: (state.inspections || []).filter(i => i.id !== payload) };

    // ── Conversations ─────────────────────────────────────────────────────────
    case 'SEND_MESSAGE': {
      const { convId, message } = payload;
      return {
        ...state,
        conversations: (state.conversations || []).map(c => {
          if (c.id !== convId) return c;
          return { ...c, lastMessage: message.text, time: message.time, unread: 0, messages: [...(c.messages || []), message] };
        }),
      };
    }
    case 'MARK_READ':
      return { ...state, conversations: (state.conversations || []).map(c => c.id === payload ? { ...c, unread: 0 } : c) };
    case 'ADD_CONVERSATION':
      return { ...state, conversations: [payload, ...(state.conversations || [])] };

    // ── User accounts ─────────────────────────────────────────────────────────
    case 'ADD_USER': {
      const users = state.users || [DEFAULT_ADMIN];
      if (users.some(u => u.email === payload.email)) return state;
      const newUser = { ...payload, id: Date.now(), failedAttempts: 0, lockedUntil: null, suspended: false, createdAt: new Date().toISOString(), lastLogin: null };
      const logEntry = { id: Date.now() + 1, action: 'ADD_USER', details: `Compte créé : ${payload.name} (${payload.role})`, timestamp: new Date().toISOString() };
      return { ...state, users: [...users, newUser], activityLog: [logEntry, ...(state.activityLog || [])].slice(0, 500) };
    }
    case 'UPDATE_USER':
      return { ...state, users: (state.users || [DEFAULT_ADMIN]).map(u => u.id === payload.id ? { ...u, ...payload } : u) };
    case 'DELETE_USER': {
      const target = (state.users || []).find(u => u.id === payload);
      const logEntry = { id: Date.now(), action: 'DELETE_USER', details: `Compte supprimé : ${target?.name || payload}`, timestamp: new Date().toISOString() };
      return { ...state, users: (state.users || [DEFAULT_ADMIN]).filter(u => u.id !== payload && u.id !== 1), activityLog: [logEntry, ...(state.activityLog || [])].slice(0, 500) };
    }
    case 'SUSPEND_USER': {
      const target = (state.users || []).find(u => u.id === payload);
      const willSuspend = !target?.suspended;
      const logEntry = { id: Date.now(), action: 'SUSPEND_USER', details: `${target?.name || payload} ${willSuspend ? 'suspendu' : 'réactivé'}`, timestamp: new Date().toISOString() };
      return { ...state, users: (state.users || [DEFAULT_ADMIN]).map(u => u.id === payload ? { ...u, suspended: !u.suspended } : u), activityLog: [logEntry, ...(state.activityLog || [])].slice(0, 500) };
    }
    case 'CHANGE_PASSWORD':
      return {
        ...state,
        users: (state.users || [DEFAULT_ADMIN]).map(u =>
          u.email === payload.email
            ? { ...u, password: payload.newPassword, firstLogin: false, failedAttempts: 0, lockedUntil: null }
            : u
        ),
        currentUser: state.currentUser?.email === payload.email
          ? { ...state.currentUser, firstLogin: false }
          : state.currentUser,
      };
    case 'LOGIN_ATTEMPT': {
      const { email, success } = payload;
      const now = new Date().toISOString();
      if (success) {
        const u = (state.users || [DEFAULT_ADMIN]).find(u => u.email === email);
        const logEntry = { id: Date.now(), userId: u?.id, userEmail: email, userName: u?.name, action: 'LOGIN', details: 'Connexion réussie', timestamp: now };
        return {
          ...state,
          users: (state.users || [DEFAULT_ADMIN]).map(u =>
            u.email === email ? { ...u, failedAttempts: 0, lockedUntil: null, lastLogin: now } : u
          ),
          activityLog: [logEntry, ...(state.activityLog || [])].slice(0, 500),
        };
      }
      const logEntry = { id: Date.now(), userEmail: email, action: 'LOGIN_FAIL', details: 'Tentative de connexion échouée', timestamp: now };
      return {
        ...state,
        users: (state.users || [DEFAULT_ADMIN]).map(u => {
          if (u.email !== email) return u;
          const attempts = (u.failedAttempts || 0) + 1;
          const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
          return { ...u, failedAttempts: attempts, lockedUntil };
        }),
        activityLog: [logEntry, ...(state.activityLog || [])].slice(0, 500),
      };
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    case 'UPGRADE_PASSWORD': {
      const { email, hashedPassword } = payload;
      return {
        ...state,
        users: (state.users || [DEFAULT_ADMIN]).map(u =>
          u.email === email ? { ...u, password: hashedPassword } : u
        ),
      };
    }
    case 'LOGIN':
      return { ...state, currentUser: payload };
    case 'LOGOUT':
      return { ...state, currentUser: null };
    case 'UPDATE_SETTINGS': {
      const { type: sType, data } = payload;
      if (sType === 'profile') {
        const initials = data.name
          ? data.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
          : state.currentUser?.initials;
        const updatedUser = { ...state.currentUser, ...data, initials };
        // Also persist to the users[] array so avatar/name survive logout+login
        const updatedUsers = (state.users || [DEFAULT_ADMIN]).map(u =>
          u.email === state.currentUser?.email ? { ...u, ...data, initials, name: data.name || u.name } : u
        );
        return { ...state, currentUser: updatedUser, users: updatedUsers };
      }
      if (sType === 'notif') {
        return { ...state, orgSettings: { ...state.orgSettings, notif: data } };
      }
      return { ...state, orgSettings: { ...state.orgSettings, ...data } };
    }

    // ── System settings ──────────────────────────────────────────────────────
    case 'UPDATE_SYSTEM_SETTINGS':
      return { ...state, systemSettings: { ...(state.systemSettings || DEFAULT_SYSTEM), ...payload } };

    // ── Activity log ─────────────────────────────────────────────────────────
    case 'LOG_ACTIVITY': {
      const entry = { id: Date.now(), ...payload, timestamp: new Date().toISOString() };
      const log = [entry, ...(state.activityLog || [])].slice(0, 500);
      return { ...state, activityLog: log };
    }

    // ── Reset ────────────────────────────────────────────────────────────────
    case 'RESET':
      return {
        ...EMPTY_STATE,
        users:          (state.users || [DEFAULT_ADMIN]).filter(u => u.id === 1),
        systemSettings: state.systemSettings || DEFAULT_SYSTEM,
        activityLog:    state.activityLog || [],
      };
    case 'RESET_DEMO':
      return {
        ...DEMO_STATE,
        users:          state.users || [DEFAULT_ADMIN],
        systemSettings: state.systemSettings || DEFAULT_SYSTEM,
        activityLog:    state.activityLog || [],
      };

    // ── Import full state (multi-browser sync) ───────────────────────────────
    case 'IMPORT_STATE': {
      const imported = payload;
      if (!imported || !imported.users) return state;
      return {
        ...imported,
        currentUser: null,
        activityLog: [
          { id: Date.now(), action: 'IMPORT', details: 'État importé depuis un autre appareil', timestamp: new Date().toISOString() },
          ...(imported.activityLog || []),
        ],
      };
    }
    // ── Cloud sync (Firebase REST) ────────────────────────────────────────────
    case 'CLOUD_SYNC': {
      const incoming = payload;
      if (!incoming || !incoming.users?.length) return state;
      // Preserve locally hashed passwords — don't let Firebase plain-text override them
      const mergedUsers = (incoming.users || []).map(incomingUser => {
        const localUser = (state.users || []).find(u => u.email === incomingUser.email);
        const merged = { ...incomingUser };
        // Preserve locally hashed password if Firebase still has plain-text
        if (localUser?.password?.startsWith('sha256:') && !incomingUser.password?.startsWith('sha256:')) {
          merged.password = localUser.password;
        }
        // Preserve local avatar — base64 images may be stripped in Firebase if too large
        if (localUser?.avatar && !incomingUser.avatar) {
          merged.avatar = localUser.avatar;
        }
        return merged;
      });
      // Always guarantee DEFAULT_ADMIN exists so login never breaks
      const hasAdmin = mergedUsers.some(u => u.id === 1);
      if (!hasAdmin) mergedUsers.unshift({ ...DEFAULT_ADMIN });
      return {
        ...incoming,
        // Guard every array field — if Firebase data is partial, fall back to local then empty
        properties:    incoming.properties    || state.properties    || [],
        contracts:     incoming.contracts     || state.contracts     || [],
        tenants:       incoming.tenants       || state.tenants       || [],
        owners:        incoming.owners        || state.owners        || [],
        payments:      incoming.payments      || state.payments      || [],
        tickets:       incoming.tickets       || state.tickets       || [],
        transactions:  incoming.transactions  || state.transactions  || [],
        conversations: incoming.conversations || state.conversations || [],
        inspections:   incoming.inspections   || state.inspections   || [],
        alerts:        incoming.alerts        || state.alerts        || [],
        revenueData:   incoming.revenueData   || state.revenueData   || [],
        users: mergedUsers,
        currentUser: state.currentUser,
        systemSettings: state.systemSettings,
      };
    }

    default:
      return state;
  }
}

// ─── Firebase REST helpers ─────────────────────────────────────────────────────
async function fbSave(databaseURL, workspaceId, data) {
  const savedAt = Date.now();
  const url = `${databaseURL.replace(/\/$/, '')}/minsouah/${workspaceId}.json`;
  await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, _savedAt: savedAt }),
  });
  return savedAt;
}
async function fbFetch(databaseURL, workspaceId) {
  const url = `${databaseURL.replace(/\/$/, '')}/minsouah/${workspaceId}.json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// ─── Context ───────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(
    reducer,
    EMPTY_STATE,
    () => {
      try {
        const saved = localStorage.getItem('minsouah_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (!parsed.users?.length) parsed.users = [DEFAULT_ADMIN];
          if (!parsed.activityLog) parsed.activityLog = [];
          if (!parsed.systemSettings) {
            parsed.systemSettings = DEFAULT_SYSTEM;
          } else {
            // Merge new DEFAULT_SYSTEM keys into old saves
            parsed.systemSettings = { ...DEFAULT_SYSTEM, ...parsed.systemSettings };
            // Toujours forcer la config Firebase à jour (URL réelle + enabled:true)
            parsed.systemSettings.firebase = {
              ...DEFAULT_SYSTEM.firebase,
              // Garde l'URL customisée si elle est valide, sinon utilise le fallback
              databaseURL: (parsed.systemSettings.firebase?.databaseURL || '').startsWith('https://')
                ? parsed.systemSettings.firebase.databaseURL
                : DEFAULT_SYSTEM.firebase.databaseURL,
              enabled: true,
            };
          }
          return parsed;
        }
        return { ...EMPTY_STATE };
      } catch {
        return { ...EMPTY_STATE };
      }
    }
  );

  const fbSyncRef = useRef({ isSyncing: false, saveTimer: null, pollInterval: null, configKey: '', lastSavedAt: 0 });

  // ── Persist to localStorage + push to Firebase ──────────────────────────────
  useEffect(() => {
    const refs = fbSyncRef.current;
    if (refs.isSyncing) { refs.isSyncing = false; return; }

    try {
      localStorage.setItem('minsouah_v1', JSON.stringify(state));
    } catch {
      // Quota exceeded — strip avatars and retry
      try {
        const slim = {
          ...state,
          currentUser: state.currentUser ? { ...state.currentUser, avatar: null } : null,
          users: (state.users || []).map(u => ({ ...u, avatar: null })),
          tenants: (state.tenants || []).map(t => ({ ...t, avatar: null })),
        };
        localStorage.setItem('minsouah_v1', JSON.stringify(slim));
      } catch { /* still too large — skip */ }
    }

    const fb = state.systemSettings?.firebase;
    if (fb?.enabled && fb?.databaseURL && fb?.workspaceId) {
      clearTimeout(refs.saveTimer);
      refs.saveTimer = setTimeout(() => {
        const { currentUser, ...toSync } = state;
        fbSave(fb.databaseURL, fb.workspaceId, toSync)
          .then((savedAt) => { refs.lastSavedAt = savedAt; })
          .catch(() => {});
      }, 3000);
    }
  }, [state]);

  // ── Poll Firebase for remote changes ────────────────────────────────────────
  useEffect(() => {
    const refs = fbSyncRef.current;
    const fb = state.systemSettings?.firebase;
    const newKey = `${fb?.enabled}-${fb?.databaseURL}-${fb?.workspaceId}`;
    if (refs.configKey === newKey) return;
    refs.configKey = newKey;

    clearInterval(refs.pollInterval);
    if (!fb?.enabled || !fb?.databaseURL || !fb?.workspaceId) return;

    const poll = async () => {
      try {
        const data = await fbFetch(fb.databaseURL, fb.workspaceId);
        if (!data || !data.users?.length) return;
        // Use refs.lastSavedAt instead of stale state._savedAt (closure capture)
        if ((data._savedAt || 0) > refs.lastSavedAt) {
          refs.lastSavedAt = data._savedAt || Date.now();
          refs.isSyncing = true;
          dispatch({ type: 'CLOUD_SYNC', payload: data });
        }
      } catch { /* network error — ignore */ }
    };

    poll();
    refs.pollInterval = setInterval(poll, 5000);
    return () => clearInterval(refs.pollInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [`${state.systemSettings?.firebase?.enabled}-${state.systemSettings?.firebase?.databaseURL}-${state.systemSettings?.firebase?.workspaceId}`]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
