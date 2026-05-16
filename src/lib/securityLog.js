import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';

// Security action constants
export const SEC = {
  LOGIN_SUCCESS:      'LOGIN_SUCCESS',
  LOGIN_FAIL:         'LOGIN_FAIL',
  EMAIL_UNVERIFIED:   'EMAIL_UNVERIFIED',
  LOGOUT:             'LOGOUT',
  ORG_CREATED:        'ORG_CREATED',
  ORG_DELETED:        'ORG_DELETED',
  ORG_SUSPENDED:      'ORG_SUSPENDED',
  ORG_ACTIVATED:      'ORG_ACTIVATED',
  LIC_CREATED:        'LIC_CREATED',
  LIC_SUSPENDED:      'LIC_SUSPENDED',
  LIC_ACTIVATED:      'LIC_ACTIVATED',
  LIC_DELETED:        'LIC_DELETED',
  LIC_CONVERTED:      'LIC_CONVERTED',
  USER_CREATED:       'USER_CREATED',
  USER_DELETED:       'USER_DELETED',
  USER_SUSPENDED:     'USER_SUSPENDED',
  PLATFORM_RESET:     'PLATFORM_RESET',
  BACKUP_CREATED:     'BACKUP_CREATED',
  BACKUP_RESTORED:    'BACKUP_RESTORED',
  BACKUP_DELETED:     'BACKUP_DELETED',
  ACCESS_DENIED:      'ACCESS_DENIED',
  CROSS_ORG_ATTEMPT:  'CROSS_ORG_ATTEMPT',
  ADMIN_ACTION:       'ADMIN_ACTION',
};

// Severity levels for UI display
export const SEV = {
  [SEC.LOGIN_FAIL]:        'critical',
  [SEC.EMAIL_UNVERIFIED]:  'warning',
  [SEC.ORG_DELETED]:       'critical',
  [SEC.LIC_DELETED]:       'warning',
  [SEC.LIC_SUSPENDED]:     'warning',
  [SEC.USER_DELETED]:      'warning',
  [SEC.USER_SUSPENDED]:    'warning',
  [SEC.PLATFORM_RESET]:    'critical',
  [SEC.ACCESS_DENIED]:     'critical',
  [SEC.CROSS_ORG_ATTEMPT]: 'critical',
};

/**
 * Write an entry to workspaces/{ws}/security_logs.
 * Non-blocking — errors are swallowed so the main flow is never interrupted.
 */
export async function logSec({ action, userId, userEmail, role, target, details, orgId } = {}) {
  try {
    await addDoc(collection(db, 'workspaces', WS, 'security_logs'), {
      action:     action    ?? null,
      userId:     userId    ?? null,
      userEmail:  userEmail ?? null,
      role:       role      ?? null,
      target:     target    ?? null,
      details:    details   ?? null,
      orgId:      orgId     ?? null,
      severity:   SEV[action] ?? 'info',
      timestamp:  new Date().toISOString(),
      createdAt:  Date.now(),
    });
  } catch (err) {
    console.warn('[securityLog]', err?.message);
  }
}
