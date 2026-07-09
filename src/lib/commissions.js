/* ────────────────────────────────────────────────────────────────────────────
   Commissions de gestion Minsouah.

   Un taux s'applique selon une précédence du plus SPÉCIFIQUE au plus GÉNÉRAL :
     propriétaire  >  immeuble  >  organisation.
   Si AUCUNE règle ne s'applique, la commission est nulle (0 %) : une commission
   n'est prélevée que là où une règle a été explicitement configurée.

   Chaque règle (commissionRates) : { id, orgId, buildingName?, ownerId?, rate,
   effectiveDate, active }. Une règle qui cible un propriétaire/immeuble précis
   ne s'applique QU'À lui. On retient la règle applicable la plus spécifique et,
   à spécificité égale, la date d'effet la plus récente ≤ date du paiement.

   Le taux est FIGÉ sur le paiement au moment de l'encaissement : il ne doit
   jamais être recalculé, même si le paramétrage change ensuite.
   ──────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_COMMISSION_RATE = 10;

// Nom d'immeuble à partir d'un nom de propriété ("IMMEUBLE MORIS — A4 (…)" → "IMMEUBLE MORIS")
export function buildingOf(propertyName) {
  return String(propertyName || '').split(' — ')[0].split(' (')[0].trim();
}

function buildingMatch(a, b) {
  const na = (a || '').toLowerCase().trim();
  const nb = (b || '').toLowerCase().trim();
  if (!na || !nb) return false;
  return na === nb || nb.startsWith(na) || na.startsWith(nb);
}

/**
 * Résout le taux applicable (%).
 * @param {Array} rates  règles commissionRates
 * @param {{orgId?, ownerId?, buildingName?, date?}} ctx
 * @returns {{ rate:number, ruleId:string|null, source:string }}
 */
export function resolveCommission(rates, { orgId, ownerId, buildingName, date } = {}) {
  const d = date ? new Date(date) : new Date();
  const dd = isNaN(d.getTime()) ? new Date() : d;

  let best = null, bestScore = -1, bestDate = -Infinity;
  for (const r of (rates || [])) {
    if (r.active === false) continue;
    if (r.orgId && orgId && r.orgId !== orgId) continue;
    if (r.effectiveDate && new Date(r.effectiveDate) > dd) continue;
    // Une règle ciblée ne s'applique qu'à sa cible
    if (r.ownerId && String(r.ownerId) !== String(ownerId ?? '')) continue;
    if (r.buildingName && !buildingMatch(r.buildingName, buildingName)) continue;

    let score = 0;
    if (r.ownerId) score += 100;
    if (r.buildingName) score += 10;
    if (r.orgId) score += 1;
    const ed = r.effectiveDate ? new Date(r.effectiveDate).getTime() : 0;
    if (score > bestScore || (score === bestScore && ed > bestDate)) {
      best = r; bestScore = score; bestDate = ed;
    }
  }
  if (best) return { rate: Number(best.rate) || 0, ruleId: best.id || null, source: best.ownerId ? 'propriétaire' : best.buildingName ? 'immeuble' : best.orgId ? 'organisation' : 'global' };
  // Aucune règle applicable → AUCUNE commission (0 %). Une commission ne
  // s'applique que si une règle explicite (organisation, immeuble ou
  // propriétaire) a été configurée.
  return { rate: 0, ruleId: null, source: 'aucune' };
}

/** Calcule brut / commission / net à partir d'un montant et d'un taux. */
export function computeCommission(amount, rate) {
  const brut = Math.max(0, Number(amount) || 0);
  const r = Number(rate) || 0;
  const commission = Math.round(brut * r / 100);
  return { montantBrut: brut, commissionRate: r, commissionAmount: commission, montantNet: brut - commission };
}

/**
 * Renvoie les champs de commission FIGÉS pour un paiement encaissé.
 * Ne recalcule jamais si le paiement porte déjà un taux figé.
 */
export function freezeCommissionOnPayment(payment, rates, actor = {}) {
  if (payment.commissionRate != null && payment.commissionFrozenAt) return null; // déjà figé
  const ctx = {
    orgId: payment.orgId,
    ownerId: payment.ownerId ?? null,
    buildingName: buildingOf(payment.propertyName),
    date: payment.paidDate || payment.date || new Date().toISOString(),
  };
  const { rate, ruleId, source } = resolveCommission(rates, ctx);
  const calc = computeCommission(payment.amount, rate);
  return {
    ...calc,
    commissionRuleId: ruleId,
    commissionSource: source,
    commissionFrozenAt: new Date().toISOString(),
    commissionBy: actor.userName || actor.userId || null,
  };
}
