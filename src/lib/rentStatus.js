/* ────────────────────────────────────────────────────────────────────────────
   Statut des loyers du mois courant — source unique partagée par le tableau des
   paiements, l'onglet Rappels, le badge de la barre latérale et le taux de
   recouvrement, afin qu'ils affichent TOUS le même décompte.

   "Non payé ce mois" = contrats actifs/expirants dont le locataire n'a PAS de
   paiement enregistré ce mois (ni Payé), en excluant ceux encore en période
   d'avance (leur paiement démarre un mois ultérieur). À chaque paiement encaissé,
   le locataire sort de la liste (donc le compteur diminue).
   ──────────────────────────────────────────────────────────────────────────── */

export const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const monthFirst = (d) => (d && !isNaN(d.getTime())) ? new Date(d.getFullYear(), d.getMonth(), 1) : null;

export function currentMonthLabel(now = new Date()) {
  return `${MONTHS_FR[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * Liste des locataires n'ayant pas encore payé le loyer du mois courant.
 * @returns {Array} objets { id, isSynthetic?, tenantName, tenantId, tenantPhone,
 *                  tenantEmail, propertyName, amount, month, status, reminderCount }
 */
export function currentMonthUnpaidList({ payments = [], contracts = [], tenants = [] }, now = new Date()) {
  const label = currentMonthLabel(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRecords = payments.filter(p => p.month === label);

  // Enregistrements explicites non réglés (vrais docs de paiement)
  const explicit = monthRecords.filter(p => p.status !== 'Payé' && p.status !== 'Annulé');
  // Locataires déjà couverts par un enregistrement ce mois (payé OU non) — pas de doublon
  const alreadyInMonth = new Set(monthRecords.map(p => (p.tenantName || '').toLowerCase().trim()).filter(Boolean));

  const synthesized = [];
  contracts
    .filter(c => c.status === 'Actif' || c.status === 'Expirant')
    .filter(c => !alreadyInMonth.has((c.tenant || '').toLowerCase().trim()))
    .forEach(c => {
      const name = (c.tenant || '').toLowerCase().trim();
      if (!name) return;
      const tenant = tenants.find(t =>
        (t.name || '').toLowerCase().trim() === name ||
        (c.tenantId && String(t.id) === String(c.tenantId))
      );
      const psDate = tenant?.paymentStartDate ? new Date(tenant.paymentStartDate) : null;
      if (psDate && monthStart < monthFirst(psDate)) return; // encore en avance ce mois
      synthesized.push({
        id: `synth-${c.id}`,
        isSynthetic: true,
        contractId: c.id,
        tenantId: c.tenantId || tenant?.id || null,
        tenantName: c.tenant || '',
        tenantPhone: tenant?.phone || '',
        tenantEmail: tenant?.email || '',
        ownerId: c.ownerId != null ? c.ownerId : (tenant?.ownerId ?? null),
        propertyName: c.propertyName || '',
        amount: c.rent || 0,
        month: label,
        status: 'Impayé',
        reminderCount: 0,
      });
    });

  return [...explicit, ...synthesized];
}

/** Nombre de loyers du mois effectivement encaissés (Payé). */
export function currentMonthPaidCount({ payments = [] }, now = new Date()) {
  const label = currentMonthLabel(now);
  return payments.filter(p => p.month === label && p.status === 'Payé').length;
}

/** Taux de recouvrement = payés / (payés + non payés) du mois courant. */
export function currentMonthRecoveryRate(state, now = new Date()) {
  const paid = currentMonthPaidCount(state, now);
  const unpaid = currentMonthUnpaidList(state, now).length;
  const total = paid + unpaid;
  return total > 0 ? Math.round((paid / total) * 100) : 0;
}
