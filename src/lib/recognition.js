/* ────────────────────────────────────────────────────────────────────────────
   MINSOUAH RECONNAISSANCE — Moteur d'évaluation des distinctions locataires.
   « Votre sérieux mérite d'être reconnu. »

   Fonction PURE et EXPLICABLE : pour un locataire et une année, on calcule à
   partir des données financières réelles (paiements validés uniquement) les
   statistiques de l'exercice, puis on attribue AU PLUS UNE distinction (la plus
   élevée) selon une hiérarchie non contradictoire et des seuils paramétrables.

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

export const DEFAULT_RULES = { fideleYears: 2, partenaireYears: 4, regularMaxLate: 2 };

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
 * @returns {{ eligible:string|null, label:string, score:number, fullYear:boolean,
 *   stats:object, criteriaMet:string[], criteriaFailed:string[], anciennete:number }}
 */
export function evaluateTenantYear({ tenant, contracts, payments, year, rules = DEFAULT_RULES, now = new Date() }) {
  const R = { ...DEFAULT_RULES, ...rules };
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

  // Fenêtre d'exigibilité dans l'année : du 1er loyer (paymentStartDate / début
  // contrat) jusqu'au mois courant (année en cours) ou à la sortie (contrat résilié).
  const psd = parseDate(tenant.paymentStartDate) || firstStart;
  let startMonth = 0;
  if (psd && psd.getFullYear() === year) startMonth = psd.getMonth();
  else if (psd && psd.getFullYear() > year) startMonth = 12; // pas encore locataire cette année
  // Fin : mois courant si année en cours, sinon décembre ; borné par une éventuelle sortie.
  let endMonth = (year === now.getFullYear()) ? now.getMonth() : 11;
  const resiliated = myContracts.some(c => c.status === 'Résilié');
  const depart = resiliated ? (parseDate(activeC?.endDate) || null) : null;
  if (depart && depart.getFullYear() === year) endMonth = Math.min(endMonth, depart.getMonth());
  else if (depart && depart.getFullYear() < year) endMonth = -1; // parti avant cette année

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
  const perfect = nbExigible > 0 && nbUnpaid === 0 && nbPartial === 0 && nbLate === 0 && nbPaid === nbExigible;
  const soldeOk = nbUnpaid === 0 && nbPartial === 0 && soldeDu === 0 && nbExigible > 0; // année soldée
  // Historique : aucun impayé résiduel détecté dans les enregistrements du locataire.
  const hasUnresolved = myPayments.some(p => p.status === 'Impayé' || p.status === 'En retard');

  const stats = { nbExigible, nbPaid, nbLate, nbPartial, nbUnpaid, soldeDu, rent, anciennete, fullYear };

  // ── Attribution : première distinction satisfaite dans l'ordre de priorité. ──
  const met = [], failed = [];
  const add = (ok, txt) => (ok ? met : failed).push(txt);

  // Critères de base réutilisés
  add(nbUnpaid === 0, `Aucun impayé à la clôture (${nbUnpaid} impayé(s))`);
  add(nbPartial === 0, `Aucun paiement partiel (${nbPartial})`);
  add(nbLate === 0, `Aucun retard (${nbLate} retard(s))`);

  let eligible = null;
  if (nbExigible === 0) {
    return { eligible: null, label: 'Non évaluable', score: 0, fullYear: false, stats, anciennete,
      criteriaMet: [], criteriaFailed: ['Aucune échéance exigible sur l\'année (locataire non présent / pas encore de loyer dû)'], monthsDetail };
  }
  if (anciennete >= R.partenaireYears && perfect && !hasUnresolved) {
    eligible = 'PARTENAIRE';
  } else if (fullYear) {
    eligible = 'EXCELLENCE';
  } else if (perfect) {
    eligible = 'EXEMPLAIRE';
  } else if (anciennete >= R.fideleYears && soldeOk && nbPartial === 0) {
    eligible = 'FIDELE';
  } else if (soldeOk && nbPartial === 0 && nbLate <= R.regularMaxLate) {
    eligible = 'REGULIER';
  }

  // Score indicatif (0-100) : ponctualité + complétude.
  const score = nbExigible === 0 ? 0 : Math.round(((nbPaid - nbLate * 0.3) / nbExigible) * 100);

  // Motifs de non-éligibilité détaillés
  if (!eligible) {
    if (nbUnpaid > 0) failed.push(`${nbUnpaid} loyer(s) impayé(s) — ${soldeDu.toLocaleString('fr-FR')} FCFA dus`);
    if (nbPartial > 0) failed.push(`${nbPartial} paiement(s) partiel(s)`);
    if (nbLate > R.regularMaxLate) failed.push(`${nbLate} retards (> ${R.regularMaxLate} tolérés)`);
  }

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
