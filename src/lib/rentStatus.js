/* ────────────────────────────────────────────
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
  // Normalisation insensible aux accents/casse/espaces + correspondance de mois
  // tolérante (« Aout » ≡ « Août ») pour ne pas rater un paiement du mois.
  const norm = s => (s || '').toString().toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const normLabel = s => norm(s).replace(/\s+/g, ' ');
  const monthRecords = payments.filter(p => normLabel(p.month) === normLabel(label));

  // Correspondance de noms tolérante aux titres/mentions : « yoro estelle » est
  // reconnu dans « Mme YORO ESTELLE », et inversement. Évite qu'un locataire ayant
  // déjà payé (avance comprise) réapparaisse à tort dans les rappels du mois.
  const nameMatch = (a, b) => {
    a = norm(a); b = norm(b);
    if (!a || !b) return false;
    if (a === b) return true;
    const short = a.length <= b.length ? a : b;
    const long = a.length <= b.length ? b : a;
    return short.length >= 4 && long.includes(short);
  };

  // Occupants ACTUELS = locataires rattachés à un contrat actif/expirant. Sert à
  // écarter des rappels les locataires PARTIS (ex. M. ALI, appartement LEVI libéré),
  // même s'ils traînent encore un enregistrement d'impayé pour le mois.
  const activeContracts = contracts.filter(c => c.status === 'Actif' || c.status === 'Expirant');
  const activeNames = activeContracts.map(c => norm(c.tenant)).filter(Boolean);
  const activeIds = new Set();
  activeContracts.forEach(c => {
    if (c.tenantId != null) activeIds.add(String(c.tenantId));
    const t = tenants.find(tt => nameMatch(tt.name, c.tenant) || (c.tenantId && String(tt.id) === String(c.tenantId)));
    if (t && t.id != null) activeIds.add(String(t.id));
  });
  const isActiveOccupant = (name, id) => {
    if (id != null && id !== '' && activeIds.has(String(id))) return true;
    return activeNames.some(an => nameMatch(an, name));
  };

  // Enregistrements explicites non réglés (vrais docs de paiement), MAIS seulement
  // pour les occupants actuels — un locataire parti ne doit plus être relancé.
  const explicit = monthRecords
    .filter(p => p.status !== 'Payé' && p.status !== 'Annulé')
    .filter(p => isActiveOccupant(p.tenantName, p.tenantId));
  // Locataires déjà couverts par un enregistrement ce mois (payé OU non), reconnus
  // par NOM normalisé (avec inclusion) OU par ID de locataire — pas de doublon.
  const coveredNames = monthRecords.map(p => norm(p.tenantName)).filter(Boolean);
  const coveredIds = new Set(monthRecords.map(p => (p.tenantId != null ? String(p.tenantId) : '')).filter(Boolean));
  const isCovered = (name, id) => {
    if (id != null && id !== '' && coveredIds.has(String(id))) return true;
    return coveredNames.some(cn => nameMatch(cn, name));
  };
  // Suivi des locataires déjà ajoutés à la liste (anti-doublon entre les sources).
  const addedNames = explicit.map(p => norm(p.tenantName)).filter(Boolean);
  const addedIds = new Set(explicit.map(p => (p.tenantId != null ? String(p.tenantId) : '')).filter(Boolean));
  const alreadyAdded = (name, id) => {
    if (id != null && id !== '' && addedIds.has(String(id))) return true;
    return addedNames.some(an => nameMatch(an, name));
  };
  const markAdded = (name, id) => {
    const n = norm(name); if (n) addedNames.push(n);
    if (id != null && id !== '') addedIds.add(String(id));
  };

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
      const tenant = tenants.find(t =>
        nameMatch(t.name, c.tenant) || (c.tenantId && String(t.id) === String(c.tenantId))
      );
      const id = c.tenantId != null ? c.tenantId : (tenant?.id ?? null);
      if (!norm(c.tenant) && id == null) return;
      if (isCovered(c.tenant, id) || alreadyAdded(c.tenant, id)) return; // déjà payé/couvert
      if (inAdvance(tenant?.paymentStartDate)) return; // encore en avance ce mois
      markAdded(c.tenant, id);
      out.push({
        id: `synth-${c.id}`,
        isSynthetic: true,
        contractId: c.id,
        tenantId: id,
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

  // 2) Filet de sécurité : locataire ACTIF rattaché à un CONTRAT ACTIF que la
  //    boucle 1 n'aurait pas capté. IMPORTANT : on EXIGE un contrat actif/expirant.
  //    Ainsi un locataire dont l'appartement a été LIBÉRÉ (contrat terminé) ne
  //    figure PLUS dans les rappels, même si sa fiche est restée « Actif ».
  tenants
    .filter(t => t.status === 'Actif' || !t.status)
    .forEach(t => {
      const id = t.id != null ? t.id : null;
      if (!norm(t.name)) return;
      if (isCovered(t.name, id) || alreadyAdded(t.name, id)) return; // déjà payé/couvert
      if (inAdvance(t.paymentStartDate)) return; // encore en avance ce mois
      const contract = contracts.find(c =>
        (c.status === 'Actif' || c.status === 'Expirant') &&
        (nameMatch(c.tenant, t.name) || (t.id != null && c.tenantId && String(c.tenantId) === String(t.id)))
      );
      if (!contract) return; // aucun contrat actif → n'occupe plus
