import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc,
  writeBatch, getDocs, query, where,
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { hashPwd, verifyPwd } from '../lib/auth';
import { checkLimit } from '../lib/planLimits';
import { createLicensePayload } from '../lib/licenses';

// Mock data — only used by RESET_DEMO action
import {
  properties as mockProperties,
  contracts as mockContracts,
  tenants as mockTenants,
  owners as mockOwners,
  transactions as mockTransactions,
  tickets as mockTickets,
  conversations as mockConversations,
  payments as mockPayments,
} from '../data/mockData';

// ── Workspace ──────────────────────────────────────────────────────────────────
const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const SESSION_KEY = 'minsouah_user_v2';

const wsCol = (name) => collection(db, 'workspaces', WS, name);
const wsDoc = (col, id) => doc(db, 'workspaces', WS, col, String(id));

// ── Default accounts ───────────────────────────────────────────────────────────
export const DEFAULT_ADMIN = {
  id: 1,
  email: 'admin@minsouah.ci',
  password: 'admin123',
  role: 'ORGANIZATION_ADMIN',
  orgId: 'default',
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

// Legacy role names → new names (for migration of existing Firestore data)
export const ROLE_MIGRATION = {
  ADMIN: 'ORGANIZATION_ADMIN',
  MANAGER: 'AGENT',
  CONCIERGE: 'AGENT',
  TECHNICIAN: 'AGENT',
  ACCOUNTANT: 'AGENT',
};

export const DEFAULT_SUPER_ADMIN = {
  id: 'superadmin',
  email: 'superadmin@minsouah.ci',
  password: 'Minsouah@SuperAdmin2025',
  role: 'SUPER_ADMIN',
  orgId: null,
  name: 'Super Administrateur',
  initials: 'SA',
  color: 'bg-amber-100 text-amber-800',
  personId: null,
  firstLogin: false,
  suspended: false,
  createdAt: new Date().toISOString(),
  lastLogin: null,
  failedAttempts: 0,
  lockedUntil: null,
};

export const DEFAULT_ORGANIZATION = {
  id: 'default',
  name: 'Minsouah Immobilier',
  createdAt: new Date().toISOString(),
  plan: 'standard',
  active: true,
};

// ── Default settings ───────────────────────────────────────────────────────────
const DEFAULT_ORG = {
  companyName: 'Minsouah Immobilier',
  address: "Abidjan, Côte d'Ivoire",
  phone: '', email: '', currency: 'XOF', language: 'fr',
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
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
    workspaceId: WS,
    enabled: true,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const norm = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// After a contract change, sync the linked property's status + currentTenant in Firestore
async function pushPropertyTenant(contract, properties) {
  if (!contract?.propertyId) return;
  const isActive = contract.status === 'Actif' || contract.status === 'Expirant';
  const prop = (properties || []).find(p =>
    String(p.id) === String(contract.propertyId) || Number(p.id) === Number(contract.propertyId)
  );
  if (!prop) return;
  await setDoc(wsDoc('properties', prop.id), {
    currentTenantId:   isActive ? (contract.tenantId   || null) : null,
    currentTenantName: isActive ? (contract.tenant     || null) : null,
  }, { merge: true });
}

// After a contract change, sync the linked property's status in Firestore
async function pushPropertyStatus(updatedContract, properties) {
  if (!updatedContract) return;
  const propId = updatedContract.propertyId;
  const propName = norm(updatedContract.propertyName || updatedContract.bien || '');

  const prop = (properties || []).find((p) => {
    if (p.isBuilding) return false;
    if (propId != null && (String(p.id) === String(propId) || Number(p.id) === Number(propId))) return true;
    if (propName && norm(p.name) === propName) return true;
    return false;
  });
  if (!prop) return;

  const isActive =
    updatedContract.status === 'Actif' || updatedContract.status === 'Expirant';
  await setDoc(wsDoc('properties', prop.id), { status: isActive ? 'Loué' : 'Disponible' }, { merge: true });
}

// ── Context ────────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, setState] = useState({
    properties: [], contracts: [], tenants: [], owners: [],
    payments: [], transactions: [], tickets: [], inspections: [],
    conversations: [], users: [], organizations: [], licenses: [], activityLog: [], revenueData: [],
    currentUser: null,
    orgSettings: DEFAULT_ORG,
    systemSettings: DEFAULT_SYSTEM,
    _bootstrapping: true,
    _networkError: false,
  });

  // Always-current reference to state for dispatch closure
  const stateRef = useRef(state);
  stateRef.current = state;

  // Prevents the seed effect from re-running after a PLATFORM_RESET wipes counts to 0
  const seededRef = useRef(false);

  // Track which essential collections have received their first snapshot
  const loadedRef = useRef(new Set());
  const ESSENTIAL = ['users', 'organizations', 'properties', 'contracts', 'tenants', 'payments', 'owners'];

  const checkBootstrap = useCallback(() => {
    if (ESSENTIAL.every((c) => loadedRef.current.has(c))) {
      setState((s) => (s._bootstrapping ? { ...s, _bootstrapping: false } : s));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 1. Restore logged-in user from localStorage (instant, no network) ───────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      if (saved) setState((s) => ({ ...s, currentUser: JSON.parse(saved) }));
    } catch { /* ignore */ }
  }, []);

  // ── 2. Bootstrap timeout — never hang forever ─────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setState((s) => (s._bootstrapping ? { ...s, _bootstrapping: false } : s));
    }, 12_000);
    return () => clearTimeout(timer);
  }, []);

  // ── 3. Auth → then Firestore subscriptions (no race condition) ────────────
  // onAuthStateChanged fires immediately if already signed in (e.g. page reload),
  // or after signInAnonymously completes. Firestore subscriptions are only opened
  // once we have a valid auth token — avoids PERMISSION_DENIED on first load.
  const unsubFirestoreRef = useRef([]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Auth is ready — open all Firestore listeners
        const unsubs = [];

        // Derive orgId from session for non-admin filtering
        let sessionOrgId = null;
        try {
          const saved = localStorage.getItem(SESSION_KEY);
          if (saved) {
            const u = JSON.parse(saved);
            // SUPER_ADMIN sees all orgs; everyone else is scoped to their orgId
            if (u?.role !== 'SUPER_ADMIN') sessionOrgId = u?.orgId || null;
          }
        } catch { /* ignore */ }

        const sub = (colName, orgFiltered = false) => {
          const q = (orgFiltered && sessionOrgId)
            ? query(wsCol(colName), where('orgId', '==', sessionOrgId))
            : wsCol(colName);
          unsubs.push(
            onSnapshot(
              q,
              (snap) => {
                const docs = snap.docs.map((d) => d.data());
                setState((s) => ({ ...s, [colName]: docs }));
                if (!loadedRef.current.has(colName)) {
                  loadedRef.current.add(colName);
                  checkBootstrap();
                }
              },
              (err) => {
                console.error(`[onSnapshot:${colName}]`, err.code, err.message);
                if (!loadedRef.current.has(colName)) {
                  loadedRef.current.add(colName);
                  checkBootstrap();
                }
              }
            )
          );
        };

        // organizations + licenses: always unfiltered (super admin sees all)
        sub('organizations');
        sub('licenses');
        sub('users');
        // entity collections: filtered by orgId for non-admin users
        ['properties', 'contracts', 'tenants', 'owners', 'payments', 'transactions',
          'tickets', 'inspections', 'conversations'].forEach(c => sub(c, true));

        // Activity log
        unsubs.push(
          onSnapshot(wsCol('activityLog'),
            (snap) => setState((s) => ({
              ...s,
              activityLog: snap.docs
                .map((d) => d.data())
                .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
                .slice(0, 500),
            })),
            () => {}
          )
        );

        // Settings docs
        unsubs.push(
          onSnapshot(wsDoc('settings', 'org'),
            (snap) => { if (snap.exists()) setState((s) => ({ ...s, orgSettings: { ...DEFAULT_ORG, ...snap.data() } })); },
            () => {}
          ),
          onSnapshot(wsDoc('settings', 'system'),
            (snap) => { if (snap.exists()) setState((s) => ({ ...s, systemSettings: { ...DEFAULT_SYSTEM, ...snap.data() } })); },
            () => {}
          )
        );

        // Store for cleanup
        unsubFirestoreRef.current.forEach((u) => u());
        unsubFirestoreRef.current = unsubs;
      } else {
        // Not signed in — try anonymous
        signInAnonymously(auth).catch((err) => {
          console.error('[Firebase anon auth]', err);
          setState((s) => ({ ...s, _networkError: true, _bootstrapping: false }));
        });
      }
    });

    return () => {
      unsubAuth();
      unsubFirestoreRef.current.forEach((u) => u());
    };
  }, [checkBootstrap]);

  // ── 5. Seed defaults on first run (runs once per page load, not after resets) ─
  useEffect(() => {
    if (state._bootstrapping) return;
    if (seededRef.current) return; // already seeded this session — skip to avoid re-seeding after PLATFORM_RESET
    seededRef.current = true;

    // Seed regular admin
    if (state.users.length === 0) {
      hashPwd(DEFAULT_ADMIN.password).then((hashed) => {
        setDoc(wsDoc('users', DEFAULT_ADMIN.id), { ...DEFAULT_ADMIN, password: hashed }).catch(console.error);
      });
    }
    // Seed super admin (always ensure it exists)
    if (!state.users.some(u => u.role === 'SUPER_ADMIN')) {
      hashPwd(DEFAULT_SUPER_ADMIN.password).then((hashed) => {
        setDoc(wsDoc('users', DEFAULT_SUPER_ADMIN.id), { ...DEFAULT_SUPER_ADMIN, password: hashed }).catch(console.error);
      });
    }
    // Migrate legacy role names (ADMIN→ORGANIZATION_ADMIN, MANAGER→AGENT, etc.)
    state.users.forEach(u => {
      const newRole = ROLE_MIGRATION[u.role];
      if (newRole) {
        setDoc(wsDoc('users', u.id), { role: newRole }, { merge: true }).catch(console.error);
      }
    });
    // Seed default organization
    if (state.organizations.length === 0) {
      setDoc(wsDoc('organizations', DEFAULT_ORGANIZATION.id), DEFAULT_ORGANIZATION).catch(console.error);
    }
    // Seed default license (pro trial for default org)
    if (state.organizations.length > 0 && state.licenses.length === 0) {
      const payload = createLicensePayload({ orgId: 'default', plan: 'pro', trialDays: 365 });
      setDoc(wsDoc('licenses', payload.key), { ...payload, id: payload.key, status: 'active' }).catch(console.error);
    }
  }, [state._bootstrapping]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 6. dispatch → Firestore writes ────────────────────────────────────────
  const dispatch = useCallback(async (action) => {
    const { type, payload } = action;
    const st = stateRef.current;
    const orgId = st.currentUser?.orgId || 'default';

    // Helper: get active plan for current org
    const getOrgPlan = (targetOrgId) => {
      const lic = (st.licenses || []).find(l =>
        l.orgId === targetOrgId && (l.status === 'trial' || l.status === 'active')
      );
      return lic?.plan || 'pro'; // default to pro for existing data
    };

    const logActivity = async (details, actionType = 'ACTION') => {
      const id = Date.now();
      setDoc(wsDoc('activityLog', id), {
        id, action: actionType, details,
        userId: st.currentUser?.id || null,
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    };

    try {
      switch (type) {

        // ── AUTH ───────────────────────────────────────────────────────────────
        case 'LOGIN': {
          const u = payload;
          const session = {
            id: u.id, role: u.role, name: u.name, initials: u.initials,
            email: u.email, color: u.color, avatar: u.avatar || null,
            personId: u.personId || null, firstLogin: u.firstLogin || false,
            orgId: u.orgId || 'default',
          };
          try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* quota */ }
          // Reload so Firestore subscriptions restart with the correct orgId filter
          window.location.reload();
          break;
        }
        case 'LOGOUT': {
          localStorage.removeItem(SESSION_KEY);
          // Reload to clear all org-filtered subscriptions
          window.location.reload();
          break;
        }

        // ── PROPERTIES ────────────────────────────────────────────────────────
        case 'ADD_PROPERTY': {
          const planId = getOrgPlan(orgId);
          const count = st.properties.filter(p => p.orgId === orgId).length;
          const limit = checkLimit(planId, 'Properties', count);
          if (!limit.ok) throw new Error(`Limite atteinte : plan ${limit.plan} autorise ${limit.max} biens maximum.`);
          const id = Date.now();
          await setDoc(wsDoc('properties', id), { ...payload, id, orgId, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_PROPERTY':
          await setDoc(wsDoc('properties', payload.id), payload);
          break;
        case 'DELETE_PROPERTY':
          await deleteDoc(wsDoc('properties', payload));
          break;

        // ── CONTRACTS ─────────────────────────────────────────────────────────
        case 'ADD_CONTRACT': {
          const id = Date.now();
          const contract = { ...payload, id, orgId, createdAt: new Date().toISOString() };
          await setDoc(wsDoc('contracts', id), contract);
          await pushPropertyStatus(contract, st.properties);
          await pushPropertyTenant(contract, st.properties);
          break;
        }
        case 'UPDATE_CONTRACT': {
          await setDoc(wsDoc('contracts', payload.id), payload);
          await pushPropertyStatus(payload, st.properties);
          await pushPropertyTenant(payload, st.properties);
          break;
        }
        case 'DELETE_CONTRACT': {
          const deleted = st.contracts.find((c) => c.id === payload);
          await deleteDoc(wsDoc('contracts', payload));
          if (deleted) {
            await pushPropertyStatus({ ...deleted, status: 'Résilié' }, st.properties);
            await pushPropertyTenant({ ...deleted, status: 'Résilié' }, st.properties);
          }
          break;
        }

        // ── TENANTS ───────────────────────────────────────────────────────────
        case 'ADD_TENANT': {
          const planId = getOrgPlan(orgId);
          const count = st.tenants.filter(t => t.orgId === orgId).length;
          const limit = checkLimit(planId, 'Tenants', count);
          if (!limit.ok) throw new Error(`Limite atteinte : plan ${limit.plan} autorise ${limit.max} locataires maximum.`);
          const id = Date.now();
          await setDoc(wsDoc('tenants', id), { ...payload, id, orgId, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_TENANT':
          await setDoc(wsDoc('tenants', payload.id), payload);
          break;
        case 'DELETE_TENANT':
          await deleteDoc(wsDoc('tenants', payload));
          break;

        // ── OWNERS ────────────────────────────────────────────────────────────
        case 'ADD_OWNER': {
          const id = Date.now();
          await setDoc(wsDoc('owners', id), { ...payload, id, orgId, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_OWNER':
          await setDoc(wsDoc('owners', payload.id), payload);
          break;
        case 'DELETE_OWNER':
          await deleteDoc(wsDoc('owners', payload));
          break;

        // ── TRANSACTIONS ──────────────────────────────────────────────────────
        case 'ADD_TRANSACTION': {
          const id = Date.now();
          await setDoc(wsDoc('transactions', id), { ...payload, id, orgId });
          break;
        }
        case 'DELETE_TRANSACTION':
          await deleteDoc(wsDoc('transactions', payload));
          break;

        // ── PAYMENTS ──────────────────────────────────────────────────────────
        case 'ADD_PAYMENT': {
          const id = Date.now();
          await setDoc(wsDoc('payments', id), { ...payload, id, orgId, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_PAYMENT':
          await setDoc(wsDoc('payments', payload.id), payload);
          break;
        case 'MARK_PAYMENT_PAID':
          await updateDoc(wsDoc('payments', payload), {
            status: 'Payé',
            paidDate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
          });
          break;
        case 'SEND_REMINDER': {
          const p = st.payments.find((p) => p.id === payload);
          if (p) {
            await updateDoc(wsDoc('payments', payload), {
              reminderSent: true,
              reminderCount: (p.reminderCount || 0) + 1,
              status: p.status === 'Impayé' ? 'En retard' : p.status,
            });
          }
          break;
        }

        // ── TICKETS ───────────────────────────────────────────────────────────
        case 'ADD_TICKET': {
          const id = payload.id || Date.now();
          await setDoc(wsDoc('tickets', id), { ...payload, id, orgId });
          break;
        }
        case 'UPDATE_TICKET':
          await setDoc(wsDoc('tickets', payload.id), payload);
          break;
        case 'DELETE_TICKET':
          await deleteDoc(wsDoc('tickets', payload));
          break;

        // ── INSPECTIONS ───────────────────────────────────────────────────────
        case 'ADD_INSPECTION': {
          const id = payload.id || Date.now();
          await setDoc(wsDoc('inspections', id), { ...payload, id, orgId });
          break;
        }
        case 'UPDATE_INSPECTION':
          await setDoc(wsDoc('inspections', payload.id), payload);
          break;
        case 'DELETE_INSPECTION':
          await deleteDoc(wsDoc('inspections', payload));
          break;

        // ── CONVERSATIONS ─────────────────────────────────────────────────────
        case 'SEND_MESSAGE': {
          const { convId, message } = payload;
          const conv = st.conversations.find((c) => c.id === convId);
          if (conv) {
            await setDoc(wsDoc('conversations', convId), {
              ...conv,
              lastMessage: message.text,
              time: message.time,
              unread: 0,
              messages: [...(conv.messages || []), message],
            });
          }
          break;
        }
        case 'MARK_READ':
          await updateDoc(wsDoc('conversations', payload), { unread: 0 });
          break;
        case 'ADD_CONVERSATION': {
          const id = payload.id || Date.now();
          await setDoc(wsDoc('conversations', id), { ...payload, id, orgId });
          break;
        }

        // ── LICENSES ──────────────────────────────────────────────────────────
        case 'ADD_LICENSE': {
          const licId = payload.key || payload.id || `LIC-${Date.now()}`;
          await setDoc(wsDoc('licenses', licId), { ...payload, id: licId });
          break;
        }
        case 'UPDATE_LICENSE':
          await setDoc(wsDoc('licenses', payload.id || payload.key), payload, { merge: true });
          break;
        case 'DELETE_LICENSE':
          await deleteDoc(wsDoc('licenses', payload));
          break;

        // ── ORGANIZATIONS ─────────────────────────────────────────────────────
        case 'ADD_ORGANIZATION': {
          const id = payload.id || `org_${Date.now()}`;
          await setDoc(wsDoc('organizations', id), { ...payload, id, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_ORGANIZATION':
          await setDoc(wsDoc('organizations', payload.id), payload, { merge: true });
          break;
        case 'DELETE_ORGANIZATION':
          if (payload === 'default') break; // Never delete the default org
          await deleteDoc(wsDoc('organizations', payload));
          break;

        // ── USERS ─────────────────────────────────────────────────────────────
        case 'ADD_USER': {
          if (st.users.some((u) => u.email === payload.email)) break;
          // Check user limit (skip for SUPER_ADMIN creating accounts)
          if (st.currentUser?.role !== 'SUPER_ADMIN') {
            const planId = getOrgPlan(orgId);
            const count = st.users.filter(u => u.orgId === orgId && u.role !== 'SUPER_ADMIN').length;
            const limit = checkLimit(planId, 'Users', count);
            if (!limit.ok) throw new Error(`Limite atteinte : plan ${limit.plan} autorise ${limit.max} utilisateurs maximum.`);
          }
          const id = Date.now();
          const targetOrgId = payload.orgId || orgId;
          const newUser = {
            ...payload, id,
            orgId: targetOrgId,
            failedAttempts: 0, lockedUntil: null,
            suspended: false, createdAt: new Date().toISOString(), lastLogin: null,
          };
          // Remove firebaseUid from the stored user document
          const { firebaseUid, ...userDocPayload } = newUser;
          await setDoc(wsDoc('users', id), userDocPayload);
          // Write usersByUid for Firestore Rules enforcement
          if (firebaseUid) {
            setDoc(wsDoc('usersByUid', firebaseUid), {
              userId: String(id), orgId: targetOrgId, role: payload.role,
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(console.warn);
          }
          await logActivity(`Compte créé : ${payload.name} (${payload.role})`, 'ADD_USER');
          break;
        }
        case 'UPDATE_USER': {
          await setDoc(wsDoc('users', payload.id), payload, { merge: true });
          if (st.currentUser?.id === payload.id) {
            const updated = { ...st.currentUser, ...payload };
            try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch { /* quota */ }
            setState((s) => ({ ...s, currentUser: updated }));
          }
          break;
        }
        case 'DELETE_USER': {
          if (payload === 1) break; // Never delete admin id=1
          const target = st.users.find((u) => u.id === payload);
          await deleteDoc(wsDoc('users', payload));
          await logActivity(`Compte supprimé : ${target?.name || payload}`, 'DELETE_USER');
          break;
        }
        case 'SUSPEND_USER': {
          const target = st.users.find((u) => u.id === payload);
          const willSuspend = !target?.suspended;
          await updateDoc(wsDoc('users', payload), { suspended: willSuspend });
          await logActivity(`${target?.name || payload} ${willSuspend ? 'suspendu' : 'réactivé'}`, 'SUSPEND_USER');
          break;
        }
        case 'CHANGE_PASSWORD': {
          const { email, newPassword } = payload;
          const targetUser = st.users.find((u) => u.email === email);
          if (targetUser) {
            await updateDoc(wsDoc('users', targetUser.id), {
              password: newPassword, firstLogin: false, failedAttempts: 0, lockedUntil: null,
            });
            if (st.currentUser?.email === email) {
              const updated = { ...st.currentUser, firstLogin: false };
              try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch { /* quota */ }
              setState((s) => ({ ...s, currentUser: updated }));
            }
          }
          break;
        }
        case 'UPGRADE_PASSWORD': {
          const { email, hashedPassword } = payload;
          const targetUser = st.users.find((u) => u.email === email);
          if (targetUser) {
            await updateDoc(wsDoc('users', targetUser.id), { password: hashedPassword }).catch(() => {});
          }
          break;
        }
        case 'LOGIN_ATTEMPT': {
          const { email, success } = payload;
          const now = new Date().toISOString();
          const u = st.users.find((u) => u.email === email);
          if (!u) break;
          if (success) {
            await updateDoc(wsDoc('users', u.id), { failedAttempts: 0, lockedUntil: null, lastLogin: now }).catch(() => {});
          } else {
            const attempts = (u.failedAttempts || 0) + 1;
            const lockedUntil = attempts >= 5
              ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
              : null;
            await updateDoc(wsDoc('users', u.id), {
              failedAttempts: attempts,
              ...(lockedUntil ? { lockedUntil } : {}),
            }).catch(() => {});
          }
          break;
        }

        // ── SETTINGS ──────────────────────────────────────────────────────────
        case 'UPDATE_SETTINGS': {
          const { type: sType, data } = payload;
          if (sType === 'profile') {
            const initials = data.name
              ? data.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
              : st.currentUser?.initials;
            const profileData = { ...data, initials };
            if (st.currentUser?.id) {
              await setDoc(wsDoc('users', st.currentUser.id), profileData, { merge: true });
            }
            const updated = { ...st.currentUser, ...profileData };
            try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch { /* quota */ }
            setState((s) => ({ ...s, currentUser: updated }));
          } else if (sType === 'notif') {
            const orgData = { ...st.orgSettings, notif: data };
            await setDoc(wsDoc('settings', 'org'), orgData);
            setState((s) => ({ ...s, orgSettings: orgData }));
          } else {
            const orgData = { ...st.orgSettings, ...(data || payload) };
            await setDoc(wsDoc('settings', 'org'), orgData);
            setState((s) => ({ ...s, orgSettings: orgData }));
          }
          break;
        }
        case 'UPDATE_SYSTEM_SETTINGS': {
          const sysData = { ...st.systemSettings, ...payload };
          await setDoc(wsDoc('settings', 'system'), sysData);
          setState((s) => ({ ...s, systemSettings: sysData }));
          break;
        }

        // ── ACTIVITY LOG ──────────────────────────────────────────────────────
        case 'LOG_ACTIVITY':
          await logActivity(payload.details || String(payload), payload.action || 'ACTION');
          break;

        // ── PLATFORM_RESET (SUPER_ADMIN full wipe — password verified in UI) ────
        case 'PLATFORM_RESET': {
          const { password } = payload || {};
          // Verify SUPER_ADMIN password server-side as a second check
          const superAdmin = st.users.find(u => u.role === 'SUPER_ADMIN');
          if (superAdmin && password) {
            const ok = await verifyPwd(password, superAdmin.password);
            if (!ok) throw new Error('Mot de passe SUPER_ADMIN incorrect');
          }

          // 1. Wipe entity collections entirely
          const ENTITY_COLS = [
            'properties', 'contracts', 'tenants', 'owners',
            'payments', 'transactions', 'tickets', 'inspections',
            'conversations', 'activityLog',
          ];
          for (const col of ENTITY_COLS) {
            const snap = await getDocs(wsCol(col));
            for (let i = 0; i < snap.docs.length; i += 400) {
              const batch = writeBatch(db);
              snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
              await batch.commit();
            }
          }

          // 2. Delete all licenses
          const licSnap = await getDocs(wsCol('licenses'));
          for (let i = 0; i < licSnap.docs.length; i += 400) {
            const batch = writeBatch(db);
            licSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }

          // 3. Delete ALL organizations (seed effect is blocked this session — fresh reload re-seeds)
          const orgSnap = await getDocs(wsCol('organizations'));
          for (let i = 0; i < orgSnap.docs.length; i += 400) {
            const batch = writeBatch(db);
            orgSnap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }

          // 4. Delete ALL users except the current SUPER_ADMIN
          const userSnap = await getDocs(wsCol('users'));
          const usersToDelete = userSnap.docs.filter(d => d.data().role !== 'SUPER_ADMIN');
          for (let i = 0; i < usersToDelete.length; i += 400) {
            const batch = writeBatch(db);
            usersToDelete.slice(i, i + 400).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }

          await logActivity(
            `RESET GLOBAL exécuté par ${st.currentUser?.email || 'SUPER_ADMIN'}`,
            'PLATFORM_RESET'
          );
          break;
        }

        // ── RESET (delete all entity data, keep users+settings) ───────────────
        case 'RESET': {
          const toDelete = ['properties', 'contracts', 'tenants', 'owners', 'payments',
            'transactions', 'tickets', 'inspections', 'conversations'];
          for (const col of toDelete) {
            const snap = await getDocs(wsCol(col));
            // Delete in batches of 400
            for (let i = 0; i < snap.docs.length; i += 400) {
              const batch = writeBatch(db);
              snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
          }
          break;
        }

        // ── RESET_DEMO (write demo data to Firestore) ─────────────────────────
        case 'RESET_DEMO': {
          const collections = [
            ['properties', mockProperties],
            ['contracts', mockContracts],
            ['tenants', mockTenants],
            ['owners', mockOwners],
            ['transactions', mockTransactions],
            ['tickets', mockTickets],
            ['conversations', mockConversations],
            ['payments', mockPayments],
          ];
          for (const [col, items] of collections) {
            // Clear existing
            const existing = await getDocs(wsCol(col));
            for (let i = 0; i < existing.docs.length; i += 400) {
              const batch = writeBatch(db);
              existing.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
              await batch.commit();
            }
            // Write demo items
            for (let i = 0; i < items.length; i += 400) {
              const batch = writeBatch(db);
              items.slice(i, i + 400).forEach((item) => {
                if (item?.id != null) batch.set(wsDoc(col, item.id), item);
              });
              await batch.commit();
            }
          }
          break;
        }

        // ── IMPORT_STATE (migrate old localStorage data into Firestore) ────────
        case 'IMPORT_STATE': {
          const data = payload;
          if (!data) break;
          const cols = ['properties', 'contracts', 'tenants', 'owners', 'payments',
            'transactions', 'tickets', 'inspections', 'conversations'];
          for (const col of cols) {
            const items = data[col];
            if (!items?.length) continue;
            for (let i = 0; i < items.length; i += 400) {
              const batch = writeBatch(db);
              items.slice(i, i + 400).forEach((item) => {
                if (item?.id != null) batch.set(wsDoc(col, item.id), item, { merge: true });
              });
              await batch.commit();
            }
          }
          if (data.users?.length) {
            for (let i = 0; i < data.users.length; i += 400) {
              const batch = writeBatch(db);
              data.users.slice(i, i + 400).forEach((u) => {
                if (u?.id != null) batch.set(wsDoc('users', u.id), u, { merge: true });
              });
              await batch.commit();
            }
          }
          break;
        }

        // ── LEGACY / NO-OP ────────────────────────────────────────────────────
        case 'BOOTSTRAP_DONE':
        case 'CLOUD_SYNC':
          // These actions are no longer needed — Firestore onSnapshot handles real-time sync
          break;

        default:
          console.warn('[AppContext] Unknown action type:', type);
      }
    } catch (err) {
      console.error('[AppContext dispatch]', type, err);
      throw err;
    }
  }, []); // stateRef is always current — no deps needed

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
