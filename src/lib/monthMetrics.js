/* ────────────────────────────────────────────────────────────────────────────
   Métriques financières d'un MOIS (attendu / encaissé / impayés / recouvrement).

   Source de vérité : la logique de la page Paiements. Ce module en fait une
   fonction unique, réutilisée par le Tableau de bord et la Vue d'ensemble
   propriétaire pour que les trois pages affichent EXACTEMENT les mêmes chiffres
   pour un mois donné (le libellé « Septembre 2026 » par ex.).
   ──────────────────────────────────────────────────────────────────────────── */

export const MM_MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

export function monthLabelNow(d = new Date()) {
  return `${MM_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// Normalisation d'un libellé de mois : minuscule, sans accents, espaces réduits.
const normLabel = (s) => (s || '').toString().toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

// Normalisation d'un nom (accents/casse/espaces) pour rapprocher paiement ↔ contrat.
const normX = (s) => (s || '').toString().toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

// Correspondance de noms tolérante (inclusion, ≥ 4 caractères).
const nameMatch = (a, b) => {
  a = normX(a); b = normX(b);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long  = a.length <= b.length ? b : a;
  return short.length >= 4 && long.includes(short);
};

/**
 * Calcule les métriques d'un mois, à l'identique de la page Paiements.
 *
 * @param {Object}  args
 * @param {Array}   args.payments   paiements (déjà filtrés par périmètre si besoin)
 * @param {Array}   args.contracts  contrats (idem)
 * @param {Array}   args.tenants    locataires (pour la date de 1er loyer / avance)
 * @param {string}  args.monthLabel libellé du mois, ex. « Septembre 2026 »
 * @returns {{ expected:number, collected:number, pending:number,
 *             recoveryRate:number, paidCount:number, unpaidCount:number }}
 */
export function computeMonthMetrics({ payments = [], contracts = [], tenants = [], monthLabel = '' }) {
  const monthPmts = payments.filter(p => normLabel(p.month) === normLabel(monthLabel));

  const [emn, eyr] = (monthLabel || '').split(' ');
  const eidx = MM_MONTH_NAMES.indexOf(emn);
  const selDate = eidx >= 0 && eyr ? new Date(Number(eyr), eidx, 1) : null;

  const activeContracts = (contracts || []).filter(c => c.status === 'Actif' || c.status === 'Expirant');

  const tenantFor = (c) => (tenants || []).find(t =>
    (t.name || '').toLowerCase().trim() === (c.tenant || '').toLowerCase().trim() ||
    (c.tenantId != null && String(t.id) === String(c.tenantId))
  );
  const startFirstOf = (c) => {
    const t = tenantFor(c);
    const ps = t?.paymentStartDate ? new Date(t.paymentStartDate) : null;
    return ps && !isNaN(ps.getTime()) ? new Date(ps.getFullYear(), ps.getMonth(), 1) : null;
  };
  const inAdvance = (c) => { const sf = startFirstOf(c); return !!(sf && selDate && selDate < sf); };

  /* ── Loyers attendus ──
     Contrats actifs/expirants DUS ce mois : on exclut ceux encore couverts par
     leur avance, et ceux déjà réglés ET reversés au propriétaire (soldés). */
  const settledReversed = new Set(
    monthPmts.filter(p => p.status === 'Payé' && p.avanceVerseeProprio).map(p => normX(p.tenantName)).filter(Boolean)
  );
  const isSettled = (name) => {
    const n = normX(name);
    if (!n) return false;
    return [...settledReversed].some(s => s === n || s.includes(n) || n.includes(s));
  };
  const expected = activeContracts
    .filter(c => !inAdvance(c))
    .filter(c => !isSettled(c.tenant))
    .reduce((s, c) => s + (Number(c.rent) || 0), 0);

  /* ── Encaissés ──
     Loyers réglés du mois, hors sommes déjà reversées au propriétaire. */
  const collected = monthPmts
    .filter(p => p.status === 'Payé' && !p.avanceVerseeProprio)
    .reduce((s, p) => s + (p.amount || 0), 0);

  /* ── Impayés ──
     1) enregistrements explicites non réglés (repli sur le loyer du contrat) +
     2) locataires actifs sans aucun enregistrement ce mois (hors avance). */
  const paidIds = new Set(monthPmts.map(p => (p.tenantId != null ? String(p.tenantId) : '')).filter(Boolean));
  const paidNames = monthPmts.map(p => normX(p.tenantName)).filter(Boolean);
  const contractRecorded = (c) => {
    const cid = c.tenantId != null ? String(c.tenantId) : '';
    if (cid && paidIds.has(cid)) return true;
    const t = (tenants || []).find(t => nameMatch(t.name, c.tenant) || (c.tenantId && String(t.id) === String(c.tenantId)));
    if (t && paidIds.has(String(t.id))) return true;
    return paidNames.some(pn => nameMatch(pn, c.tenant));
  };
  const rentFor = (name) => {
    const c = activeContracts.find(c => nameMatch(c.tenant, name));
    return c?.rent || 0;
  };
  let pending = monthPmts
    .filter(p => p.status !== 'Payé' && p.status !== 'Annulé')
    .reduce((s, p) => s + ((p.amount && p.amount > 0) ? p.amount : rentFor(p.tenantName)), 0);
  activeContracts.forEach(c => {
    const name = normX(c.tenant);
    const cid = c.tenantId != null ? String(c.tenantId) : '';
    if (!name && !cid) return;
    if (contractRecorded(c)) return;
    if (inAdvance(c)) return;
    pending += c.rent || 0;
  });

  /* ── Taux de recouvrement (par nombre de paiements) ── */
  const paidCount = monthPmts.filter(p => p.status === 'Payé').length;
  const recordedNames = new Set(monthPmts.map(p => (p.tenantName || '').toLowerCase().trim()).filter(Boolean));
  let unpaidCount = monthPmts.filter(p => p.status !== 'Payé' && p.status !== 'Annulé').length;
  activeContracts.forEach(c => {
    const name = (c.tenant || '').toLowerCase().trim();
    if (!name || recordedNames.has(name)) return;
    if (inAdvance(c)) return;
    unpaidCount++;
  });
  const totalCount = paidCount + unpaidCount;
  const recoveryRate = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;

  return { expected, collected, pending, recoveryRate, paidCount, unpaidCount };
}

/**
 * Les N derniers mois (le plus ancien d'abord, le mois courant en dernier).
 * @returns {{label:string, short:string, m:number, y:number}[]}
 */
export function lastNMonths(n = 12, from = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    out.push({
      label: `${MM_MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      short: d.toLocaleDateString('fr-FR', { month: 'short' }),
      m: d.getMonth(), y: d.getFullYear(),
    });
  }
  return out;
}

/**
 * Série de recouvrement sur les N derniers mois (pour graphiques).
 * @returns {{mois:string, label:string, attendu:number, encaisse:number,
 *            impaye:number, recouvrement:number}[]}
 */
export function recoverySeries({ payments = [], contracts = [], tenants = [], months = 12 }) {
  return lastNMonths(months).map(mo => {
    const mm = computeMonthMetrics({ payments, contracts, tenants, monthLabel: mo.label });
    return {
      mois: mo.short, label: mo.label,
      attendu: mm.expected, encaisse: mm.collected, impaye: mm.pending,
      recouvrement: mm.recoveryRate,
    };
  });
}

/**
 * Détail par contrat (locataire / bien) pour un mois : statut de règlement.
 * @returns {{tenant:string, property:string, rent:number,
 *            status:'Payé'|'Impayé'|'En avance', collected:number}[]}
 */
export function monthTenantBreakdown({ payments = [], contracts = [], tenants = [], monthLabel = '' }) {
  const monthPmts = payments.filter(p => normLabel(p.month) === normLabel(monthLabel));
  const [emn, eyr] = (monthLabel || '').split(' ');
  const eidx = MM_MONTH_NAMES.indexOf(emn);
  const selDate = eidx >= 0 && eyr ? new Date(Number(eyr), eidx, 1) : null;

  const startFirstOf = (c) => {
    const t = (tenants || []).find(t =>
      (t.name || '').toLowerCase().trim() === (c.tenant || '').toLowerCase().trim() ||
      (c.tenantId != null && String(t.id) === String(c.tenantId)));
    const ps = t?.paymentStartDate ? new Date(t.paymentStartDate) : null;
    return ps && !isNaN(ps.getTime()) ? new Date(ps.getFullYear(), ps.getMonth(), 1) : null;
  };

  return (contracts || [])
    .filter(c => c.status === 'Actif' || c.status === 'Expirant')
    .map(c => {
      const paid = monthPmts.filter(p => p.status === 'Payé' && !p.avanceVerseeProprio && (
        (p.tenantId != null && c.tenantId != null && String(p.tenantId) === String(c.tenantId)) ||
        nameMatch(p.tenantName, c.tenant)
      ));
      const collected = paid.reduce((s, p) => s + (p.amount || 0), 0);
      const sf = startFirstOf(c);
      let status;
      if (paid.length > 0 || collected > 0) status = 'Payé';
      else if (sf && selDate && selDate < sf) status = 'En avance';
      else status = 'Impayé';
      return {
        tenant: c.tenant || '—',
        property: c.propertyName || c.bien || '—',
        rent: Number(c.rent) || 0,
        status, collected,
      };
    })
    .sort((a, b) => {
      const order = { 'Impayé': 0, 'Payé': 1, 'En avance': 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.rent - a.rent;
    });
}
