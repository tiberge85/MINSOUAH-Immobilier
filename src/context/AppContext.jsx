import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc,
  writeBatch, getDocs, query, where, getDocFromServer, increment,
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
  email: 'superadmin_minsouah@ramyaci.tech',
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

// After a tenant is linked to a property, update property/unit status in Firestore.
// Handles both simple properties (direct name match) and building units (label format
// "BuildingName — UnitNumber (Floor)").
async function pushTenantPropertyStatus(propertyLabel, properties, isActive) {
  if (!propertyLabel) return;
  const label = (propertyLabel || '').trim();

  // Simple property (not a building): match by name
  const simpleProp = (properties || []).find(p =>
    !p.isBuilding && norm(p.name) === norm(label)
  );
  if (simpleProp) {
    await setDoc(wsDoc('properties', simpleProp.id), { status: isActive ? 'Loué' : 'Disponible' }, { merge: true });
    return;
  }

  // Building unit — label: "BuildingName — UnitNumber (Floor)" or "BuildingName — UnitNumber"
  const sep = label.indexOf(' — ');
  if (sep === -1) return;
  const bldName = label.slice(0, sep).trim();
  const unitPart = label.slice(sep + 3).trim();
  const floorM = unitPart.match(/^(.+?)\s*\(([^)]+)\)$/);
  const unitNum = floorM ? floorM[1].trim() : unitPart;
  const unitFloor = floorM ? floorM[2].trim() : null;

  const bld = (properties || []).find(p => p.isBuilding && norm(p.name) === norm(bldName));
  if (!bld || !Array.isArray(bld.units)) return;

  const updatedUnits = bld.units.map(u => {
    const numOk = norm(u.number) === norm(unitNum);
    const floorOk = !unitFloor || norm(u.floor || '') === norm(unitFloor);
    return numOk && floorOk ? { ...u, status: isActive ? 'Loué' : 'Disponible' } : u;
  });
  await setDoc(wsDoc('properties', bld.id), { units: updatedUnits }, { merge: true });
}

// ── Context ────────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, setState] = useState({
    properties: [], contracts: [], tenants: [], owners: [],
    payments: [], transactions: [], tickets: [], inspections: [],
    conversations: [], users: [], organizations: [], licenses: [], activityLog: [], revenueData: [],
    listings: [], listingClients: [], listingUnlocks: [],
    monthClosures: [],
    insurances: [],
    budgets: [],
    tenantPortals: [],
    referrers: [],
    currentUser: null,
    orgSettings: DEFAULT_ORG,
    systemSettings: DEFAULT_SYSTEM,
    publicMarketplace: {},
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
            // Refresh usersByUid so Firestore rules recognize this session/UID
            setDoc(wsDoc('usersByUid', user.uid), {
              userId: String(u.id), orgId: u.orgId || 'default', role: u.role,
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
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
          'tickets', 'inspections', 'conversations', 'monthClosures',
          'insurances', 'budgets', 'referrers'].forEach(c => sub(c, true));

        sub('tenantPortals'); // publicly readable portal tokens

        // Listings + client profiles (marketplace — no org filter)
        sub('listings');
        sub('listingClients');
        sub('listingUnlocks');

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

        // Settings docs — org settings are per-org (settings/{orgId})
        const orgSettingsDocRef = sessionOrgId
          ? wsDoc('settings', sessionOrgId)
          : wsDoc('settings', 'org'); // SUPER_ADMIN fallback
        unsubs.push(
          onSnapshot(orgSettingsDocRef,
            (snap) => { if (snap.exists()) setState((s) => ({ ...s, orgSettings: { ...DEFAULT_ORG, ...snap.data() } })); },
            () => {}
          ),
          onSnapshot(wsDoc('settings', 'system'),
            (snap) => { if (snap.exists()) setState((s) => ({ ...s, systemSettings: { ...DEFAULT_SYSTEM, ...snap.data() } })); },
            () => {}
          ),
          onSnapshot(wsDoc('publicSettings', 'marketplace'),
            (snap) => { if (snap.exists()) setState((s) => ({ ...s, publicMarketplace: snap.data() })); },
            () => {}
          )
        );

        // Store for cleanup
        unsubFirestoreRef.current.forEach((u) => u());
        unsubFirestoreRef.current = unsubs;
      } else {
        // Close stale subscriptions (e.g., from a brief re-auth during verification polling)
        unsubFirestoreRef.current.forEach((u) => u());
        unsubFirestoreRef.current = [];

        // While org registration is pending email verification, skip anonymous sign-in.
        // An anonymous token fails the sign_in_provider != 'anonymous' read guard and
        // causes "Missing or insufficient permissions" on organizations/licenses snapshots.
        if (sessionStorage.getItem('_minsouah_regpending')) {
          console.log('[AppContext] registration pending — skipping signInAnonymously');
          setState((s) => ({ ...s, _bootstrapping: false }));
          return;
        }

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

  // ── 5. Seed — only ensure SUPER_ADMIN account exists ─────────────────────
  // Organizations and licenses are NEVER auto-created — the Super Admin creates
  // them manually via the /superadmin panel. This prevents phantom "Minsouah Immobilier"
  // orgs from appearing after every cold start.
  useEffect(() => {
    if (state._bootstrapping) return;
    if (seededRef.current) return;
    seededRef.current = true;

    const existingSA = state.users.find(u => u.role === 'SUPER_ADMIN');
    if (!existingSA) {
      // No SUPER_ADMIN yet — create it
      hashPwd(DEFAULT_SUPER_ADMIN.password).then((hashed) => {
        setDoc(wsDoc('users', DEFAULT_SUPER_ADMIN.id), { ...DEFAULT_SUPER_ADMIN, password: hashed }).catch(console.error);
      });
    } else if (existingSA.email !== DEFAULT_SUPER_ADMIN.email) {
      // Email changed in code — update Firestore to match
      setDoc(wsDoc('users', existingSA.id), { email: DEFAULT_SUPER_ADMIN.email }, { merge: true }).catch(console.error);
    }

    // Migrate legacy role names (ADMIN→ORGANIZATION_ADMIN, MANAGER→AGENT, etc.)
    state.users.forEach(u => {
      const newRole = ROLE_MIGRATION[u.role];
      if (newRole) {
        setDoc(wsDoc('users', u.id), { role: newRole }, { merge: true }).catch(console.error);
      }
    });
  }, [state._bootstrapping]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 6. Auto-logout if current user was deleted from Firestore ───────────
  // Catches platform reset, manual user deletion, or org deletion.
  // Runs whenever the users list updates (real-time via onSnapshot).
  useEffect(() => {
    if (state._bootstrapping) return;
    const cu = state.currentUser;
    if (!cu) return;
    if (cu.role === 'SUPER_ADMIN') return; // SUPER_ADMIN is never auto-logged out
    // If the logged-in user no longer exists in Firestore → force logout immediately
    const stillExists = (state.users || []).some(u => String(u.id) === String(cu.id));
    if (!stillExists) {
      localStorage.removeItem(SESSION_KEY);
      window.location.reload();
    }
  }, [state._bootstrapping, state.users]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 7. Auto-suspend expired licenses ─────────────────────────────────────
  // Runs whenever the licenses list changes. If a trial or active license has
  // passed expiresAt, set its status to 'suspended' and deactivate the org.
  useEffect(() => {
    if (state._bootstrapping) return;
    const now = new Date();
    state.licenses.forEach(lic => {
      if (
        (lic.status === 'trial' || lic.status === 'active') &&
        lic.expiresAt &&
        new Date(lic.expiresAt) < now
      ) {
        const licId = lic.id || lic.key;
        setDoc(wsDoc('licenses', licId), { ...lic, status: 'suspended' }).catch(console.error);
        // Also deactivate the org so the suspension screen appears
        const org = (state.organizations || []).find(o => o.id === lic.orgId);
        if (org) {
          setDoc(wsDoc('organizations', org.id), { ...org, active: false }).catch(console.error);
        }
      }
    });
  }, [state._bootstrapping, state.licenses]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 8. Auto-register missed payments as arrears ───────────────────────────
  // For each active contract, check every month from the contract start up to
  // last month (exclusive of current month — rent is due before the 10th).
  // If no payment record exists for that month, create one as 'Impayé'.
  useEffect(() => {
    if (state._bootstrapping) return;
    if (!state.currentUser) return;
    const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const now = new Date();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();

    const activeContracts = (state.contracts || []).filter(c =>
      c.status === 'Actif' || c.status === 'Expirant'
    );
    const existingPayments = state.payments || [];

    activeContracts.forEach(contract => {
      if (!contract.startDate && !contract.since) return;
      const startRaw = contract.startDate || contract.since;
      let startDate;
      if (startRaw.includes('/')) {
        const [d, m, y] = startRaw.split('/');
        startDate = new Date(Number(y), Number(m) - 1, 1);
      } else {
        startDate = new Date(startRaw);
        startDate.setDate(1);
      }
      if (isNaN(startDate.getTime())) return;

      // Check tenant advance period
      const tenant = (state.tenants || []).find(t =>
        String(t.id) === String(contract.tenantId) ||
        (t.name || '').toLowerCase().trim() === (contract.tenant || '').toLowerCase().trim()
      );
      const paymentStartDate = tenant?.paymentStartDate ? new Date(tenant.paymentStartDate) : null;

      let y = startDate.getFullYear();
      let m = startDate.getMonth();

      while (y < currentYear || (y === currentYear && m < currentMonthIdx)) {
        const monthLabel = `${MONTH_NAMES[m]} ${y}`;

        // Skip months before advance period ends
        if (paymentStartDate && new Date(y, m, 1) < paymentStartDate) {
          m++; if (m > 11) { m = 0; y++; } continue;
        }

        const alreadyExists = existingPayments.some(p =>
          p.month === monthLabel &&
          (p.tenantName || '').toLowerCase().trim() === (contract.tenant || '').toLowerCase().trim() &&
          (p.propertyName || '').toLowerCase().trim() === (contract.propertyName || '').toLowerCase().trim()
        );

        if (!alreadyExists) {
          const id = `auto_${contract.id}_${y}_${m}`;
          const payload = {
            id,
            propertyName: contract.propertyName || '',
            tenantName: contract.tenant || '',
            tenantId: contract.tenantId || null,
            contractId: contract.id || null,
            ownerId: contract.ownerId || null,
            amount: contract.rent || 0,
            month: monthLabel,
            dueDate: `10/${String(m + 1).padStart(2, '0')}/${y}`,
            status: 'Impayé',
            reminderCount: 0,
            orgId: contract.orgId || state.currentUser?.orgId || 'default',
            autoGenerated: true,
          };
          setDoc(wsDoc('payments', id), payload, { merge: true }).catch(() => {});
        }

        m++; if (m > 11) { m = 0; y++; }
      }
    });
  }, [state._bootstrapping, state.contracts, state.tenants]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── dispatch → Firestore writes ───────────────────────────────────────────
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
            orgId:   u.orgId   || 'default',
            orgIds:  u.orgIds  || [u.orgId || 'default'],
          };
          try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* quota */ }
          // Write usersByUid BEFORE reloading so Firestore rules pass on first write
          const fbUid = auth.currentUser?.uid;
          if (fbUid) {
            try {
              await setDoc(wsDoc('usersByUid', fbUid), {
                userId: String(u.id), orgId: u.orgId || 'default', role: u.role,
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            } catch { /* proceed anyway */ }
          }
          // Reload so Firestore subscriptions restart with the correct orgId filter
          window.location.reload();
          break;
        }
        case 'SWITCH_ORG': {
          try {
            const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
            localStorage.setItem(SESSION_KEY, JSON.stringify({ ...saved, orgId: payload }));
          } catch { /* ignore */ }
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
          const newTenant = { ...payload, id, orgId, createdAt: new Date().toISOString() };
          await setDoc(wsDoc('tenants', id), newTenant);
          if (newTenant.property) await pushTenantPropertyStatus(newTenant.property, st.properties, true);
          break;
        }
        case 'UPDATE_TENANT': {
          const oldTenant = st.tenants.find(t => t.id === payload.id);
          await setDoc(wsDoc('tenants', payload.id), payload);
          // If property changed, revert old unit (unless a contract still covers it)
          if (oldTenant?.property && oldTenant.property !== payload.property) {
            const hasActiveContract = st.contracts.some(c =>
              (c.status === 'Actif' || c.status === 'Expirant') &&
              norm(c.propertyName || '') === norm(oldTenant.property)
            );
            if (!hasActiveContract) await pushTenantPropertyStatus(oldTenant.property, st.properties, false);
          }
          if (payload.property) await pushTenantPropertyStatus(payload.property, st.properties, true);
          break;
        }
        case 'DELETE_TENANT': {
          const delTenant = st.tenants.find(t => t.id === payload);
          await deleteDoc(wsDoc('tenants', payload));
          if (delTenant?.property) {
            const hasActiveContract = st.contracts.some(c =>
              (c.status === 'Actif' || c.status === 'Expirant') &&
              norm(c.propertyName || '') === norm(delTenant.property)
            );
            if (!hasActiveContract) await pushTenantPropertyStatus(delTenant.property, st.properties, false);
          }
          break;
        }

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
          const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
          await setDoc(wsDoc('payments', id), { ...payload, id, orgId, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_PAYMENT':
          await setDoc(wsDoc('payments', payload.id), payload);
          break;
        case 'DELETE_PAYMENT':
          await deleteDoc(wsDoc('payments', payload));
          break;
        case 'MARK_PAYMENT_PAID': {
          const pmtToMark = st.payments.find(p => p.id === payload);
          const isClosed = pmtToMark && (st.monthClosures || []).some(
            c => c.month === pmtToMark.month && c.orgId === orgId
          );
          await updateDoc(wsDoc('payments', payload), {
            status: 'Payé',
            paidDate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
            ...(isClosed ? { postCloture: true } : {}),
          });
          break;
        }
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

        // ── MONTH CLOSURE ─────────────────────────────────────────────────────
        case 'CLOSE_MONTH': {
          // payload: { month, closedAt, note }
          const { month, closedAt, note } = payload;
          const monthPayments = st.payments.filter(p => p.month === month);
          const totalExpected = monthPayments.reduce((s, p) => s + (p.amount || 0), 0);
          const totalCollected = monthPayments.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
          const totalUnpaid = monthPayments.filter(p => p.status !== 'Payé' && p.status !== 'Annulé').reduce((s, p) => s + (p.amount || 0), 0);
          const paidIds = monthPayments.filter(p => p.status === 'Payé').map(p => p.id);
          const id = `closure_${month.replace(' ', '_')}_${orgId}`;
          const closureDoc = {
            id, month, orgId,
            closedAt: closedAt || new Date().toISOString(),
            closedBy: st.currentUser?.name || '',
            note: note || '',
            snapshot: { totalExpected, totalCollected, totalUnpaid, paidCount: paidIds.length, paidIds },
          };
          await setDoc(wsDoc('monthClosures', id), closureDoc);
          // Mark all unpaid payments for this month as post-clôture
          const unpaidPmts = monthPayments.filter(p => p.status !== 'Payé' && p.status !== 'Annulé');
          for (const p of unpaidPmts) {
            await updateDoc(wsDoc('payments', p.id), { postCloture: true }).catch(() => {});
          }
          break;
        }
        case 'REOPEN_MONTH': {
          await deleteDoc(wsDoc('monthClosures', `closure_${payload.replace(' ', '_')}_${orgId}`)).catch(() => {});
          // Remove postCloture flag from payments of this month
          const pmts = st.payments.filter(p => p.month === payload && p.postCloture);
          for (const p of pmts) {
            await updateDoc(wsDoc('payments', p.id), { postCloture: false }).catch(() => {});
          }
          break;
        }

        // ── INSURANCES ────────────────────────────────────────────────────────────
        case 'ADD_INSURANCE': {
          const id = `ins_${Date.now()}`;
          await setDoc(wsDoc('insurances', id), { ...payload, id, orgId, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_INSURANCE':
          await setDoc(wsDoc('insurances', payload.id), { ...payload, orgId });
          break;
        case 'DELETE_INSURANCE':
          await deleteDoc(wsDoc('insurances', payload));
          break;

        // ── BUDGETS (monthly collection targets) ─────────────────────────────────
        case 'SET_BUDGET': {
          const id = `budget_${payload.month.replace(' ', '_')}_${orgId}`;
          await setDoc(wsDoc('budgets', id), { ...payload, id, orgId });
          break;
        }

        // ── TENANT PORTALS (public QR portal) ─────────────────────────────────────
        case 'GENERATE_TENANT_PORTAL': {
          const { tenantId, tenantName, propertyName, payments: pmts } = payload;
          const token = `${orgId}_${tenantId}_${Math.random().toString(36).slice(2, 10)}`;
          const id = token;
          const portalDoc = {
            id, token, tenantId, tenantName, propertyName, orgId,
            payments: pmts,
            generatedAt: new Date().toISOString(),
          };
          await setDoc(wsDoc('tenantPortals', id), portalDoc);
          // Also store the token on the tenant document
          await updateDoc(wsDoc('tenants', tenantId), { portalToken: token }).catch(() => {});
          // Return token via a state hack: dispatch a local action
          // Store in session storage for immediate access
          try { sessionStorage.setItem('lastPortalToken', token); } catch {}
          break;
        }

        // ── REFERRERS (apporteurs d'affaire) ─────────────────────────────────
        case 'ADD_REFERRER': {
          const id = `ref_${Date.now()}`;
          await setDoc(wsDoc('referrers', id), { ...payload, id, orgId, createdAt: new Date().toISOString(), referrals: [] });
          break;
        }
        case 'UPDATE_REFERRER':
          await setDoc(wsDoc('referrers', payload.id), { ...payload, orgId });
          break;
        case 'DELETE_REFERRER':
          await deleteDoc(wsDoc('referrers', payload));
          break;
        case 'ADD_REFERRAL': {
          const { referrerId, referral } = payload;
          const ref = (stateRef.current.referrers || []).find(r => r.id === referrerId);
          if (!ref) break;
          const referrals = [...(ref.referrals || []), { ...referral, id: `ral_${Date.now()}`, addedAt: new Date().toISOString() }];
          await setDoc(wsDoc('referrers', referrerId), { ...ref, referrals }, { merge: true });
          break;
        }
        case 'TOGGLE_REFERRAL_PAID': {
          const { referrerId, referralId } = payload;
          const ref = (stateRef.current.referrers || []).find(r => r.id === referrerId);
          if (!ref) break;
          const referrals = (ref.referrals || []).map(r =>
            r.id === referralId ? { ...r, paid: !r.paid, paidDate: !r.paid ? new Date().toLocaleDateString('fr-FR') : '' } : r
          );
          await setDoc(wsDoc('referrers', referrerId), { ...ref, referrals }, { merge: true });
          break;
        }

        // ── LISTINGS (marketplace) ────────────────────────────────────────────
        case 'ADD_LISTING': {
          const id = payload.id || `lst_${Date.now()}`;
          await setDoc(wsDoc('listings', id), { ...payload, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), views: 0, reactions: 0 });
          break;
        }
        case 'UPDATE_LISTING':
          await setDoc(wsDoc('listings', payload.id), { ...payload, updatedAt: new Date().toISOString() });
          break;
        case 'DELETE_LISTING':
          await deleteDoc(wsDoc('listings', payload));
          break;
        case 'INCREMENT_LISTING_VIEW':
          await updateDoc(wsDoc('listings', payload), { views: increment(1) });
          break;
        case 'INCREMENT_LISTING_REACTION':
          await updateDoc(wsDoc('listings', payload), { reactions: increment(1) });
          break;

        // ── LISTING CLIENTS ───────────────────────────────────────────────────
        case 'ADD_LISTING_CLIENT': {
          const id = `client_${Date.now()}`;
          await setDoc(wsDoc('listingClients', id), { ...payload, id, createdAt: new Date().toISOString(), status: 'nouveau' });
          break;
        }
        case 'UPDATE_LISTING_CLIENT':
          await setDoc(wsDoc('listingClients', payload.id), { ...payload, updatedAt: new Date().toISOString() });
          break;
        case 'DELETE_LISTING_CLIENT':
          await deleteDoc(wsDoc('listingClients', payload));
          break;

        // ── LISTING UNLOCKS (paiements/accès contact) ─────────────────────────
        case 'ADD_LISTING_UNLOCK': {
          const id = payload.id || `unlock_${Date.now()}`;
          await setDoc(wsDoc('listingUnlocks', id), { ...payload, id, createdAt: new Date().toISOString() });
          break;
        }
        case 'UPDATE_LISTING_UNLOCK':
          await setDoc(wsDoc('listingUnlocks', payload.id), { ...payload, updatedAt: new Date().toISOString() });
          break;

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
          const fbUid = auth.currentUser?.uid;
          const isAnon = auth.currentUser?.isAnonymous ?? true;
          console.log('[ADD_ORG] auth.currentUser uid:', fbUid, '| isAnonymous:', isAnon, '| appRole:', st.currentUser?.role);

          // Anonymous token fails isSuperAdmin rule — session expired, must log in again
          if (!fbUid || isAnon) {
            throw new Error("Session Firebase expirée. Déconnectez-vous et reconnectez-vous.");
          }

          // Safety net: refresh usersByUid before writing so isSuperAdmin(wsId) passes.
          // This covers cases where the login-time write was missed (e.g. auth/email-already-in-use fallback).
          const ubRef = wsDoc('usersByUid', fbUid);
          console.log('[ADD_ORG] writing usersByUid →', ubRef.path, '| role:', st.currentUser?.role);
          await setDoc(ubRef, {
            userId: String(st.currentUser?.id),
            orgId:  st.currentUser?.orgId || 'default',
            role:   st.currentUser?.role || '',
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          await getDocFromServer(ubRef);
          console.log('[ADD_ORG] usersByUid confirmed — writing organization');

          const id = payload.id || `org_${Date.now()}`;
          await setDoc(wsDoc('organizations', id), { ...payload, id, createdAt: new Date().toISOString() });
          console.log('[ADD_ORG] organization written OK:', id);
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
            const orgRef = st.currentUser?.orgId
              ? wsDoc('settings', st.currentUser.orgId)
              : wsDoc('settings', 'org');
            await setDoc(orgRef, orgData);
            setState((s) => ({ ...s, orgSettings: orgData }));
          } else {
            const orgData = { ...st.orgSettings, ...(data || payload) };
            const orgRef = st.currentUser?.orgId
              ? wsDoc('settings', st.currentUser.orgId)
              : wsDoc('settings', 'org');
            await setDoc(orgRef, orgData);
            setState((s) => ({ ...s, orgSettings: orgData }));
          }
          break;
        }
        case 'UPDATE_SYSTEM_SETTINGS': {
          const sysData = { ...st.systemSettings, ...payload };
          await setDoc(wsDoc('settings', 'system'), sysData);
          // Mirror public fields (paymentPhone) so anonymous marketplace visitors can read them
          if ('paymentPhone' in payload || 'imgbbApiKey' in payload) {
            await setDoc(wsDoc('publicSettings', 'marketplace'), {
              paymentPhone: sysData.paymentPhone || '',
              updatedAt: new Date().toISOString(),
            });
          }
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

          // 5. Write skip-seed flag so page reloads don't re-create default org/license/admin
          await setDoc(wsDoc('settings', 'system'), { _skipSeed: true, _resetAt: new Date().toISOString() }, { merge: true });

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
