/* ────────────────────────────────────────────────────────────────────────────
   MINSOUAH RECONNAISSANCE — Moteur d'évaluation des distinctions locataires.
   « Votre sérieux mérite d'être reconnu. »

   Fonction PURE et EXPLICABLE : pour un locataire et une année, on calcule à
   partir des données financières réelles (paiements validés uniquement) les
   statistiques de l'exercice, puis on attribue AU PLUS UNE distinction (la plus
   élevée) selon une hiérarchie non contradictoire et des CRITÈRES PARAMÉTRABLES
   renseignés par l'administrateur (page Reconnaissance → Paramètres des critères).

   Règles de calcul (cahier des charges) :
     • Seuls les paiements « Payé » (validés) comptent ; « Annulé » exclus.
     • Un paiement après l'échéance = retard, même régularisé.
     • Un paiement partiel ≠ loyer réglé.
     • On ne pénalise pas une échéance non encore exigible.
     • Ancienneté calculée depuis le début du contrat (jamais inventée).
   ──────────────────────────────────────────────────────────────────────────── */

export const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Distinctions, de la plus élevée à la plus basse (ordre = priorité d'attribution).
export const AWARD_DEFS = [
  { key: 'PARTENAIRE', label: 'Partenaire de confiance', template: 'Premium', color: '#7c3aed', emoji: '🏆' },
  { key: 'EXCELLENCE', label: "Locataire d'excellence", template: 'Or', color: '#b8860b', emoji: '🥇' },
  { key: 'EXEMPLAIRE', label: 'Locataire exemplaire', template: 'Bleu', color: '#1d4ed8', emoji: '🎖️' },
  { key: 'FIDELE', label: 'Locataire fidèle', template: 'Fidélité', color: '#0f766e', emoji: '💠' },
  { key: 'REGULIER', label: 'Locataire régulier', template: 'Vert', color: '#15803d', emoji: '✅' },
];
export const AWARD_BY_KEY = Object.fromEntries(AWARD_DEFS.map(a => [a.key, a]));

// Ancien format (compatibilité) — toujours exporté.
export const DEFAULT_RULES = { fideleYears: 2, partenaireYears: 4, regularMaxLate: 2 };

/* Critères paramétrables PAR distinction (valeurs par défaut).
   Chaque champ est réglable dans l'app :
     enabled         : distinction activée (sinon jamais attribuée)
     minYears        : ancienneté minimale (années de présence)
     maxLate         : nombre de retards (loyers payés après échéance) tolérés
     maxPartial      : nombre de paiements partiels tolérés
     maxUnpaid       : nombre d'impayés tolérés
     requireFullYear : exige 12 mois complets, tous payés à temps
     requireSolde    : exige une année entièrement soldée (aucun reste dû)
     noUnresolved    : exige aucun impayé/retard résiduel dans l'historique  */
export const DEFAULT_AWARD_RULES = {
  PARTENAIRE: { enabled: true, minYears: 4, maxLate: 0,  maxPartial: 0, maxUnpaid: 0, requireFullYear: false, requireSolde: true, noUnresolved: true },
  EXCELLENCE: { enabled: true, minYears: 0, maxLate: 0,  maxPartial: 0, maxUnpaid: 0, requireFullYear: true,  requireSolde: true, noUnresolved: false },
  EXEMPLAIRE: { enabled: true, minYears: 0, maxLate: 0,  maxPartial: 0, maxUnpaid: 0, requireFullYear: false, requireSolde: true, noUnresolved: false },
  FIDELE:     { enabled: true, minYears: 2, maxLate: 99, maxPartial: 0, maxUnpaid: 0, requireFullYear: false, requireSolde: true, noUnresolved: false },
  REGULIER:   { enabled: true, minYears: 0, maxLate: 2,  maxPartial: 0, maxUnpaid: 0, requireFullYear: false, requireSolde: true, noUnresolved: false },
};

export const AWARD_RULE_FIELDS = [
  { key: 'enabled',         label: 'Distinction activée',            type: 'bool' },
  { key: 'minYears',        label: 'Ancienneté minimale (années)',    type: 'num' },
  { key: 'maxLate',         label: 'Retards tolérés',                 type: 'num' },
  { key: 'maxPartial',      label: 'Paiements partiels tolérés',      type: 'num' },
  { key: 'maxUnpaid',       label: 'Impayés tolérés',                 type: 'num' },
  { key: 'requireFullYear', label: 'Exiger 12 mois complets',         type: 'bool' },
  { key: 'requireSolde',    label: 'Exiger année soldée',             type: 'bool' },
  { key: 'noUnresolved',    label: 'Aucun impayé résiduel (historique)', type: 'bool' },
];

/** Normalise n'importe quelle entrée (nouveau format par distinction, ancien
 *  format plat, ou vide) vers un jeu de critères complet par distinction. */
export function resolveAwardRules(rules) {
  const out = {};
  for (const k of Object.keys(DEFAULT_AWARD_RULES)) out[k] = { ...DEFAULT_AWARD_RULES[k] };
  if (!rules) return out;
  // Nouveau format : objet avec des clés de distinction.
  if (AWARD_DEFS.some(d => rules[d.key])) {
    for (const k of Object.keys(out)) if (rules[k]) out[k] = { ...out[k], ...rules[k] };
    return out;
  }
  // Ancien format plat → on mappe sur les champs correspondants.
  const legacy = { ...DEFAULT_RULES, ...rules };
  if (legacy.partenaireYears != null) out.PARTENAIRE.minYears = Number(legacy.partenaireYears);
  if (legacy.fideleYears != null) out.FIDELE.minYears = Number(legacy.fideleYears);
  if (legacy.regularMaxLate != null) out.REGULIER.maxLate = Number(legacy.regularMaxLate);
  return out;
}

const norm = (s) => (s || '').toString().toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nameMatch = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return false; if (a === b) return true; const s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a; return s.length >= 4 && l.includes(s); };
const parseDate = (v) => { if (!v) return null; if (v instanceof Date) return isNaN(v) ? null : v; const s = String(v).trim(); const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); if (m) { let [, d, mo, y] = m; if (y.length === 2) y = '20' + y; const dt = new Date(+y, +mo - 1, +d); return isNaN(dt) ? null : dt; } const dt = new Date(s); return isNaN(dt) ? null : dt; };
const monthLabel = (m, y) => `${MONTHS_FR[m]} ${y}`;

/** Contrats d'un locataire dans le périmètre fourni (par id ou par nom). */
function contractsOfTenant(tenant, contracts) {
  return (contracts || []).filter(c =>
    (c.tenantId != null && String(c.tenantId) === String(tenant.id)) || nameMatch(c.tenant, tenant.name));
}

/** Paiements d'un locataire (par id ou par nom), hors annulés. */
function paymentsOfTenant(tenant, payments) {
  return (payments || []).filter(p => p.status !== 'Annulé' &&
    ((p.tenantId != null && String(p.tenantId) === String(tenant.id)) || nameMatch(p.tenantName, tenant.name)));
}

/**
 * Évalue un locataire pour une année.
 * @param {object} rules  Critères paramétrables (par distinction ou ancien format plat).
 */
export function evaluateTenantYear({ tenant, contracts, payments, year, rules, now = new Date() }) {
  const AR = resolveAwardRules(rules);
  const myContracts = contractsOfTenant(tenant, contracts);
  const myPayments = paymentsOfTenant(tenant, payments);

  // Ancienneté : depuis le plus ancien début de contrat (ou date d'entrée locataire).
  const starts = myContracts.map(c => parseDate(c.startDate || c.since || c.createdAt)).filter(Boolean);
  const entry = parseDate(tenant.since) || parseDate(tenant.createdAt);
  if (entry) starts.push(entry);
  const firstStart = starts.length ? new Date(Math.min(...starts.map(d => d.getTime()))) : null;
  const refEnd = new Date(year, 11, 31);
  const anciennete = firstStart ? Math.max(0, Math.floor((refEnd - firstStart) / (365.25 * 24 * 3600 * 1000))) : 0;

  // Loyer de référence (contrat actif, sinon le plus récent).
  const activeC = myContracts.find(c => c.status === 'Actif' || c.status === 'Expirant') || myContracts[myContracts.length - 1];
  const rent = Number(activeC?.rent) || 0;

  // Fenêtre d'exigibilité dans l'année.
  const psd = parseDate(tenant.paymentStartDate) || firstStart;
  let startMonth = 0;
  if (psd && psd.getFullYear() === year) startMonth = psd.getMonth();
  else if (psd && psd.getFullYear() > year) startMonth = 12;
  let endMonth = (year === now.getFullYear()) ? now.getMonth() : 11;
  const resiliated = myContracts.some(c => c.status === 'Résilié');
  const depart = resiliated ? (parseDate(activeC?.endDate) || null) : null;
  if (depart && depart.getFullYear() === year) endMonth = Math.min(endMonth, depart.getMonth());
  else if (depart && depart.getFullYear() < year) endMonth = -1;

  const exigibleMonths = [];
  for (let m = startMonth; m <= endMonth; m++) exigibleMonths.push(m);

  // Analyse mois par mois.
  let nbPaid = 0, nbLate = 0, nbPartial = 0, nbUnpaid = 0, soldeDu = 0;
  const monthsDetail = exigibleMonths.map(m => {
    const label = monthLabel(m, year);
    const recs = myPayments.filter(p => (p.month || '').toString().toLowerCase().trim() === label.toLowerCase());
    const paidRecs = recs.filter(p => p.status === 'Payé');
    const paidAmount = paidRecs.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const hasPaid = paidRecs.length > 0;
    const dueDate = parseDate(paidRecs[0]?.dueDate) || new Date(year, m, 5);
    const paidDate = parseDate(paidRecs[0]?.paidDate);
    const late = hasPaid && paidDate && dueDate && paidDate > dueDate;
    const partial = hasPaid && rent > 0 && paidAmount + 1 < rent;
    let st;
    if (!hasPaid) { nbUnpaid++; soldeDu += rent; st = 'Impayé'; }
    else if (partial) { nbPartial++; soldeDu += Math.max(0, rent - paidAmount); st = 'Partiel'; }
    else { nbPaid++; if (late) { nbLate++; st = 'Payé (en retard)'; } else st = 'Payé'; }
    return { month: label, status: st };
  });

  const nbExigible = exigibleMonths.length;
  const fullYear = nbExigible >= 12 && nbUnpaid === 0 && nbPartial === 0 && nbPaid === 12 && nbLate === 0;
  const soldeOk = nbUnpaid === 0 && nbPartial === 0 && soldeDu === 0 && nbExigible > 0;
  const hasUnresolved = myPayments.some(p => p.status === 'Impayé' || p.status === 'En retard');

  const stats = { nbExigible, nbPaid, nbLate, nbPartial, nbUnpaid, soldeDu, rent, anciennete, fullYear };

  if (nbExigible === 0) {
    return { eligible: null, label: 'Non évaluable', score: 0, fullYear: false, stats, anciennete,
      criteriaMet: [], criteriaFailed: ['Aucune échéance exigible sur l\'année (locataire non présent / pas encore de loyer dû)'], monthsDetail };
  }

  // ── Attribution : première distinction (par priorité) dont TOUS les critères
  //    paramétrés sont satisfaits. ──
  function meets(k) {
    const r = AR[k];
    if (!r || r.enabled === false) return { ok: false, reasons: ['Distinction désactivée'] };
    const reasons = [];
    if (anciennete < (Number(r.minYears) || 0)) reasons.push(`Ancienneté ${anciennete} an(s) < ${r.minYears} requis`);
    if (nbUnpaid > (Number(r.maxUnpaid) || 0)) reasons.push(`${nbUnpaid} impayé(s) > ${r.maxUnpaid} toléré(s)`);
    if (nbPartial > (Number(r.maxPartial) || 0)) reasons.push(`${nbPartial} partiel(s) > ${r.maxPartial} toléré(s)`);
    if (nbLate > (Number(r.maxLate) || 0)) reasons.push(`${nbLate} retard(s) > ${r.maxLate} toléré(s)`);
    if (r.requireFullYear && !fullYear) reasons.push('12 mois complets exigés');
    if (r.requireSolde && !soldeOk) reasons.push('Année soldée exigée');
    if (r.noUnresolved && hasUnresolved) reasons.push('Impayé résiduel dans l\'historique');
    return { ok: reasons.length === 0, reasons };
  }

  let eligible = null;
  const perAward = {};
  for (const d of AWARD_DEFS) {
    const r = meets(d.key);
    perAward[d.key] = r;
    if (!eligible && r.ok) eligible = d.key;
  }

  // Critères remplis / non remplis (pour la ligne « Détail »).
  const met = [], failed = [];
  if (eligible) {
    const r = AR[eligible];
    met.push(`Ancienneté ${anciennete} an(s) (min ${r.minYears || 0})`);
    met.push(`${nbUnpaid} impayé(s), ${nbPartial} partiel(s), ${nbLate} retard(s) — dans les seuils`);
    if (r.requireFullYear) met.push('12 mois complets ✔');
    if (r.requireSolde) met.push('Année soldée ✔');
  } else {
    // On montre pourquoi la distinction la plus accessible (REGULIER) échoue.
    const base = perAward.REGULIER?.reasons?.length ? perAward.REGULIER.reasons : (perAward.FIDELE?.reasons || []);
    base.forEach(x => failed.push(x));
    if (!failed.length) failed.push('Ne remplit aucun critère paramétré');
  }

  const score = nbExigible === 0 ? 0 : Math.round(((nbPaid - nbLate * 0.3) / nbExigible) * 100);

  return {
    eligible,
    label: eligible ? AWARD_BY_KEY[eligible].label : 'Non éligible',
    score: Math.max(0, Math.min(100, score)),
    fullYear, stats, anciennete,
    criteriaMet: met, criteriaFailed: failed, monthsDetail,
  };
}

/** Évalue tous les locataires d'une agence pour une année. */
export function evaluateAll({ tenants, contracts, payments, year, rules, now } = {}) {
  return (tenants || []).map(t => ({
    tenantId: t.id, tenantName: t.name || '', property: t.property || '',
    ...evaluateTenantYear({ tenant: t, contracts, payments, year, rules, now }),
  }));
}
