/* ────────────────────────────────────────────────────────────────────────────
   Permissions — fine-grained per-module × per-action access control.

   A user's access is resolved in this order:
     1. SUPER_ADMIN / ORGANIZATION_ADMIN / ADMIN  → full access (bypass).
     2. If the user has an explicit `permissions` object → use it.
     3. Otherwise → fall back to role-based defaults (backward compatibility
        for accounts created before this system existed).

   `permissions` shape stored on the user document:
     { moduleKey: ['view', 'create', 'edit', 'delete'], ... }
   ──────────────────────────────────────────────────────────────────────────── */

// Roles that always have full access — they never need explicit permissions.
export const FULL_ACCESS_ROLES = ['SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'ADMIN'];

// The four actions, in display order.
export const ACTIONS = [
  { key: 'view',   label: 'Consulter' },
  { key: 'create', label: 'Créer' },
  { key: 'edit',   label: 'Modifier' },
  { key: 'delete', label: 'Supprimer' },
];

// Feature modules an agent can be granted access to.
// `path` is the route used for nav/redirect. `actions` = actions that make
// sense for this module (some modules are view-only).
export const MODULES = [
  { key: 'dashboard',    label: 'Tableau de bord', icon: 'dashboard',                path: '/',             actions: ['view'] },
  { key: 'assets',       label: 'Patrimoine',      icon: 'domain',                   path: '/assets',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'rental',       label: 'Gestion Locative', icon: 'contract',                path: '/rental',       actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'finance',      label: 'Finances',        icon: 'account_balance_wallet',   path: '/finance',      actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'payments',     label: 'Paiements',       icon: 'payments',                 path: '/payments',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'maintenance',  label: 'Maintenance',     icon: 'engineering',              path: '/maintenance',  actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'inspections',  label: 'États des lieux', icon: 'home_work',                path: '/inspections',  actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'calendar',     label: 'Calendrier',      icon: 'calendar_month',           path: '/calendar',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'insurance',    label: 'Assurances',      icon: 'verified_user',            path: '/insurance',    actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'referrers',    label: "Apporteurs d'affaire", icon: 'group_add',           path: '/referrers',    actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'prestataires', label: 'Prestataires',    icon: 'handyman',                 path: '/prestataires', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'inbox',        label: 'Messagerie',      icon: 'support_agent',            path: '/inbox',        actions: ['view'] },
  { key: 'portals',      label: 'Portails (locataires/propriétaires/concierge)', icon: 'people', path: null, actions: ['view'] },
  { key: 'settings',     label: 'Paramètres',      icon: 'settings',                 path: null,            actions: ['view'] },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map(m => [m.key, m]));

// Map a route path → module key (used to gate nav items / routes).
// Modules without a route (path === null, e.g. portals/settings) are excluded.
export const PATH_TO_MODULE = Object.fromEntries(
  MODULES.filter(m => m.path).map(m => [m.path, m.key])
);

/* ── Role-based defaults (reproduce the pre-permissions behaviour) ──────────── */

// Grant every action of every module.
export function fullPermissions() {
  const out = {};
  for (const m of MODULES) out[m.key] = [...m.actions];
  return out;
}

// Grant only view of the given module keys.
function viewOnly(keys) {
  const out = {};
  for (const k of keys) {
    const m = MODULE_BY_KEY[k];
    if (m) out[k] = ['view'];
  }
  return out;
}

// Grant view/create/edit (no delete) of the given module keys.
function manage(keys) {
  const out = {};
  for (const k of keys) {
    const m = MODULE_BY_KEY[k];
    if (!m) continue;
    out[k] = m.actions.filter(a => a !== 'delete');
  }
  return out;
}

export function defaultPermissionsForRole(role) {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ORGANIZATION_ADMIN':
    case 'ADMIN':
    case 'AGENT':
    case 'MANAGER':
      // Full access — same as today (AGENT saw everything).
      return fullPermissions();
    case 'CONCIERGE':
      return {
        ...viewOnly(['assets', 'rental', 'inbox']),
        ...manage(['maintenance', 'inspections']),
      };
    case 'TECHNICIAN':
      return {
        ...manage(['maintenance']),
        ...viewOnly(['prestataires', 'inbox']),
      };
    case 'ACCOUNTANT':
      return {
        ...manage(['payments']),
        ...viewOnly(['finance', 'calendar', 'inbox']),
      };
    default:
      return {};
  }
}

/* ── Core check ─────────────────────────────────────────────────────────────── */

/** Return the effective permissions object for a user. */
export function effectivePermissions(user) {
  if (!user) return {};
  if (FULL_ACCESS_ROLES.includes(user.role)) return fullPermissions();
  const perms = user.permissions;
  // An EXPLICIT permissions object (even empty {}) is authoritative — an admin
  // who unchecks every box means "no access", not "fall back to role default".
  // Only a missing/null field falls back to defaults (legacy accounts).
  if (perms && typeof perms === 'object') return perms;
  return defaultPermissionsForRole(user.role);
}

/**
 * Can this user perform `action` on `moduleKey`?
 * @param {object} user   the current user (needs `role`, optional `permissions`)
 * @param {string} moduleKey  one of MODULES[].key
 * @param {string} action  'view' | 'create' | 'edit' | 'delete'  (default 'view')
 */
export function can(user, moduleKey, action = 'view') {
  if (!user) return false;
  if (FULL_ACCESS_ROLES.includes(user.role)) return true;
  const perms = effectivePermissions(user);
  const acts = perms[moduleKey];
  return Array.isArray(acts) && acts.includes(action);
}

/** Convenience: does the user have view access to a module? */
export function canView(user, moduleKey) {
  return can(user, moduleKey, 'view');
}

/**
 * First route path the user is allowed to open — used as a safe landing/redirect
 * so a restricted agent never lands on a page they can't see. Falls back to
 * /settings (always accessible) when nothing is viewable.
 */
export function firstAllowedPath(user) {
  for (const m of MODULES) {
    if (m.path && can(user, m.key, 'view')) return m.path;
  }
  return '/settings';
}
