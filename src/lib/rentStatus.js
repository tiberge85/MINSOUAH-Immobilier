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
export function currentMonthUnpaidList({ payments = [], contracts = [], tenants = [], properties = [] }, now = new Date()) {
  const label = currentMonthLabel(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRecords = payments.filter(p => p.month === label);
  const norm = s => (s || '').toLowerCase().trim();

  // Enregistrements explicites non réglés (vrais docs de paiement)
  const explicit = monthRecords.filter(p => p.status !== 'Payé' && p.status !== 'Annulé');
  // Locataires déjà couverts par un enregistrement ce mois (payé OU non) — pas de doublon.
  // `covered` grandit au fil des ajouts pour éviter les doublons entre les sources.
  const covered = new Set(monthRecords.map(p => norm(p.tenantName)).filter(Boolean));

  // Loyer de référence par libellé de bien (immeuble → unité, sinon bien simple).
  const rentByLabel = new Map();
  (properties || []).forEach(p => {
    if (p.isBuilding) {
      (p.units || []).forEach(u => {
        rentByLabel.set(norm(`${p.name} — ${u.number} (${u.floor})`), Number(u.rent) || 0);
        rentByLabel.set(norm(`${p.name} — ${u.number}`), Number(u.rent) || 0);
      });
    } else {
      rentByLabel.set(norm(p.name), Number(p.rent) || 0);
    }
  });
  const rentForTenant = (t, contract) => {
    if (contract && (Number(contract.rent) || 0) > 0) return Number(contract.rent);
    const byLabel = rentByLabel.get(norm(t?.property));
    return byLabel != null ? byLabel : 0;
  };
  // Un locataire est en période d'avance si son 1er paiement démarre un mois ultérieur.
  const inAdvance = (psDateStr) => {
    const psDate = psDateStr ? new Date(psDateStr) : null;
    return !!(psDate && !isNaN(psDate.getTime()) && monthStart < monthFirst(psDate));
  };

  const out = [...explicit];

  // 1) Contrats actifs/expirants → source principale (loyer = loyer du contrat).
  contracts
    .filter(c => c.status === 'Actif' || c.status === 'Expirant')
    .forEach(c => {
      const name = norm(c.tenant);
      if (!name || covered.has(name)) return;
      const tenant = tenants.find(t =>
        norm(t.name) === name || (c.tenantId && String(t.id) === String(c.tenantId))
      );
      if (inAdvance(tenant?.paymentStartDate)) return; // encore en avance ce mois
      covered.add(name);
      out.push({
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

  // 2) Locataires ACTIFS sans contrat actif rattaché mais qui doivent payer un
  //    loyer ce mois (loyer déduit du bien assigné). Garantit que le rappel tient
  //    compte de TOUS les locataires actifs redevables du loyer.
  tenants
    .filter(t => t.status === 'Actif' || !t.status)
    .forEach(t => {
      const name = norm(t.name);
      if (!name || covered.has(name)) return;
      if (inAdvance(t.paymentStartDate)) return; // encore en avance ce mois
      const contract = contracts.find(c =>
        norm(c.tenant) === name || (t.id != null && c.tenantId && String(c.tenantId) === String(t.id))
      );
      const rent = rentForTenant(t, contract);
      if (!rent || rent <= 0) return; // pas d'obligation de loyer identifiable
      covered.add(name);
      out.push({
        id: `synth-t-${t.id}`,
        isSynthetic: true,
        contractId: contract?.id || null,
        tenantId: t.id != null ? t.id : null,
        tenantName: t.name || '',
        tenantPhone: t.phone || '',
        tenantEmail: t.email || '',
        ownerId: t.ownerId != null ? t.ownerId : (contract?.ownerId ?? null),
        propertyName: t.property || contract?.propertyName || '',
        amount: rent,
        month: label,
        status: 'Impayé',
        reminderCount: 0,
      });
    });

  return out;
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
