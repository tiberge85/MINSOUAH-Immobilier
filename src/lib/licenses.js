import { PLANS } from './planLimits';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const seg = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

export function generateLicenseKey() {
  return `LIC-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export function createLicensePayload({ orgId, plan = 'standard', trialDays }) {
  const planConfig = PLANS[plan] || PLANS.standard;
  const days = trialDays ?? planConfig.trialDays ?? 14;
  const now = new Date();
  const expires = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    key: generateLicenseKey(),
    orgId,
    plan,
    status: 'trial', // trial | active | expired | suspended
    createdAt: now.toISOString(),
    activatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    trialDays: days,
    notes: '',
  };
}

export function isLicenseValid(license) {
  if (!license) return false;
  if (license.status === 'suspended' || license.status === 'expired') return false;
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) return false;
  return ['trial', 'active'].includes(license.status);
}

export function getDaysRemaining(license) {
  if (!license?.expiresAt) return null;
  const diff = new Date(license.expiresAt) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function getLicenseStatusInfo(license) {
  if (!license) return { label: 'Aucune licence', color: 'bg-surface-container text-on-surface-variant', icon: 'block' };
  const days = getDaysRemaining(license);
  if (license.status === 'suspended') return { label: 'Suspendue', color: 'bg-error/10 text-error', icon: 'block' };
  if (!isLicenseValid(license)) return { label: 'Expirée', color: 'bg-error/10 text-error', icon: 'cancel' };
  if (license.status === 'trial') {
    if (days <= 3) return { label: `Essai · ${days}j restant(s)`, color: 'bg-red-100 text-red-700', icon: 'timer' };
    return { label: `Essai · ${days}j restants`, color: 'bg-amber-100 text-amber-700', icon: 'hourglass_top' };
  }
  if (days !== null && days <= 30) return { label: `Active · ${days}j restants`, color: 'bg-amber-100 text-amber-700', icon: 'schedule' };
  return { label: 'Active', color: 'bg-green-100 text-green-700', icon: 'verified' };
}
