import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MarketplaceAdmin from './MarketplaceAdmin';
import MarketplaceClients from './MarketplaceClients';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  collection, query, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import { getApp, initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendEmailVerification, deleteUser } from 'firebase/auth';
import { db } from '../lib/firebase';
import { validateEmailFull } from '../lib/disposableEmails';
import { useApp } from '../context/AppContext';
import { getPlan, PLANS, fmtLimit } from '../lib/planLimits';
import { getLicenseStatusInfo, getDaysRemaining, createLicensePayload } from '../lib/licenses';
import { verifyPwd, hashPwd } from '../lib/auth';
import { sendEmail } from '../lib/email';
import { logSec, SEC, SEV } from '../lib/securityLog';
import { createBackup, listBackups, restoreBackup, deleteBackupMeta } from '../lib/backup';
import Icon from '../components/Icon';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const PLAN_COLORS = { standard: '#3b82f6', pro: '#8b5cf6', enterprise: '#f59e0b' };

async function sendVerificationEmail(user) {
  const continueUrl = `${window.location.origin}/`;
  try {
    await sendEmailVerification(user, { url: continueUrl, handleCodeInApp: false });
    console.log('[email] verification sent to', user.email, '| continueUrl:', continueUrl);
  } catch (err) {
    if (err.code === 'auth/unauthorized-continue-uri') {
      console.warn('[email] domain not in Firebase authorized list — sending without continueUrl. Fix: Firebase Console → Authentication → Settings → Authorized domains → add', window.location.hostname);
      await sendEmailVerification(user);
      console.log('[email] verification sent (no continueUrl) to', user.email);
    } else {
      console.error('[email] sendEmailVerification failed:', err.code, err.message);
      throw err;
    }
  }
}

// ── Shared small components ────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color }) {
  return (
    <div className="bg-surface rounded-xl border border-outline-variant/20 p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-on-surface leading-none">{value}</p>
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mt-0.5">{label}</p>
        {sub && <p className="text-xs text-on-surface-variant mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();

  // ── UI state ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState('overview');
  const [licenseModal, setLicenseModal] = useState(null);
  const [extendDays, setExtendDays] = useState(365);
  const [newLicensePlan, setNewLicensePlan] = useState('pro');
  const [orgDeleteConfirm, setOrgDeleteConfirm] = useState(null);
  const [toast, setToast] = useState('');
  const [licSearch, setLicSearch] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const [expandedOrg, setExpandedOrg] = useState(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [createOrgForm, setCreateOrgForm] = useState({ orgName: '', adminName: '', adminEmail: '', adminPassword: '', trialDays: 7 });
  const [createOrgLoading, setCreateOrgLoading] = useState(false);
  const [newLicenseOrgId, setNewLicenseOrgId] = useState('');
  const [secSearch, setSecSearch] = useState('');

  // ── Convert trial modal ───────────────────────────────────────────────
  const [convertModal, setConvertModal] = useState(null); // { license }
  const [convertPlan, setConvertPlan]   = useState('pro');
  const [convertDuration, setConvertDuration] = useState(365);

  // ── Change plan modal ─────────────────────────────────────────────────
  const [changePlanModal, setChangePlanModal] = useState(null); // { org, license }
  const [changePlanValue, setChangePlanValue] = useState('pro');

  // ── Security logs state (fetched directly from Firestore) ──────────────
  const [securityLogs, setSecurityLogs] = useState([]);
  const [secLogsLoading, setSecLogsLoading] = useState(false);

  // ── Backup state ──────────────────────────────────────────────────────
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [createBackupLoading, setCreateBackupLoading] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // ── Reset state ───────────────────────────────────────────────────────
  const [resetModal, setResetModal] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  // ── Idle session timeout (same logic as Layout.jsx) ───────────────────
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const IDLE_MS = ((state.systemSettings?.sessionTimeout) || 30) * 60 * 1000;
  const WARN_MS = 2 * 60 * 1000;
  useEffect(() => {
    if (!state.currentUser) return;
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
  }, [state.currentUser?.id, IDLE_MS]);

  const { organizations = [], users = [], properties = [], contracts = [], payments = [], activityLog = [] } = state;
  const licenses = state.licenses || [];

  // ── Subscribe to security_logs when tab is active ────────────────────
  useEffect(() => {
    if (tab !== 'security') return;
    setSecLogsLoading(true);
    const unsub = onSnapshot(
      query(
        collection(db, 'workspaces', WS, 'security_logs'),
        orderBy('createdAt', 'desc'),
        limit(300)
      ),
      snap => { setSecurityLogs(snap.docs.map(d => d.data())); setSecLogsLoading(false); },
      err => { console.error('[security_logs]', err); setSecLogsLoading(false); }
    );
    return () => unsub();
  }, [tab]);

  // ── Fetch backups list when tab is active ─────────────────────────────
  useEffect(() => {
    if (tab !== 'backups') return;
    setBackupsLoading(true);
    listBackups().then(list => { setBackups(list); setBackupsLoading(false); });
  }, [tab]);

  // ── KPIs ──────────────────────────────────────────────────────────────
  const activeOrgs = organizations.filter(o => o.active !== false).length;
  const activeLicensesCount = licenses.filter(l => {
    const info = getLicenseStatusInfo(l);
    return info.icon !== 'block' && info.icon !== 'cancel';
  }).length;
  const totalUsers = users.filter(u => u.role !== 'SUPER_ADMIN').length;
  const trialLicenses = licenses.filter(l => l.status === 'trial');
  const expiredLicenses = licenses.filter(l => {
    if (l.status === 'suspended') return false;
    if (l.expiresAt && new Date(l.expiresAt) < new Date()) return true;
    return l.status === 'expired';
  }).length;

  const mrr = useMemo(() => licenses
    .filter(l => l.status === 'active')
    .reduce((sum, l) => sum + (getPlan(l.plan).monthlyPrice || 100000), 0), [licenses]);

  const totalTrialsStarted = licenses.filter(l => l.trialDays > 0).length;
  const convertedTrials = licenses.filter(l => l.status === 'active' && l.trialDays > 0).length;
  const conversionRate = totalTrialsStarted > 0 ? Math.round(convertedTrials / totalTrialsStarted * 100) : 0;

  const inactiveOrgsCount = organizations.filter(o => {
    if (o.active === false) return true;
    const lic = licenses.find(l => l.orgId === o.id);
    return lic && (lic.status === 'suspended' || lic.status === 'expired' ||
      (lic.expiresAt && new Date(lic.expiresAt) < new Date() && lic.status !== 'trial' && lic.status !== 'active'));
  }).length;
  const churnRate = organizations.length > 0 ? Math.round(inactiveOrgsCount / organizations.length * 100) : 0;

  // ── Per-org stats ─────────────────────────────────────────────────────
  const orgStats = useMemo(() => organizations.map(o => {
    const orgLicense = licenses.find(l => l.orgId === o.id);
    const orgUsers = users.filter(u => u.orgId === o.id);
    const orgProps = properties.filter(p => p.orgId === o.id);
    const orgContracts = contracts.filter(c => c.orgId === o.id);
    const orgPayments = payments.filter(p => p.orgId === o.id);
    const revenue = orgPayments.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
    return { ...o, license: orgLicense, userCount: orgUsers.length, propCount: orgProps.length, contractCount: orgContracts.length, revenue };
  }), [organizations, licenses, users, properties, contracts, payments]);

  const filteredOrgs = orgStats.filter(o => !orgSearch || o.name?.toLowerCase().includes(orgSearch.toLowerCase()));
  const filteredLicenses = licenses.filter(l => !licSearch ||
    l.key?.toLowerCase().includes(licSearch.toLowerCase()) ||
    organizations.find(o => o.id === l.orgId)?.name?.toLowerCase().includes(licSearch.toLowerCase())
  );

  // ── Trials list (sorted by days remaining asc) ────────────────────────
  const trialList = useMemo(() => trialLicenses
    .map(l => ({ ...l, org: organizations.find(o => o.id === l.orgId), days: getDaysRemaining(l) }))
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999)), [trialLicenses, organizations]);

  // ── Security logs filter ──────────────────────────────────────────────
  const filteredSecLogs = secSearch
    ? securityLogs.filter(e =>
        (e.action || '').toLowerCase().includes(secSearch.toLowerCase()) ||
        (e.details || '').toLowerCase().includes(secSearch.toLowerCase()) ||
        (e.userEmail || '').toLowerCase().includes(secSearch.toLowerCase()))
    : securityLogs;

  const criticalLogs   = securityLogs.filter(e => e.severity === 'critical').length;
  const warningLogs    = securityLogs.filter(e => e.severity === 'warning').length;

  // ── Chart data ────────────────────────────────────────────────────────
  const mrrByPlanData = Object.keys(PLANS).map(planId => {
    const count = licenses.filter(l => l.status === 'active' && l.plan === planId).length;
    const p = getPlan(planId);
    return { name: p.name, MRR: count * (p.monthlyPrice || 100000), orgs: count, color: PLAN_COLORS[planId] };
  });

  const planDistData = Object.keys(PLANS).map(planId => {
    const count = organizations.filter(o =>
      (licenses.find(l => l.orgId === o.id)?.plan || o.plan || 'standard') === planId
    ).length;
    return { name: getPlan(planId).name, value: count, color: PLAN_COLORS[planId] };
  });

  const licenseStatusChartData = [
    { name: 'Actives',   value: licenses.filter(l => l.status === 'active').length,    fill: '#16a34a' },
    { name: 'Essais',    value: trialLicenses.length,                                   fill: '#d97706' },
    { name: 'Expirées',  value: expiredLicenses,                                        fill: '#dc2626' },
    { name: 'Susp.',     value: licenses.filter(l => l.status === 'suspended').length,  fill: '#6b7280' },
  ].filter(d => d.value > 0);

  const orgGrowthData = useMemo(() => {
    const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const now = new Date();
    const buckets = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[`${d.getFullYear()}-${d.getMonth()}`] = { month: MONTHS_FR[d.getMonth()], new: 0 };
    }
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    let cum = organizations.filter(o => !o.createdAt || new Date(o.createdAt) < cutoff).length;
    organizations.forEach(o => {
      if (o.createdAt) {
        const d = new Date(o.createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (buckets[key]) buckets[key].new++;
      }
    });
    return Object.values(buckets).map(b => { cum += b.new; return { ...b, total: cum }; });
  }, [organizations]);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleLicenseAction = async () => {
    if (!licenseModal) return;
    const { license, action } = licenseModal;
    if (action === 'suspend') {
      await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, status: 'suspended' } });
      await logSec({ action: SEC.LIC_SUSPENDED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: license.key });
      showToast('Licence suspendue');
    } else if (action === 'activate') {
      await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, status: 'active' } });
      await logSec({ action: SEC.LIC_ACTIVATED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: license.key });
      showToast('Licence activée');
    } else if (action === 'extend') {
      const newExpiry = new Date(Math.max(new Date(license.expiresAt || Date.now()), new Date()).getTime() + extendDays * 24 * 60 * 60 * 1000);
      await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, status: 'active', expiresAt: newExpiry.toISOString() } });
      showToast(`Licence prolongée de ${extendDays} jours`);
    } else if (action === 'new') {
      const targetOrgId = license.orgId || newLicenseOrgId;
      if (!targetOrgId) { showToast('Sélectionnez une organisation'); return; }
      const payload = createLicensePayload({ orgId: targetOrgId, plan: newLicensePlan, trialDays: 7 });
      await dispatch({ type: 'ADD_LICENSE', payload: { ...payload, id: payload.key, status: 'active' } });
      const org = organizations.find(o => o.id === targetOrgId);
      if (org) await dispatch({ type: 'UPDATE_ORGANIZATION', payload: { ...org, plan: newLicensePlan, licenseKey: payload.key } });
      await logSec({ action: SEC.LIC_CREATED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: payload.key, details: `Plan: ${newLicensePlan}` });
      showToast('Nouvelle licence créée');
    }
    setLicenseModal(null);
  };

  const handleExecuteChangePlan = async () => {
    if (!changePlanModal) return;
    const { org, license } = changePlanModal;
    try {
      if (license) {
        await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, plan: changePlanValue, status: 'active' } });
      }
      await dispatch({ type: 'UPDATE_ORGANIZATION', payload: { ...org, plan: changePlanValue } });
      await logSec({ action: 'PLAN_CHANGED', userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: org.name, details: `Plan: ${changePlanValue}` });
      showToast(`Plan changé → ${getPlan(changePlanValue).name}`);
      setChangePlanModal(null);
    } catch (err) {
      showToast(`Erreur : ${err?.message || 'Échec du changement de plan'}`);
    }
  };

  const handleConvertTrial = (license) => {
    setConvertPlan('pro');
    setConvertDuration(365);
    setConvertModal({ license });
  };

  const handleExecuteConvert = async () => {
    if (!convertModal) return;
    const { license } = convertModal;
    const expiry = new Date(Date.now() + convertDuration * 24 * 60 * 60 * 1000);
    await dispatch({ type: 'UPDATE_LICENSE', payload: { ...license, status: 'active', plan: convertPlan, expiresAt: expiry.toISOString() } });
    const org = organizations.find(o => o.id === license.orgId);
    if (org) await dispatch({ type: 'UPDATE_ORGANIZATION', payload: { ...org, plan: convertPlan } });
    await logSec({ action: SEC.LIC_CONVERTED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: license.key, details: `Plan: ${convertPlan} — ${convertDuration}j` });
    showToast(`Essai converti en ${getPlan(convertPlan).name} (${convertDuration}j)`);
    setConvertModal(null);
  };

  const handleDeleteOrg = async () => {
    if (!orgDeleteConfirm) return;
    await dispatch({ type: 'DELETE_ORGANIZATION', payload: orgDeleteConfirm.id });
    await logSec({ action: SEC.ORG_DELETED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: orgDeleteConfirm.name });
    showToast('Organisation supprimée');
    setOrgDeleteConfirm(null);
  };

  const handleCreateOrg = async () => {
    const { orgName, adminName, adminEmail, adminPassword } = createOrgForm;
    if (!orgName.trim()) { showToast("Nom d'organisation requis"); return; }
    if (!adminName.trim() || !adminEmail.trim()) { showToast('Nom et email admin requis'); return; }
    if (adminPassword.length < 8) { showToast('Mot de passe : 8 caractères minimum'); return; }
    const emailLow = adminEmail.trim().toLowerCase();
    const emailCheck = await validateEmailFull(emailLow);
    if (!emailCheck.valid) {
      showToast(emailCheck.reason === 'undeliverable'
        ? 'Email invalide ou inexistant — utilisez une adresse réelle'
        : 'Adresse email temporaire non acceptée — utilisez une adresse professionnelle');
      setCreateOrgLoading(false);
      return;
    }
    if (users.some(u => u.email === emailLow)) { showToast('Cet email est déjà utilisé'); return; }

    setCreateOrgLoading(true);

    // Use a secondary Firebase app to create the new user without signing out the SUPER_ADMIN.
    // createUserWithEmailAndPassword on the main auth instance would replace auth.currentUser,
    // which would break subsequent Firestore writes that rely on isSuperAdmin(wsId).
    let secondaryApp = null;
    let secondaryUser = null;
    let firebaseUid = null;
    try {
      secondaryApp = initializeApp(getApp().options, `adminCreate_${Date.now()}`);
      const fbCred = await createUserWithEmailAndPassword(getAuth(secondaryApp), emailLow, adminPassword);
      secondaryUser = fbCred.user;
      firebaseUid = fbCred.user.uid;
      await sendVerificationEmail(fbCred.user);
    } catch (fbErr) {
      if (fbErr.code === 'auth/email-already-in-use') {
        showToast('Cet email est déjà associé à un compte existant');
        if (secondaryApp) deleteApp(secondaryApp).catch(() => {});
        setCreateOrgLoading(false);
        return;
      }
      if (secondaryApp) deleteApp(secondaryApp).catch(() => {});
      showToast('Erreur Firebase Auth : ' + (fbErr.message || 'Réessayez'));
      setCreateOrgLoading(false);
      return;
    }

    try {
      const orgId = `org_${Date.now()}`;
      const initials = adminName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const hashedPwd = await hashPwd(adminPassword);
      const trialDays = Number(createOrgForm.trialDays) || 7;
      const license = createLicensePayload({ orgId, plan: 'trial', trialDays });

      // These Firestore writes use the SUPER_ADMIN's token (main auth unchanged).
      // Firestore rules allow create via isSuperAdmin(wsId).
      await dispatch({ type: 'ADD_ORGANIZATION', payload: { id: orgId, name: orgName.trim(), plan: 'trial', active: true, licenseKey: license.key, createdAt: new Date().toISOString() } });
      await dispatch({ type: 'ADD_LICENSE', payload: { ...license, id: license.key } });
      // firebaseUid in payload triggers usersByUid write inside ADD_USER
      await dispatch({ type: 'ADD_USER', payload: {
        name: adminName.trim(), email: emailLow,
        password: hashedPwd, role: 'ORGANIZATION_ADMIN', orgId, initials,
        color: 'bg-primary-container text-on-primary-container', firstLogin: false,
        emailVerificationRequired: true, firebaseUid,
      }});
      await logSec({ action: SEC.ORG_CREATED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: orgName.trim(), details: `Essai: ${trialDays}j — vérification email requise` });
      showToast(`Organisation "${orgName.trim()}" créée — email de vérification envoyé à ${emailLow}`);
      setShowCreateOrg(false);
      setCreateOrgForm({ orgName: '', adminName: '', adminEmail: '', adminPassword: '', trialDays: 7 });
    } catch (err) {
      // Firestore writes failed — roll back the Firebase Auth account
      if (secondaryUser) deleteUser(secondaryUser).catch(() => {});
      showToast('Erreur : ' + (err.message || 'Réessayez'));
    } finally {
      if (secondaryApp) deleteApp(secondaryApp).catch(() => {});
      setCreateOrgLoading(false);
    }
  };

  // ── Backup handlers ───────────────────────────────────────────────────
  const handleCreateBackup = async () => {
    setCreateBackupLoading(true);
    try {
      const meta = await createBackup({ currentUser: state.currentUser });
      await logSec({ action: SEC.BACKUP_CREATED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', details: `${meta.id} — ${meta.totalDocs} documents` });
      showToast(`Backup créé — ${meta.totalDocs} documents`);
      const list = await listBackups();
      setBackups(list);
    } catch (err) {
      showToast('Erreur backup : ' + (err.message || 'Réessayez'));
    } finally {
      setCreateBackupLoading(false);
    }
  };

  const executeRestore = async (backupId) => {
    setRestoreLoading(true);
    try {
      await restoreBackup({ backupId });
      await logSec({ action: SEC.BACKUP_RESTORED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', details: `Backup restauré: ${backupId}` });
      showToast('Restauration terminée — rechargement…');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      showToast('Erreur restauration : ' + (err.message || 'Réessayez'));
    } finally {
      setRestoreLoading(false);
      setRestoreConfirm(null);
    }
  };

  const handleDeleteBackup = async (backupId) => {
    await deleteBackupMeta({ backupId });
    await logSec({ action: SEC.BACKUP_DELETED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: backupId });
    setBackups(prev => prev.filter(b => b.id !== backupId));
    showToast('Backup supprimé');
  };

  // ── Platform reset handler ────────────────────────────────────────────
  const handlePlatformReset = async () => {
    if (!resetPassword) return;
    setResetLoading(true);
    try {
      showToast('Création du backup de sécurité…');
      const backupMeta = await createBackup({ currentUser: state.currentUser });
      await dispatch({ type: 'PLATFORM_RESET', payload: { password: resetPassword } });
      await logSec({
        action: SEC.PLATFORM_RESET,
        userId: state.currentUser?.id,
        userEmail: state.currentUser?.email,
        role: 'SUPER_ADMIN',
        details: `RESET GLOBAL — backup préalable: ${backupMeta.id}`,
        severity: 'critical',
      });
      showToast('Reset terminé. Backup conservé : ' + backupMeta.id);
      setResetModal(false);
      setResetStep(1);
      setResetConfirmText('');
      setResetPassword('');
    } catch (err) {
      showToast('Erreur reset : ' + (err.message || 'Mot de passe incorrect ?'));
    } finally {
      setResetLoading(false);
    }
  };

  const closeReset = () => { setResetModal(false); setResetStep(1); setResetConfirmText(''); setResetPassword(''); };

  // ── Security log style ────────────────────────────────────────────────
  const secLogStyle = (sev, action) => {
    if (sev === 'critical') return { icon: 'gpp_bad', cls: 'bg-error/10 text-error' };
    if (sev === 'warning')  return { icon: 'warning', cls: 'bg-amber-100 text-amber-700' };
    if ((action || '').toUpperCase() === 'LOGIN_SUCCESS') return { icon: 'login', cls: 'bg-green-100 text-green-700' };
    if ((action || '').toUpperCase() === 'BACKUP_CREATED' || (action || '').toUpperCase() === 'BACKUP_RESTORED')
      return { icon: 'backup', cls: 'bg-blue-100 text-blue-700' };
    return { icon: 'shield', cls: 'bg-primary/10 text-primary' };
  };

  // ── Tabs ──────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'overview',    label: "Vue d'ensemble", icon: 'dashboard' },
    { id: 'orgs',        label: 'Organisations',  icon: 'corporate_fare' },
    { id: 'trials',      label: 'Essais',          icon: 'hourglass_top' },
    { id: 'licenses',    label: 'Licences',        icon: 'verified' },
    { id: 'marketplace', label: 'Marketplace',     icon: 'store' },
    { id: 'clients',     label: 'Clients',         icon: 'people' },
    { id: 'stats',       label: 'Statistiques',    icon: 'bar_chart' },
    { id: 'backups',     label: 'Backups',         icon: 'backup' },
    { id: 'security',    label: 'Sécurité',        icon: 'security' },
    { id: 'activity',    label: 'Activité',        icon: 'history' },
    { id: 'platform',    label: 'Plateforme',      icon: 'settings_suggest' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {showIdleWarning && (
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
      )}
      {toast && (
        <div className="fixed top-5 right-5 z-[9998] bg-tertiary text-on-tertiary px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-fade-in">
          <Icon name="check_circle" size={16} /> {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-surface border-b border-outline-variant/20 px-4 sm:px-8 h-16 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Icon name="admin_panel_settings" size={20} className="text-on-primary" />
          </div>
          <div>
            <h1 className="font-black text-base text-on-surface">Super Admin</h1>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Minsouah Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCreateOrg(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors">
            <Icon name="add_business" size={14} /> Nouvelle organisation
          </button>
          <button onClick={() => { dispatch({ type: 'LOGOUT' }); navigate('/login'); }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
            title="Déconnexion">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Organisations" value={organizations.length} sub={`${activeOrgs} actives`} icon="corporate_fare" color="bg-primary/10 text-primary" />
          <StatCard label="MRR" value={Number(mrr).toLocaleString('fr-CI')} sub="FCFA/mois" icon="payments" color="bg-green-100 text-green-700" />
          <StatCard label="Licences" value={activeLicensesCount} sub={`${trialLicenses.length} essais`} icon="verified" color="bg-blue-100 text-blue-700" />
          <StatCard label="Expirées" value={expiredLicenses} icon="cancel" color={expiredLicenses > 0 ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'} />
          <StatCard label="Utilisateurs" value={totalUsers} icon="group" color="bg-purple-100 text-purple-700" />
          <StatCard label="Conversion" value={`${conversionRate}%`} sub="trial → actif" icon="trending_up" color="bg-amber-100 text-amber-700" />
          <StatCard label="Churn" value={`${churnRate}%`} sub="inactives" icon="trending_down" color={churnRate > 20 ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'} />
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 no-scrollbar">
          <div className="flex gap-1 bg-surface-container rounded-xl p-1 min-w-max sm:min-w-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-bold transition-all ${tab === t.id ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
                <Icon name={t.icon} size={15} filled={tab === t.id} />
                {t.label}
                {t.id === 'trials' && trialLicenses.length > 0 && (
                  <span className="min-w-[18px] h-[18px] bg-amber-500 text-white rounded-full text-[10px] font-black flex items-center justify-center px-1">{trialLicenses.length}</span>
                )}
                {t.id === 'security' && criticalLogs > 0 && (
                  <span className="min-w-[18px] h-[18px] bg-error text-white rounded-full text-[10px] font-black flex items-center justify-center px-1">{criticalLogs}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
              <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="pie_chart" size={16} className="text-primary" />Répartition des plans</h3>
              {Object.keys(PLANS).map(planId => {
                const count = organizations.filter(o => (licenses.find(l => l.orgId === o.id)?.plan || o.plan || 'standard') === planId).length;
                const pct = organizations.length > 0 ? Math.round(count / organizations.length * 100) : 0;
                const p = getPlan(planId);
                return (
                  <div key={planId} className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold text-on-surface">{p.name}</span>
                      <span className="text-on-surface-variant">{count} org · {pct}%</span>
                    </div>
                    <div className="h-2 bg-surface-container rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
              <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="corporate_fare" size={16} className="text-primary" />Organisations récentes</h3>
              {orgStats.slice(0, 5).map(o => {
                const licInfo = getLicenseStatusInfo(o.license);
                const p = getPlan(o.license?.plan || o.plan || 'standard');
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center font-bold text-on-primary-container text-xs flex-shrink-0">{o.name?.[0]?.toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{o.name}</p>
                      <p className="text-xs text-on-surface-variant">{o.userCount} user · {o.propCount} biens</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${licInfo.color}`}>{licInfo.label}</span>
                    </div>
                  </div>
                );
              })}
              {organizations.length === 0 && <p className="text-center text-sm text-on-surface-variant py-6">Aucune organisation</p>}
            </div>

            <div className="bg-surface rounded-xl border border-outline-variant/20 p-5 lg:col-span-2">
              <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="schedule" size={16} className="text-amber-600" />Alertes licences <span className="text-xs font-normal text-on-surface-variant ml-1">(expire dans ≤ 30j)</span></h3>
              {(() => {
                const expiring = licenses.filter(l => { if (!l.expiresAt) return false; const d = getDaysRemaining(l); return d !== null && d <= 30 && (l.status === 'trial' || l.status === 'active'); });
                if (expiring.length === 0) return <p className="text-sm text-on-surface-variant text-center py-4"><Icon name="check_circle" size={20} className="text-green-600 inline mr-1" />Aucune licence n'expire dans les 30 prochains jours.</p>;
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead><tr className="text-xs text-on-surface-variant uppercase tracking-wide border-b border-outline-variant/20">
                        <th className="pb-2">Organisation</th><th className="pb-2">Plan</th><th className="pb-2">Statut</th><th className="pb-2 text-right">Jours</th><th className="pb-2" />
                      </tr></thead>
                      <tbody>{expiring.map(l => {
                        const org = organizations.find(o => o.id === l.orgId);
                        const days = getDaysRemaining(l);
                        const p = getPlan(l.plan);
                        return (
                          <tr key={l.key || l.id} className="border-b border-outline-variant/10 last:border-0">
                            <td className="py-2 font-medium text-on-surface">{org?.name || l.orgId}</td>
                            <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span></td>
                            <td className="py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{l.status}</span></td>
                            <td className="py-2 text-right font-bold text-amber-700">{days}j</td>
                            <td className="py-2 text-right"><button onClick={() => setLicenseModal({ license: l, action: 'extend' })} className="text-xs text-primary hover:underline">Prolonger</button></td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── ORGANISATIONS ── */}
        {tab === 'orgs' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input value={orgSearch} onChange={e => setOrgSearch(e.target.value)} placeholder="Rechercher..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <button onClick={() => setShowCreateOrg(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
                <Icon name="add_business" size={16} /> Nouvelle org
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {filteredOrgs.length === 0 && (
                <div className="bg-surface rounded-xl border border-outline-variant/20 py-12 text-center text-on-surface-variant text-sm">Aucune organisation trouvée</div>
              )}
              {filteredOrgs.map(o => {
                const licInfo = getLicenseStatusInfo(o.license);
                const p = getPlan(o.license?.plan || o.plan || 'standard');
                const isOpen = expandedOrg === o.id;
                const orgUsers = users.filter(u => u.orgId === o.id && u.role !== 'SUPER_ADMIN');
                const adminUser = orgUsers.find(u => u.role === 'ORGANIZATION_ADMIN' || u.role === 'ADMIN') || orgUsers[0];
                const orgActivity = activityLog.filter(e => e.orgId === o.id || orgUsers.some(u => u.id === e.userId)).slice(0, 6);
                const orgProps = properties.filter(pr => pr.orgId === o.id);
                const orgContracts = contracts.filter(c => c.orgId === o.id);
                const orgPayments = payments.filter(pm => pm.orgId === o.id);
                const ROLE_LABELS = { ORGANIZATION_ADMIN: 'Admin', ADMIN: 'Admin', AGENT: 'Agent', MANAGER: 'Manager', CONCIERGE: 'Concierge', TECHNICIAN: 'Technicien', ACCOUNTANT: 'Comptable', TENANT: 'Locataire', OWNER: 'Propriétaire' };
                return (
                  <div key={o.id} className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden shadow-sm">
                    {/* ── Header row (clickable) ── */}
                    <div
                      onClick={() => setExpandedOrg(isOpen ? null : o.id)}
                      className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-surface-container/40 transition-colors select-none">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-black text-primary text-base flex-shrink-0">{o.name?.[0]?.toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-on-surface text-sm">{o.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span>
                          {o.active === false
                            ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-error/10 text-error">Suspendue</span>
                            : <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${licInfo.color}`}>{licInfo.label}</span>}
                        </div>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {orgUsers.length} utilisateur{orgUsers.length > 1 ? 's' : ''} · {orgProps.length} biens · {orgContracts.filter(c => c.status === 'Actif').length} contrats actifs
                          {adminUser ? ` · Admin: ${adminUser.email || adminUser.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="hidden sm:flex items-center gap-1">
                          {o.license && <button onClick={e => { e.stopPropagation(); setLicenseModal({ license: o.license, action: 'extend' }); }} className="text-xs text-primary px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">Prolonger</button>}
                          {o.id !== 'default' && (
                            <button
                              onClick={async e => { e.stopPropagation(); await dispatch({ type: 'UPDATE_ORGANIZATION', payload: { ...o, active: o.active === false } }); await logSec({ action: o.active === false ? SEC.ORG_ACTIVATED : SEC.ORG_SUSPENDED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: o.name }); }}
                              className={`text-xs px-2 py-1 rounded-lg transition-colors font-semibold ${o.active === false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                              {o.active === false ? 'Activer' : 'Suspendre'}
                            </button>
                          )}
                        </div>
                        <Icon name={isOpen ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} size={20} className="text-on-surface-variant" />
                      </div>
                    </div>

                    {/* ── Expanded detail panel ── */}
                    {isOpen && (
                      <div className="border-t border-outline-variant/20 bg-surface-container/30 px-5 py-5 flex flex-col gap-6">

                        {/* KPIs rapides */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'Biens',           value: orgProps.length,                                              icon: 'apartment',  color: 'bg-primary/10 text-primary' },
                            { label: 'Contrats actifs', value: orgContracts.filter(c => c.status === 'Actif').length,        icon: 'contract',   color: 'bg-green-100 text-green-700' },
                            { label: 'Paiements',       value: orgPayments.length,                                           icon: 'payments',   color: 'bg-blue-100 text-blue-700' },
                            { label: 'Impayés',         value: orgPayments.filter(pm => pm.status !== 'Payé').length,        icon: 'pending',    color: 'bg-amber-100 text-amber-700' },
                          ].map(s => (
                            <div key={s.label} className={`p-3 rounded-xl ${s.color.split(' ')[1]} flex items-center gap-2`}>
                              <Icon name={s.icon} size={18} className={s.color.split(' ')[0]} />
                              <div><p className={`font-black text-lg leading-none ${s.color.split(' ')[0]}`}>{s.value}</p><p className="text-[10px] text-on-surface-variant mt-0.5">{s.label}</p></div>
                            </div>
                          ))}
                        </div>

                        {/* Utilisateurs */}
                        <div>
                          <p className="text-xs font-bold text-on-surface uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Icon name="group" size={14} className="text-primary" /> Utilisateurs ({orgUsers.length})
                          </p>
                          {orgUsers.length === 0
                            ? <p className="text-xs text-on-surface-variant italic">Aucun utilisateur</p>
                            : (
                              <div className="bg-surface rounded-xl overflow-hidden border border-outline-variant/20">
                                <table className="w-full text-left">
                                  <thead className="bg-surface-container">
                                    <tr className="text-[10px] text-on-surface-variant uppercase tracking-wide">
                                      <th className="px-3 py-2">Nom</th>
                                      <th className="px-3 py-2">Email</th>
                                      <th className="px-3 py-2">Rôle</th>
                                      <th className="px-3 py-2">Téléphone</th>
                                      <th className="px-3 py-2">Connexion</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-outline-variant/10">
                                    {orgUsers.map(u => (
                                      <tr key={u.id} className="hover:bg-surface-container/40">
                                        <td className="px-3 py-2.5">
                                          <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-secondary/15 flex items-center justify-center text-[9px] font-bold text-secondary flex-shrink-0">{u.name?.[0]?.toUpperCase() || '?'}</div>
                                            <span className="text-xs font-semibold text-on-surface">{u.name || '—'}</span>
                                            {(u.role === 'ORGANIZATION_ADMIN' || u.role === 'ADMIN') && <span className="text-[8px] bg-primary/10 text-primary px-1 rounded font-bold">Admin</span>}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-on-surface-variant font-mono">{u.email || '—'}</td>
                                        <td className="px-3 py-2.5"><span className="text-[10px] bg-surface-container px-1.5 py-0.5 rounded font-semibold text-on-surface-variant">{ROLE_LABELS[u.role] || u.role}</span></td>
                                        <td className="px-3 py-2.5 text-xs text-on-surface-variant">{u.phone || '—'}</td>
                                        <td className="px-3 py-2.5 text-xs text-on-surface-variant">{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('fr-FR') : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )
                          }
                        </div>

                        {/* Accès admin */}
                        {adminUser && (
                          <div className="bg-surface rounded-xl border border-outline-variant/20 p-4 flex flex-col gap-2">
                            <p className="text-xs font-bold text-on-surface uppercase tracking-widest flex items-center gap-1.5">
                              <Icon name="manage_accounts" size={14} className="text-primary" /> Compte administrateur
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-on-surface-variant uppercase tracking-wide">Email de connexion</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono font-semibold text-on-surface">{adminUser.email || '—'}</span>
                                  {adminUser.email && (
                                    <button onClick={() => navigator.clipboard?.writeText(adminUser.email).then(() => showToast('Email copié'))}
                                      className="text-on-surface-variant hover:text-primary transition-colors">
                                      <Icon name="content_copy" size={13} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-on-surface-variant uppercase tracking-wide">Mot de passe</span>
                                <span className="text-xs text-on-surface-variant italic">Géré par Firebase Auth — utilisez "Réinitialiser" pour envoyer un nouveau mot de passe.</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Récap activité */}
                        <div>
                          <p className="text-xs font-bold text-on-surface uppercase tracking-widest mb-3 flex items-center gap-1.5">
                            <Icon name="history" size={14} className="text-primary" /> Dernières activités
                          </p>
                          {orgActivity.length === 0
                            ? <p className="text-xs text-on-surface-variant italic">Aucune activité enregistrée</p>
                            : (
                              <div className="flex flex-col divide-y divide-outline-variant/10 bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
                                {orgActivity.map((e, i) => (
                                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                                    <div className="w-6 h-6 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                                      <Icon name="circle" size={8} className="text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-on-surface truncate">{e.details || e.action}</p>
                                      <p className="text-[10px] text-on-surface-variant">{e.userName || e.userEmail || '—'}</p>
                                    </div>
                                    <p className="text-[10px] text-on-surface-variant flex-shrink-0">
                                      {e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )
                          }
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 flex-wrap pt-1 border-t border-outline-variant/20">
                          {o.license && <button onClick={() => setLicenseModal({ license: o.license, action: 'extend' })} className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary hover:bg-primary/20 px-3 py-2 rounded-xl font-semibold transition-colors"><Icon name="update" size={13} />Prolonger licence</button>}
                          <button onClick={() => { setChangePlanValue(o.license?.plan || o.plan || 'pro'); setChangePlanModal({ org: o, license: o.license }); }} className="flex items-center gap-1.5 text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-2 rounded-xl font-semibold transition-colors"><Icon name="swap_horiz" size={13} />Changer le plan</button>
                          <button onClick={() => setLicenseModal({ license: { orgId: o.id }, action: 'new' })} className="flex items-center gap-1.5 text-xs bg-surface-container text-on-surface-variant hover:text-on-surface px-3 py-2 rounded-xl font-semibold transition-colors border border-outline-variant/30"><Icon name="add_card" size={13} />Nouvelle licence</button>
                          {o.id !== 'default' && (
                            <>
                              <button
                                onClick={async () => { await dispatch({ type: 'UPDATE_ORGANIZATION', payload: { ...o, active: o.active === false } }); await logSec({ action: o.active === false ? SEC.ORG_ACTIVATED : SEC.ORG_SUSPENDED, userId: state.currentUser?.id, userEmail: state.currentUser?.email, role: 'SUPER_ADMIN', target: o.name }); }}
                                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl transition-colors font-semibold ${o.active === false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                                <Icon name={o.active === false ? 'play_circle' : 'pause_circle'} size={13} />
                                {o.active === false ? 'Activer' : 'Suspendre'}
                              </button>
                              <button onClick={() => setOrgDeleteConfirm(o)} className="flex items-center gap-1.5 text-xs text-error hover:bg-error/10 px-3 py-2 rounded-xl transition-colors font-semibold"><Icon name="delete" size={13} />Supprimer</button>
                            </>
                          )}
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ESSAIS ── */}
        {tab === 'trials' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Essais actifs" value={trialList.length} icon="hourglass_top" color="bg-amber-100 text-amber-700" />
              <StatCard label="Critiques ≤ 3j" value={trialList.filter(l => l.days !== null && l.days <= 3).length} icon="timer" color={trialList.filter(l => l.days !== null && l.days <= 3).length > 0 ? 'bg-error/10 text-error' : 'bg-surface-container text-on-surface-variant'} />
              <StatCard label="Expirent ≤ 7j" value={trialList.filter(l => l.days !== null && l.days <= 7).length} icon="schedule" color="bg-amber-100 text-amber-700" />
              <StatCard label="Convertis" value={convertedTrials} sub={`${conversionRate}% taux`} icon="verified" color="bg-green-100 text-green-700" />
            </div>
            {trialList.length === 0 ? (
              <div className="bg-surface rounded-xl border border-outline-variant/20 py-16 text-center flex flex-col items-center gap-2 text-on-surface-variant">
                <Icon name="hourglass_empty" size={40} className="opacity-20" /><p>Aucun essai en cours</p>
              </div>
            ) : (
              <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container text-xs text-on-surface-variant uppercase tracking-wide">
                      <tr><th className="px-4 py-3">Organisation</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Démarré</th><th className="px-4 py-3">Expire</th><th className="px-4 py-3">Jours</th><th className="px-4 py-3">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {trialList.map(l => {
                        const urgency = l.days !== null && l.days <= 3 ? 'red' : l.days !== null && l.days <= 7 ? 'amber' : 'green';
                        const badgeCls = urgency === 'red' ? 'bg-error/10 text-error' : urgency === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
                        return (
                          <tr key={l.key || l.id} className="hover:bg-surface-container/50 transition-colors">
                            <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs">{l.org?.name?.[0]?.toUpperCase() || '?'}</div><span className="font-semibold text-on-surface text-sm">{l.org?.name || l.orgId}</span></div></td>
                            <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${getPlan(l.plan).badgeColor}`}>{getPlan(l.plan).name}</span></td>
                            <td className="px-4 py-3 text-xs text-on-surface-variant">{l.createdAt ? new Date(l.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                            <td className="px-4 py-3 text-xs text-on-surface-variant">{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('fr-FR') : '—'}</td>
                            <td className="px-4 py-3"><span className={`text-xs px-2.5 py-1 rounded-full font-bold ${badgeCls}`}>{l.days !== null ? `${l.days}j` : '—'}</span></td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1.5 flex-wrap">
                                <button onClick={() => handleConvertTrial(l)} className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-2.5 py-1 rounded-lg font-semibold transition-colors flex items-center gap-1"><Icon name="verified" size={12} />Convertir</button>
                                <button onClick={() => setLicenseModal({ license: l, action: 'extend' })} className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 rounded-lg font-semibold transition-colors">+Jours</button>
                                <button onClick={() => setLicenseModal({ license: l, action: 'suspend' })} className="text-xs bg-error/10 text-error hover:bg-error/20 px-2.5 py-1 rounded-lg font-semibold transition-colors">Suspendre</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LICENCES ── */}
        {tab === 'licenses' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input value={licSearch} onChange={e => setLicSearch(e.target.value)} placeholder="Clé ou organisation..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <button onClick={() => { setNewLicenseOrgId(organizations[0]?.id || ''); setLicenseModal({ license: { orgId: '' }, action: 'new' }); }} className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
                <Icon name="add_card" size={16} /> Nouvelle licence
              </button>
            </div>
            <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-surface-container text-xs text-on-surface-variant uppercase tracking-wide">
                    <tr><th className="px-4 py-3">Clé de licence</th><th className="px-4 py-3">Organisation</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3">Expiration</th><th className="px-4 py-3">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10">
                    {filteredLicenses.map(l => {
                      const org = organizations.find(o => o.id === l.orgId);
                      const licInfo = getLicenseStatusInfo(l);
                      const p = getPlan(l.plan);
                      const days = getDaysRemaining(l);
                      return (
                        <tr key={l.key || l.id} className="hover:bg-surface-container/50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-on-surface">{l.key || l.id}</td>
                          <td className="px-4 py-3 text-sm font-medium text-on-surface">{org?.name || l.orgId || '—'}</td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${p.badgeColor}`}>{p.name}</span></td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${licInfo.color}`}>{licInfo.label}</span></td>
                          <td className="px-4 py-3 text-xs text-on-surface-variant">
                            {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('fr-FR') : '—'}
                            {days !== null && days <= 30 && l.status !== 'expired' && <span className="ml-1 text-amber-600 font-bold">({days}j)</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => setLicenseModal({ license: l, action: 'extend' })} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-lg hover:bg-primary/20 transition-colors font-semibold">+Jours</button>
                              {l.status !== 'suspended'
                                ? <button onClick={() => setLicenseModal({ license: l, action: 'suspend' })} className="text-xs bg-error/10 text-error px-2 py-1 rounded-lg hover:bg-error/20 transition-colors font-semibold">Suspendre</button>
                                : <button onClick={() => setLicenseModal({ license: l, action: 'activate' })} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg hover:bg-green-200 transition-colors font-semibold">Activer</button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredLicenses.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-on-surface-variant">Aucune licence trouvée</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── STATISTIQUES ── */}
        {tab === 'stats' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">MRR Total</p>
                <p className="text-3xl font-black text-on-surface">{Number(mrr).toLocaleString('fr-CI')}</p>
                <p className="text-xs text-on-surface-variant mt-1">FCFA / mois</p>
              </div>
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Taux de conversion</p>
                <p className="text-3xl font-black text-on-surface">{conversionRate}%</p>
                <p className="text-xs text-on-surface-variant mt-1">{convertedTrials} / {totalTrialsStarted} essais convertis</p>
              </div>
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Taux de churn</p>
                <p className={`text-3xl font-black ${churnRate > 20 ? 'text-error' : 'text-on-surface'}`}>{churnRate}%</p>
                <p className="text-xs text-on-surface-variant mt-1">{inactiveOrgsCount} orgs inactives</p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
                <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="bar_chart" size={16} className="text-primary" />MRR par plan</h3>
                {mrrByPlanData.every(d => d.MRR === 0) ? <div className="h-48 flex items-center justify-center text-on-surface-variant text-sm">Aucune licence active</div> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={mrrByPlanData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} />
                      <Tooltip formatter={v => [Number(v).toLocaleString('fr-CI') + ' FCFA', 'MRR']} />
                      <Bar dataKey="MRR" radius={[4, 4, 0, 0]}>{mrrByPlanData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
                <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="trending_up" size={16} className="text-primary" />Croissance organisations (6 mois)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={orgGrowthData} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v, n) => [v, n === 'total' ? 'Total orgs' : 'Nouvelles']} />
                    <Area type="monotone" dataKey="total" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} strokeWidth={2} name="total" />
                    <Area type="monotone" dataKey="new" stroke="#16a34a" fill="#16a34a" fillOpacity={0.12} strokeWidth={2} name="new" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
                <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="donut_large" size={16} className="text-primary" />Distribution des plans</h3>
                {planDistData.every(d => d.value === 0) ? <div className="h-48 flex items-center justify-center text-on-surface-variant text-sm">Aucune organisation</div> : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={180}>
                      <PieChart><Pie data={planDistData.filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ value }) => value}>{planDistData.filter(d => d.value > 0).map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip /></PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2.5 flex-1">{planDistData.map(d => (<div key={d.name} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} /><span className="text-sm text-on-surface">{d.name}</span><span className="text-sm font-bold text-on-surface ml-auto">{d.value}</span></div>))}</div>
                  </div>
                )}
              </div>
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-5">
                <h3 className="font-bold text-on-surface mb-4 flex items-center gap-2"><Icon name="donut_large" size={16} className="text-green-600" />Santé des licences</h3>
                {licenseStatusChartData.length === 0 ? <div className="h-48 flex items-center justify-center text-on-surface-variant text-sm">Aucune licence</div> : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={180}>
                      <PieChart><Pie data={licenseStatusChartData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ value }) => value}>{licenseStatusChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}</Pie><Tooltip /></PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2.5 flex-1">{licenseStatusChartData.map(d => (<div key={d.name} className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} /><span className="text-sm text-on-surface">{d.name}</span><span className="text-sm font-bold text-on-surface ml-auto">{d.value}</span></div>))}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── BACKUPS ── */}
        {tab === 'backups' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-on-surface text-lg">Backup & Restauration</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Sauvegarde complète de toutes les collections Firestore</p>
              </div>
              <button onClick={handleCreateBackup} disabled={createBackupLoading}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60">
                {createBackupLoading ? <><Icon name="progress_activity" size={16} className="animate-spin" />Création…</> : <><Icon name="backup" size={16} />Créer un backup</>}
              </button>
            </div>

            {backupsLoading ? (
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-8 text-center text-on-surface-variant">
                <Icon name="progress_activity" size={24} className="animate-spin text-primary mb-2" />
                <p>Chargement…</p>
              </div>
            ) : backups.length === 0 ? (
              <div className="bg-surface rounded-xl border border-outline-variant/20 py-16 text-center flex flex-col items-center gap-2 text-on-surface-variant">
                <Icon name="cloud_off" size={40} className="opacity-20" />
                <p>Aucun backup disponible</p>
                <p className="text-xs">Créez votre premier backup pour sécuriser vos données</p>
              </div>
            ) : (
              <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
                <div className="divide-y divide-outline-variant/10">
                  {backups.map(b => (
                    <div key={b.id} className="px-5 py-4 flex items-start gap-4 hover:bg-surface-container/50">
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon name="cloud_done" size={20} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-on-surface text-sm font-mono">{b.id}</p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          {b.createdAt ? new Date(b.createdAt).toLocaleString('fr-FR') : '—'}
                          &nbsp;·&nbsp;<strong>{b.totalDocs || 0}</strong> documents
                          &nbsp;·&nbsp;par {b.createdBy}
                        </p>
                        {b.stats && (
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {Object.entries(b.stats).filter(([, v]) => v > 0).map(([k, v]) => (
                              <span key={k} className="text-[10px] px-1.5 py-0.5 bg-surface-container rounded text-on-surface-variant">{k}: {v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => setRestoreConfirm(b)}
                          className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1">
                          <Icon name="restore" size={14} />Restaurer
                        </button>
                        <button onClick={() => handleDeleteBackup(b.id)}
                          className="text-xs text-error hover:bg-error/10 px-2 py-1.5 rounded-lg transition-colors">
                          <Icon name="delete" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
              <Icon name="info" size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Conservation des backups</p>
                <p>Les 10 derniers backups sont affichés. Les données de sous-collections restent dans Firestore après suppression des métadonnées (suppression complète via Cloud Functions en production). Un backup est créé automatiquement avant tout reset global.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── SÉCURITÉ ── */}
        {tab === 'security' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input value={secSearch} onChange={e => setSecSearch(e.target.value)} placeholder="Filtrer par action, email, détails…"
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <span className="px-3 py-1.5 bg-error/10 text-error rounded-xl text-xs font-bold">{criticalLogs} critiques</span>
              <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-xl text-xs font-bold">{warningLogs} alertes</span>
              <span className="px-3 py-1.5 bg-surface-container text-on-surface-variant rounded-xl text-xs font-bold">{securityLogs.length} total</span>
            </div>

            {secLogsLoading ? (
              <div className="bg-surface rounded-xl border border-outline-variant/20 p-8 text-center text-on-surface-variant">
                <Icon name="progress_activity" size={24} className="animate-spin text-primary mb-2" />
                <p>Chargement des logs…</p>
              </div>
            ) : filteredSecLogs.length === 0 ? (
              <div className="bg-surface rounded-xl border border-outline-variant/20 py-16 text-center flex flex-col items-center gap-2 text-on-surface-variant">
                <Icon name="verified_user" size={40} className="opacity-20" />
                <p>Aucun événement de sécurité {secSearch ? 'pour ce filtre' : 'enregistré'}</p>
              </div>
            ) : (
              <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
                <div className="divide-y divide-outline-variant/10 max-h-[600px] overflow-y-auto">
                  {filteredSecLogs.map((e, i) => {
                    const { icon, cls } = secLogStyle(e.severity, e.action);
                    return (
                      <div key={e.createdAt || i} className="px-5 py-3 flex items-start gap-3 hover:bg-surface-container/50">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cls}`}>
                          <Icon name={icon} size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>{e.action}</span>
                            {e.userEmail && <span className="text-xs text-on-surface-variant">{e.userEmail}</span>}
                            {e.target && <span className="text-xs text-on-surface-variant">→ {e.target}</span>}
                          </div>
                          {e.details && <p className="text-sm text-on-surface mt-0.5">{e.details}</p>}
                          {e.orgId && <p className="text-xs text-on-surface-variant mt-0.5">Org: {e.orgId}</p>}
                        </div>
                        <p className="text-xs text-on-surface-variant flex-shrink-0 mt-1">
                          {e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITÉ ── */}
        {tab === 'activity' && (
          <div className="bg-surface rounded-xl border border-outline-variant/20 overflow-hidden">
            {activityLog.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant flex flex-col items-center gap-2">
                <Icon name="history" size={40} className="opacity-20" /><p>Aucune activité enregistrée</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10 max-h-[600px] overflow-y-auto">
                {activityLog.map((log, i) => (
                  <div key={log.id || i} className="px-5 py-3 flex items-start gap-3 hover:bg-surface-container/50">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"><Icon name="history" size={14} className="text-primary" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-on-surface">{log.details}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{log.action} · {log.timestamp ? new Date(log.timestamp).toLocaleString('fr-FR') : '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MARKETPLACE ── */}
        {tab === 'marketplace' && (
          <div className="px-4 sm:px-8 py-6">
            <MarketplaceAdmin />
          </div>
        )}

        {/* ── CLIENTS & REVENUS ── */}
        {tab === 'clients' && (
          <div className="px-4 sm:px-8 py-6">
            <MarketplaceClients />
          </div>
        )}

        {/* ── PLATEFORME ── */}
        {tab === 'platform' && <PlatformTab state={state} dispatch={dispatch} showToast={showToast} onResetClick={() => setResetModal(true)} />}
      </div>

      {/* ── License modal ── */}
      {licenseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {licenseModal.action === 'suspend' && (<>
              <div className="w-12 h-12 bg-error/10 rounded-xl flex items-center justify-center mb-4"><Icon name="block" size={24} className="text-error" /></div>
              <h3 className="font-bold text-lg text-on-surface mb-2">Suspendre la licence ?</h3>
              <p className="text-sm text-on-surface-variant mb-5">L'organisation perdra l'accès immédiatement.</p>
              <div className="flex gap-3"><button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button><button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-bold">Suspendre</button></div>
            </>)}
            {licenseModal.action === 'activate' && (<>
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4"><Icon name="verified" size={24} className="text-green-700" /></div>
              <h3 className="font-bold text-lg text-on-surface mb-2">Activer la licence ?</h3>
              <p className="text-sm text-on-surface-variant mb-5">L'organisation retrouvera l'accès.</p>
              <div className="flex gap-3"><button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button><button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold">Activer</button></div>
            </>)}
            {licenseModal.action === 'extend' && (<>
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4"><Icon name="schedule" size={24} className="text-primary" /></div>
              <h3 className="font-bold text-lg text-on-surface mb-4">Prolonger la licence</h3>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 block">Jours à ajouter</label>
              <div className="flex gap-2 mb-2 flex-wrap">{[{d:30,l:'1 mois'},{d:90,l:'3 mois'},{d:180,l:'6 mois'},{d:365,l:'1 an'},{d:730,l:'2 ans'}].map(({d,l}) => (<button key={d} onClick={() => setExtendDays(d)} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${extendDays === d ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>{l}</button>))}</div>
              <p className="text-xs text-on-surface-variant mb-4">Expiration : <strong>{new Date(Math.max(new Date(licenseModal?.license?.expiresAt || Date.now()), new Date()).getTime() + extendDays * 86400000).toLocaleDateString('fr-FR')}</strong></p>
              <div className="flex gap-3"><button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button><button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold">Prolonger</button></div>
            </>)}
            {licenseModal.action === 'new' && (<>
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4"><Icon name="add_card" size={24} className="text-primary" /></div>
              <h3 className="font-bold text-lg text-on-surface mb-4">Nouvelle licence</h3>
              {licenseModal.license?.orgId
                ? <p className="text-xs text-on-surface-variant mb-3">Org : <strong>{organizations.find(o => o.id === licenseModal.license?.orgId)?.name || licenseModal.license?.orgId}</strong></p>
                : <div className="mb-3"><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Organisation *</label><select value={newLicenseOrgId} onChange={e => setNewLicenseOrgId(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container text-sm focus:outline-none text-on-surface"><option value="">— Choisir —</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 block">Plan</label>
              <div className="flex gap-2 mb-5">{Object.keys(PLANS).map(p => (<button key={p} onClick={() => setNewLicensePlan(p)} className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${newLicensePlan === p ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{getPlan(p).name}</button>))}</div>
              <div className="flex gap-3"><button onClick={() => setLicenseModal(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button><button onClick={handleLicenseAction} className="flex-1 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold">Créer</button></div>
            </>)}
          </div>
        </div>
      )}

      {/* ── Create Org Modal ── */}
      {showCreateOrg && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg flex items-center gap-2"><Icon name="add_business" size={20} className="text-primary" /> Nouvelle organisation</h3>
              <button onClick={() => setShowCreateOrg(false)}><Icon name="close" size={20} className="text-on-surface-variant" /></button>
            </div>
            {/* Essai banner */}
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Icon name="hourglass_top" size={20} className="text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">Mode Essai</p>
                <p className="text-xs text-amber-700">Le plan payant sera choisi lors de la conversion de l'essai.</p>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom de l'organisation *</label>
              <input value={createOrgForm.orgName} onChange={e => setCreateOrgForm(f => ({ ...f, orgName: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm" placeholder="Ex: Agence Cocody" />
            </div>
            {/* Trial duration */}
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 block">Durée de l'essai</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {[7, 14, 30, 60, 90].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCreateOrgForm(f => ({ ...f, trialDays: d }))}
                    className={`px-3 py-1.5 rounded-xl text-sm font-bold transition-colors ${
                      createOrgForm.trialDays === d
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {d}j
                  </button>
                ))}
                <div className="flex items-center gap-1.5 ml-1">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={[7,14,30,60,90].includes(createOrgForm.trialDays) ? '' : createOrgForm.trialDays}
                    onChange={e => setCreateOrgForm(f => ({ ...f, trialDays: Math.max(1, Math.min(365, Number(e.target.value) || 7)) }))}
                    placeholder="Autre"
                    className="w-20 px-2 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
                  />
                  <span className="text-xs text-on-surface-variant">jours</span>
                </div>
              </div>
              <p className="text-xs text-on-surface-variant">Durée sélectionnée : <strong>{createOrgForm.trialDays} jour{createOrgForm.trialDays > 1 ? 's' : ''}</strong></p>
            </div>

            <div className="border-t border-outline-variant/20 pt-3">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide mb-3">Compte administrateur</p>
              <div className="flex flex-col gap-3">
                <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Nom complet *</label><input value={createOrgForm.adminName} onChange={e => setCreateOrgForm(f => ({ ...f, adminName: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm" placeholder="Prénom Nom" /></div>
                <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Email *</label><input type="email" value={createOrgForm.adminEmail} onChange={e => setCreateOrgForm(f => ({ ...f, adminEmail: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm" placeholder="admin@agence.ci" /></div>
                <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 block">Mot de passe * (min. 8 car.)</label><input type="password" value={createOrgForm.adminPassword} onChange={e => setCreateOrgForm(f => ({ ...f, adminPassword: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm" placeholder="••••••••" /></div>
              </div>
            </div>
            <p className="text-xs text-on-surface-variant bg-surface-container rounded-xl px-3 py-2">
              Licence <strong>Essai {createOrgForm.trialDays} jour{createOrgForm.trialDays > 1 ? 's' : ''}</strong> générée automatiquement. Convertissez en actif depuis l'onglet Essais.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowCreateOrg(false)} className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">Annuler</button>
              <button onClick={handleCreateOrg} disabled={createOrgLoading} className="flex-1 py-2.5 text-sm font-bold text-on-primary bg-primary rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {createOrgLoading ? <><Icon name="progress_activity" size={16} className="animate-spin" />Création…</> : <><Icon name="add_business" size={16} />Créer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Convert trial → paid plan modal ── */}
      {convertModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5 my-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg flex items-center gap-2">
                <Icon name="verified" size={20} className="text-green-600" /> Convertir l'essai en licence
              </h3>
              <button onClick={() => setConvertModal(null)}><Icon name="close" size={20} className="text-on-surface-variant" /></button>
            </div>

            <div className="p-3 bg-surface-container rounded-xl text-sm text-on-surface-variant flex items-center gap-2">
              <Icon name="business" size={16} className="flex-shrink-0" />
              <span><strong className="text-on-surface">{organizations.find(o => o.id === convertModal.license?.orgId)?.name || convertModal.license?.orgId}</strong> — choisissez le plan payant</span>
            </div>

            {/* Plan cards */}
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3 block">Plan</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {['standard', 'pro', 'enterprise'].map(p => {
                  const plan = getPlan(p);
                  const selected = convertPlan === p;
                  return (
                    <button key={p} onClick={() => setConvertPlan(p)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${selected ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-primary/40'}`}>
                      <div className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit mb-2 ${plan.badgeColor}`}>{plan.name}</div>
                      <p className="font-black text-on-surface text-base">
                        {plan.monthlyPrice ? `${plan.monthlyPrice.toLocaleString('fr-CI')} FCFA` : 'Sur devis'}
                        <span className="text-xs font-normal text-on-surface-variant">/mois</span>
                      </p>
                      <p className="text-xs text-on-surface-variant mt-1">{plan.description}</p>
                      <ul className="mt-2 flex flex-col gap-0.5">
                        <li className="text-xs text-on-surface-variant flex items-center gap-1"><Icon name="person" size={11}/>{plan.maxUsers === Infinity ? 'Illimité' : plan.maxUsers} utilisateurs</li>
                        <li className="text-xs text-on-surface-variant flex items-center gap-1"><Icon name="home" size={11}/>{plan.maxProperties === Infinity ? 'Illimité' : plan.maxProperties} biens</li>
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2 block">Durée</label>
              <div className="flex gap-2 flex-wrap">
                {[{ d: 30, label: '1 mois' }, { d: 90, label: '3 mois' }, { d: 180, label: '6 mois' }, { d: 365, label: '1 an' }, { d: 730, label: '2 ans' }].map(({ d, label }) => (
                  <button key={d} onClick={() => setConvertDuration(d)}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${convertDuration === d ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-on-surface-variant mt-2">
                Expiration : <strong>{new Date(Date.now() + convertDuration * 86400000).toLocaleDateString('fr-FR')}</strong>
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setConvertModal(null)} className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">Annuler</button>
              <button onClick={handleExecuteConvert} className="flex-1 py-2.5 text-sm font-bold text-on-primary bg-green-600 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                <Icon name="verified" size={16} /> Activer — {getPlan(convertPlan).name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change plan modal ── */}
      {changePlanModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface text-lg flex items-center gap-2">
                <Icon name="swap_horiz" size={20} className="text-indigo-600" /> Changer le plan
              </h3>
              <button onClick={() => setChangePlanModal(null)}><Icon name="close" size={20} className="text-on-surface-variant" /></button>
            </div>
            <div className="p-3 bg-surface-container rounded-xl text-sm text-on-surface-variant flex items-center gap-2">
              <Icon name="business" size={16} className="flex-shrink-0" />
              <span>Organisation : <strong className="text-on-surface">{changePlanModal.org?.name}</strong></span>
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3 block">Nouveau plan</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {['standard', 'pro', 'enterprise'].map(p => {
                  const plan = getPlan(p);
                  const selected = changePlanValue === p;
                  return (
                    <button key={p} onClick={() => setChangePlanValue(p)}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${selected ? 'border-indigo-500 bg-indigo-50' : 'border-outline-variant/30 hover:border-indigo-300'}`}>
                      <div className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit mb-2 ${plan.badgeColor}`}>{plan.name}</div>
                      <p className="font-black text-on-surface text-base">
                        {plan.monthlyPrice ? `${plan.monthlyPrice.toLocaleString('fr-CI')} FCFA` : 'Sur devis'}
                        <span className="text-xs font-normal text-on-surface-variant">/mois</span>
                      </p>
                      <ul className="mt-2 flex flex-col gap-0.5">
                        <li className="text-xs text-on-surface-variant flex items-center gap-1"><Icon name="person" size={11}/>{plan.maxUsers === Infinity ? 'Illimité' : plan.maxUsers} utilisateurs</li>
                        <li className="text-xs text-on-surface-variant flex items-center gap-1"><Icon name="home" size={11}/>{plan.maxProperties === Infinity ? 'Illimité' : plan.maxProperties} biens</li>
                        <li className="text-xs text-on-surface-variant flex items-center gap-1"><Icon name="group" size={11}/>{plan.maxTenants === Infinity ? 'Illimité' : plan.maxTenants} locataires</li>
                      </ul>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setChangePlanModal(null)} className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">Annuler</button>
              <button onClick={handleExecuteChangePlan} className="flex-1 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                <Icon name="check_circle" size={16} /> Appliquer — {getPlan(changePlanValue).name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Org delete confirm ── */}
      {orgDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-error/10 rounded-xl flex items-center justify-center mb-4"><Icon name="delete" size={24} className="text-error" /></div>
            <h3 className="font-bold text-lg text-on-surface mb-2">Supprimer l'organisation ?</h3>
            <p className="text-sm text-on-surface-variant mb-5"><strong>{orgDeleteConfirm.name}</strong> et sa licence seront supprimées définitivement.</p>
            <div className="flex gap-3">
              <button onClick={() => setOrgDeleteConfirm(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button>
              <button onClick={handleDeleteOrg} className="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-bold">Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restore confirm modal ── */}
      {restoreConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4 mx-auto"><Icon name="restore" size={24} className="text-amber-700" /></div>
            <h3 className="font-bold text-lg text-on-surface mb-1 text-center">Restaurer ce backup ?</h3>
            <p className="text-xs font-mono text-on-surface-variant text-center mb-1">{restoreConfirm.id}</p>
            <p className="text-xs text-on-surface-variant text-center mb-4">{restoreConfirm.createdAt ? new Date(restoreConfirm.createdAt).toLocaleString('fr-FR') : ''} · {restoreConfirm.totalDocs || 0} docs</p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 mb-4 flex items-start gap-2">
              <Icon name="warning" size={14} className="flex-shrink-0 mt-0.5" />
              <span>Les données actuelles seront <strong>remplacées</strong> par celles du backup. Cette action est irréversible (sauf si un nouveau backup existe).</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRestoreConfirm(null)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button>
              <button onClick={() => executeRestore(restoreConfirm.id)} disabled={restoreLoading}
                className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {restoreLoading ? <><Icon name="progress_activity" size={16} className="animate-spin" />Restauration…</> : 'Restaurer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Platform Reset modal (3 steps) ── */}
      {resetModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6">

            {resetStep === 1 && (
              <>
                <div className="w-16 h-16 bg-error/10 rounded-2xl flex items-center justify-center mb-4 mx-auto"><Icon name="warning" size={32} className="text-error" /></div>
                <h3 className="font-black text-xl text-on-surface text-center mb-2">Reset Global Plateforme</h3>
                <p className="text-sm text-on-surface-variant text-center mb-5">Cette action <strong className="text-error">supprimera TOUTES les données</strong> de la plateforme et est irréversible.</p>
                <div className="bg-error/5 border border-error/20 rounded-xl p-4 text-xs text-error mb-5">
                  <p className="font-bold mb-2">Données supprimées :</p>
                  <ul className="list-disc list-inside space-y-0.5 text-error/80">
                    <li>Toutes les organisations (sauf org par défaut)</li>
                    <li>Tous les utilisateurs (sauf Super Admin + admin par défaut)</li>
                    <li>Toutes les licences</li>
                    <li>Tous les biens, contrats, paiements, locataires</li>
                    <li>Tous les tickets, inspections, conversations</li>
                    <li>Tous les logs d'activité</li>
                  </ul>
                </div>
                <p className="text-xs text-center text-on-surface-variant mb-5">
                  <Icon name="backup" size={14} className="inline mr-1 text-primary" />Un backup automatique sera créé avant la suppression.
                </p>
                <div className="flex gap-3">
                  <button onClick={closeReset} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Annuler</button>
                  <button onClick={() => setResetStep(2)} className="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-bold">Continuer →</button>
                </div>
              </>
            )}

            {resetStep === 2 && (
              <>
                <h3 className="font-black text-lg text-on-surface mb-1">Confirmation — Étape 2/3</h3>
                <p className="text-sm text-on-surface-variant mb-4">Tapez <strong className="text-error font-mono bg-error/10 px-1 rounded">RESET CONFIRM</strong> pour continuer :</p>
                <input
                  value={resetConfirmText}
                  onChange={e => setResetConfirmText(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-error/40 text-on-surface text-sm font-mono mb-5"
                  placeholder="RESET CONFIRM"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button onClick={() => setResetStep(1)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Retour</button>
                  <button onClick={() => setResetStep(3)} disabled={resetConfirmText !== 'RESET CONFIRM'} className="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-bold disabled:opacity-40">Suivant →</button>
                </div>
              </>
            )}

            {resetStep === 3 && (
              <>
                <h3 className="font-black text-lg text-on-surface mb-1">Vérification — Étape 3/3</h3>
                <p className="text-sm text-on-surface-variant mb-4">Entrez votre mot de passe <strong>SUPER_ADMIN</strong> pour exécuter le reset :</p>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-error/40 text-on-surface text-sm mb-5"
                  placeholder="••••••••"
                  autoFocus
                />
                <div className="flex gap-3">
                  <button onClick={() => setResetStep(2)} className="flex-1 py-2.5 bg-surface-container text-on-surface-variant rounded-xl text-sm font-semibold">Retour</button>
                  <button onClick={handlePlatformReset} disabled={resetLoading || !resetPassword}
                    className="flex-1 py-2.5 bg-error text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                    {resetLoading ? <><Icon name="progress_activity" size={16} className="animate-spin" />Exécution…</> : <><Icon name="delete_sweep" size={16} />Exécuter le reset</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── PlatformTab ───────────────────────────────────────────────────────────── */
const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm';

function Toggle({ checked, onChange }) {
  return (
    <button onClick={onChange} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-outline-variant'}`}>
      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-1'}`} />
    </button>
  );
}

function PlatformTab({ state, dispatch, showToast, onResetClick }) {
  const sys = state.systemSettings || {};
  const [section, setSection] = useState('smtp');
  const [showDanger, setShowDanger] = useState(false);
  const [smtp, setSmtp] = useState({
    host: sys.smtp?.host || '', port: sys.smtp?.port || 587,
    user: sys.smtp?.user || '', password: sys.smtp?.password || '',
    from: sys.smtp?.from || '', encryption: sys.smtp?.encryption || 'TLS',
    enabled: sys.smtp?.enabled || false,
  });
  const [testEmail, setTestEmail] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [mktPhone,    setMktPhone]    = useState(sys.paymentPhone  || '');
  const [imgbbKey,    setImgbbKey]    = useState(sys.imgbbApiKey   || '');
  const [imgbbHidden, setImgbbHidden] = useState(true);

  const saveSmtp = () => { dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { smtp } }); showToast('Config SMTP enregistrée'); };
  const saveMkt  = () => { dispatch({ type: 'UPDATE_SYSTEM_SETTINGS', payload: { paymentPhone: mktPhone.trim(), imgbbApiKey: imgbbKey.trim() } }); showToast('Paramètres Marketplace enregistrés'); };

  const handleTestEmail = async () => {
    if (!testEmail.trim()) { showToast('Entrez un email de destination'); return; }
    setTestLoading(true); setTestResult(null);
    const { ok } = await sendEmail({ to: testEmail.trim(), subject: 'Test SMTP — Minsouah', html: `<p>Bonjour,</p><p>La configuration SMTP de <strong>Minsouah</strong> fonctionne correctement.</p>` });
    setTestResult(ok ? 'ok' : 'error');
    setTestLoading(false);
    showToast(ok ? 'Email de test envoyé !' : 'Erreur — vérifiez la configuration SMTP');
  };

  const SECTIONS = [
    { key: 'smtp',        label: 'SMTP / Email', icon: 'email' },
    { key: 'marketplace', label: 'Marketplace',  icon: 'storefront' },
    { key: 'monitoring',  label: 'Monitoring',   icon: 'monitor_heart' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${section === s.key ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'}`}>
            <Icon name={s.icon} size={15} />{s.label}
          </button>
        ))}
      </div>

      {section === 'smtp' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="email" filled />Configuration SMTP</h3>
              <p className="text-xs text-on-surface-variant mt-1">Emails via collection <code className="bg-surface-container px-1 rounded">mail</code> Firestore — extension <strong>Trigger Email</strong>.</p>
            </div>
            <Toggle checked={smtp.enabled} onChange={() => setSmtp(s => ({ ...s, enabled: !s.enabled }))} />
          </div>
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-on-surface-variant">
            <p className="font-semibold text-primary mb-1 flex items-center gap-1"><Icon name="tips_and_updates" size={14} />Prérequis : Firebase Trigger Email Extension</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Firebase Console → <strong className="text-on-surface">Extensions</strong> → « Trigger Email »</li>
              <li>Configurer l'URI SMTP (ex: <code>smtps://user:pass@smtp.sendgrid.net:465</code>)</li>
              <li>Définir la collection source : <code>mail</code></li>
            </ol>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${!smtp.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Serveur SMTP</label><input value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} className={inputCls} placeholder="smtp.sendgrid.net" /></div>
            <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Port</label><select value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: Number(e.target.value) }))} className={inputCls}><option value={587}>587 (TLS)</option><option value={465}>465 (SSL)</option><option value={25}>25</option></select></div>
            <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Email expéditeur</label><input type="email" value={smtp.from} onChange={e => setSmtp(s => ({ ...s, from: e.target.value }))} className={inputCls} placeholder="noreply@minsouah.ci" /></div>
            <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Chiffrement</label><select value={smtp.encryption} onChange={e => setSmtp(s => ({ ...s, encryption: e.target.value }))} className={inputCls}><option value="TLS">TLS</option><option value="SSL">SSL</option><option value="NONE">Aucun</option></select></div>
            <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Utilisateur SMTP</label><input value={smtp.user} onChange={e => setSmtp(s => ({ ...s, user: e.target.value }))} className={inputCls} placeholder="apikey" /></div>
            <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Mot de passe / API Key</label><input type="password" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} className={inputCls} placeholder="••••••••" /></div>
          </div>
          <button onClick={saveSmtp} className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors w-fit"><Icon name="save" size={16} />Enregistrer</button>
          <div className="border-t border-outline-variant/20 pt-5">
            <p className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2"><Icon name="send" size={16} className="text-primary" />Test email (réel)</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1"><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Destination</label><input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} className={inputCls} placeholder="test@example.com" /></div>
              <button onClick={handleTestEmail} disabled={testLoading || !testEmail} className="px-5 py-2.5 bg-surface-container border border-outline-variant/30 text-on-surface rounded-xl text-sm font-semibold hover:bg-surface-container-high flex items-center gap-2 transition-colors disabled:opacity-50 flex-shrink-0">
                {testLoading ? <><Icon name="progress_activity" size={16} className="animate-spin" />Envoi…</> : <><Icon name="send" size={16} />Tester</>}
              </button>
            </div>
            {testResult === 'ok' && <div className="mt-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm"><Icon name="check_circle" size={16} />Email enregistré dans la queue Firestore.</div>}
            {testResult === 'error' && <div className="mt-3 flex items-center gap-2 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm"><Icon name="error" size={16} />Échec — vérifiez que l'extension Trigger Email est installée.</div>}
          </div>
        </div>
      )}

      {section === 'marketplace' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-6">
          <div>
            <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="storefront" filled />Paramètres Marketplace</h3>
            <p className="text-xs text-on-surface-variant mt-1">Numéro de paiement mobile money et hébergement des photos d'annonces.</p>
          </div>

          {/* Payment phone */}
          <div>
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">
              Numéro Mobile Money (paiement déblocage contact)
            </label>
            <input value={mktPhone} onChange={e => setMktPhone(e.target.value)}
              placeholder="+225 07 00 00 00 00"
              className={inputCls} />
            <p className="text-[10px] text-on-surface-variant mt-1">
              Ce numéro s'affiche dans la fenêtre de paiement quand un visiteur veut débloquer le contact d'une annonce.
            </p>
          </div>

          {/* imgbb API key */}
          <div>
            <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">
              Clé API imgbb.com (upload photos d'annonces)
            </label>
            <div className="flex gap-2">
              <input value={imgbbKey} onChange={e => setImgbbKey(e.target.value)}
                type={imgbbHidden ? 'password' : 'text'}
                placeholder="Votre clé API imgbb (ex: abc123def456…)"
                className={`flex-1 ${inputCls}`} />
              <button onClick={() => setImgbbHidden(v => !v)}
                className="px-3 py-2 border border-outline-variant/30 rounded-xl text-on-surface-variant hover:text-on-surface">
                <Icon name={imgbbHidden ? 'visibility' : 'visibility_off'} size={16} />
              </button>
            </div>
            <div className="mt-2 bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-on-surface-variant">
              <p className="font-semibold text-primary mb-1 flex items-center gap-1"><Icon name="tips_and_updates" size={13} />Comment obtenir une clé imgbb gratuite</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Allez sur <strong>imgbb.com</strong> → créez un compte gratuit</li>
                <li>Menu utilisateur → <strong>API</strong></li>
                <li>Copiez votre clé API et collez-la ci-dessus</li>
              </ol>
              <p className="mt-1.5">Une fois configurée, le bouton "Fichier" dans l'éditeur d'annonces sera actif et les photos s'uploadent automatiquement.</p>
            </div>
          </div>

          <button onClick={saveMkt}
            className="px-5 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 flex items-center gap-2 transition-colors w-fit">
            <Icon name="save" size={16} />Enregistrer
          </button>
        </div>
      )}

      {section === 'monitoring' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-6 flex flex-col gap-4">
          <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="monitor_heart" filled />Monitoring Plateforme</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Organisations actives', value: (state.organizations || []).filter(o => o.active !== false).length, icon: 'corporate_fare', color: 'text-primary bg-primary/10' },
              { label: 'Utilisateurs totaux',   value: (state.users || []).filter(u => u.role !== 'SUPER_ADMIN').length,   icon: 'group',          color: 'text-secondary bg-secondary/10' },
              { label: 'Biens totaux',          value: (state.properties || []).length,                                     icon: 'apartment',      color: 'text-tertiary bg-tertiary/10' },
              { label: 'Contrats actifs',       value: (state.contracts || []).filter(c => c.status === 'Actif').length,    icon: 'contract',       color: 'text-green-600 bg-green-50' },
              { label: 'Paiements en attente',  value: (state.payments || []).filter(p => p.status !== 'Payé').length,      icon: 'pending',        color: 'text-amber-600 bg-amber-50' },
              { label: 'Tickets ouverts',       value: (state.tickets || []).filter(t => t.status !== 'Fermé' && t.status !== 'Résolu').length, icon: 'engineering', color: 'text-error bg-error/10' },
            ].map(s => (
              <div key={s.label} className={`p-4 rounded-xl ${s.color.split(' ')[1]} flex items-center gap-3`}>
                <Icon name={s.icon} size={22} className={s.color.split(' ')[0]} />
                <div><p className={`font-black text-xl ${s.color.split(' ')[0]}`}>{s.value}</p><p className="text-xs text-on-surface-variant">{s.label}</p></div>
              </div>
            ))}
          </div>
          <div className="mt-2 bg-surface-container-low rounded-xl p-4">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Dernières connexions</p>
            {(state.activityLog || []).filter(e => e.action === 'LOGIN' || e.action === 'LOGIN_FAIL').slice(0, 8).length === 0
              ? <p className="text-xs text-on-surface-variant">Aucune activité.</p>
              : (state.activityLog || []).filter(e => e.action === 'LOGIN' || e.action === 'LOGIN_FAIL').slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-outline-variant/10 last:border-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${e.action === 'LOGIN' ? 'bg-green-100 text-green-600' : 'bg-error/10 text-error'}`}><Icon name={e.action === 'LOGIN' ? 'login' : 'block'} size={14} /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium text-on-surface truncate">{e.userEmail || e.details}</p><p className="text-xs text-on-surface-variant">{e.action === 'LOGIN' ? 'Connexion' : 'Échec'}</p></div>
                  <p className="text-xs text-on-surface-variant flex-shrink-0">{e.timestamp ? new Date(e.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Danger Zone ── */}
      <div className="bg-surface rounded-2xl border border-error/30 p-5">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-bold text-error flex items-center gap-2"><Icon name="dangerous" size={18} />Zone de danger</h4>
          <button onClick={() => setShowDanger(v => !v)}
            className="text-xs text-error border border-error/30 px-3 py-1.5 rounded-lg hover:bg-error/10 transition-colors font-semibold">
            {showDanger ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant mb-4">Actions irréversibles — SUPER_ADMIN uniquement</p>

        {showDanger && (
          <div className="bg-error/5 border border-error/20 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-error/10 rounded-xl flex items-center justify-center flex-shrink-0"><Icon name="delete_sweep" size={20} className="text-error" /></div>
              <div>
                <p className="font-bold text-on-surface">Réinitialisation complète de la plateforme</p>
                <p className="text-sm text-on-surface-variant mt-1">
                  Supprime toutes les organisations, utilisateurs (hors Super Admin), licences, biens, contrats, paiements et logs.
                  Un backup Firestore est créé automatiquement avant la suppression.
                </p>
              </div>
            </div>
            <button onClick={onResetClick}
              className="w-fit px-5 py-2.5 bg-error text-white rounded-xl text-sm font-bold hover:bg-error/90 flex items-center gap-2 transition-colors">
              <Icon name="delete_sweep" size={16} /> Réinitialiser la plateforme
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
