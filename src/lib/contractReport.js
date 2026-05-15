// ─── Avenant Contrat de Bail à Usage d'Habitation ─────────────────────────────

const NUM = (n) => Number(n || 0).toLocaleString('fr-CI');

export function generateContractHTML({ contract, property, org, sigBailleur, sigPreneur }) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const rent    = NUM(contract.rent);
  const deposit = NUM(property?.deposit || 2 * Number(contract.rent || 0));
  const advance = NUM(2 * Number(contract.rent || 0));

  let endDateStr = '';
  if (contract.endDate) {
    try {
      const d = new Date(contract.endDate);
      if (!isNaN(d)) endDateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      else endDateStr = contract.endDate;
    } catch { endDateStr = contract.endDate; }
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Avenant Contrat de Bail — ${contract.propertyName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: auto; padding: 48px 40px; font-size: 13px; line-height: 1.85; color: #111; }
  .brand { text-align: center; border-bottom: 3px double #785a00; padding-bottom: 16px; margin-bottom: 24px; }
  .brand-name { font-size: 22px; font-weight: bold; color: #785a00; letter-spacing: 1px; text-transform: uppercase; }
  .brand-sub  { font-size: 11px; color: #888; margin-top: 4px; }
  .doc-title  { text-align: center; font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; background: #f8f4ed; padding: 14px; border: 2px solid #785a00; border-radius: 4px; margin: 24px 0; }
  .party-section { border: 1px solid #d4c5a0; border-radius: 6px; padding: 16px; margin: 12px 0; background: #fdfcf8; }
  .party-role { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #785a00; font-weight: bold; border-bottom: 1px solid #e8dcc9; padding-bottom: 6px; margin-bottom: 10px; }
  .party-name { font-size: 15px; font-weight: bold; }
  .party-line { display: flex; gap: 8px; margin: 4px 0; font-size: 12px; }
  .party-line .lbl { min-width: 140px; color: #666; }
  .divider    { text-align: center; font-weight: bold; margin: 10px 0; font-size: 12px; color: #785a00; }
  h2 { font-size: 11.5px; font-weight: bold; color: #fff; background: #785a00; padding: 7px 14px; margin-top: 26px; margin-bottom: 10px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; page-break-after: avoid; }
  p  { margin: 7px 0; text-align: justify; }
  ul { margin: 7px 0 7px 24px; }
  ul li { margin: 5px 0; }
  .amount { font-size: 14px; font-weight: bold; color: #785a00; }
  .hbox   { background: #fef9ee; border: 1px solid #d4c5a0; border-radius: 6px; padding: 14px; margin: 10px 0; }
  .ptable { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
  .ptable th, .ptable td { border: 1px solid #e0d8c8; padding: 8px 12px; text-align: left; }
  .ptable th { background: #f8f4ed; font-weight: bold; width: 35%; color: #555; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 48px; }
  .sig-box { border: 1px solid #ccc; border-radius: 8px; padding: 16px; min-height: 130px; }
  .sig-role { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #785a00; font-weight: bold; margin-bottom: 4px; }
  .sig-name { font-size: 13px; color: #555; margin-bottom: 8px; }
  .sig-img  { max-width: 100%; max-height: 90px; display: block; border: 1px dashed #ccc; padding: 4px; border-radius: 4px; margin: 6px 0; }
  .sig-empty { height: 64px; border-bottom: 1px solid #aaa; margin: 12px 0 6px; }
  .sig-caption { font-size: 10px; color: #999; text-align: center; }
  .sig-stamp  { font-size: 9px; color: #27ae60; text-align: center; margin-top: 3px; }
  .footer { margin-top: 32px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 10px; color: #888; text-align: center; }
  @media print {
    body { padding: 20px 18px; }
    h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .brand, .doc-title { page-break-after: avoid; }
  }
</style>
</head>
<body>

<div class="brand">
  <div class="brand-name">${org?.companyName || 'Minsouah Immobilier'}</div>
  <div class="brand-sub">${org?.address || "Abidjan, Côte d'Ivoire"}${org?.phone ? ' — ' + org.phone : ''}${org?.email ? ' — ' + org.email : ''}</div>
</div>

<div class="doc-title">AVENANT CONTRAT DE BAIL À USAGE D'HABITATION</div>

<div style="text-align:right;font-size:11px;color:#888;margin-bottom:16px">
  Référence : AVBAIL-${contract.id || Date.now()} &nbsp;|&nbsp; Établi le ${today}
</div>

<p>Entre les Soussignés,</p>

<div class="party-section">
  <div class="party-role">Le Bailleur / Propriétaire</div>
  <div class="party-name">${property?.owner || org?.companyName || '—'}</div>
  <div class="party-line" style="margin-top:8px"><span class="lbl">Représenté par :</span><span>${org?.companyName || 'Minsouah Immobilier'}, Gestionnaire Immobilier Mandaté</span></div>
  <div class="party-line"><span class="lbl">Siège social :</span><span>${org?.address || "Abidjan, Côte d'Ivoire"}</span></div>
</div>

<div class="divider">Ci-après dénommé « LE BAILLEUR »</div>
<div class="divider">D'une part</div>
<div style="text-align:center;font-weight:bold;margin:8px 0;">Et</div>

<div class="party-section">
  <div class="party-role">Le Preneur / Locataire</div>
  <div class="party-name">${contract.tenant}</div>
  <div style="margin-top:8px">
    <div class="party-line"><span class="lbl">Date et lieu de naissance :</span><span>${contract.tenantDOB || '………………………………………'}</span></div>
    <div class="party-line"><span class="lbl">Nationalité :</span><span>${contract.nationality || '………………………………………'}</span></div>
    <div class="party-line"><span class="lbl">Profession :</span><span>${contract.profession || '………………………………………'}</span></div>
    <div class="party-line"><span class="lbl">Contact :</span><span>${contract.tenantPhone || '………………………………………'}</span></div>
  </div>
</div>

<div class="divider">Ci-après dénommé « LE PRENEUR »</div>
<div class="divider">D'autre part</div>

<p style="margin-top:16px">Il a été convenu et arrêté ce qui suit :</p>

<h2>Article 1 — Désignation</h2>
<p>${org?.companyName || 'Minsouah Immobilier'} loue au preneur qui l'accepte :</p>
<table class="ptable">
  <tr><th>Bien immobilier</th><td><strong>${contract.propertyName}</strong></td></tr>
  <tr><th>Adresse</th><td>${property?.address || '—'}</td></tr>
  <tr><th>Type</th><td>${property?.type || 'Appartement'}</td></tr>
  <tr><th>Surface habitable</th><td>${property?.surface ? property.surface + ' m²' : '—'}</td></tr>
  <tr><th>Nombre de pièces</th><td>${property?.rooms ? property.rooms + ' pièce(s)' : '—'}</td></tr>
  <tr><th>Usage</th><td>Habitation principale</td></tr>
</table>

<h2>Article 2 — Durée</h2>
<div class="hbox">
  <p>Le présent bail est conclu pour une période d'<strong>un (01) an renouvelable par tacite reconduction</strong>, si aucune des parties n'exprime son intention d'y mettre fin, au moins <strong>trois (03) mois</strong> avant le terme.</p>
  ${endDateStr ? `<p style="margin-top:8px">Date d'échéance : <strong>${endDateStr}</strong></p>` : ''}
  <p style="margin-top:8px">Ce renouvellement par tacite reconduction ne vaut que pour le preneur à jour de ses obligations contractuelles.</p>
</div>

<h2>Article 3 — Loyer</h2>
<div class="hbox">
  <p>Le présent bail est consenti pour un loyer de <span class="amount">${rent} Francs CFA (${NUM(contract.rent)} FCFA)</span>, payable par mois et d'avance au plus tard le <strong>05 du mois en cours</strong>, en espèces, par chèque ou par virement à l'ordre du bailleur.</p>
  <p style="margin-top:8px">Le paiement du loyer se fera à ${org?.companyName || 'Minsouah Immobilier'} ou entre les mains de toute personne mandatée par elle. Il peut être fait exceptionnellement au domicile du preneur contre bonne et valable quittance.</p>
  <p style="margin-top:8px">Le non-paiement du loyer aux échéances convenues entraînera une <strong>pénalité de retard de 10%</strong> du montant du loyer.</p>
</div>

<h2>Article 4 — Dépôt de Garantie</h2>
<p>À titre de garantie pour l'exécution des clauses du présent contrat, le preneur a payé la somme de <span class="amount">${deposit} Francs CFA</span> représentant <strong>deux (02) mois de loyer à titre de caution</strong>.</p>
<p style="margin-top:8px">Cette somme non productrice d'intérêt sera remboursée à la fin du bail au locataire à jour de ses obligations qui aura procédé à la remise en état des lieux loués. À défaut, le bailleur utilisera ce dépôt pour effectuer les travaux de réhabilitation nécessaires.</p>
<p style="margin-top:8px">Outre le dépôt de garantie, le preneur paie lors de la conclusion du présent bail la somme de <span class="amount">${advance} Francs CFA</span> représentant <strong>deux (02) mois de loyer d'avance</strong>.</p>
<p style="margin-top:8px">Lorsqu'à la fin du bail le preneur est débiteur envers le bailleur au titre des loyers impayés, charges ou réparations lui incombant, ces sommes seront déduites du montant du dépôt de garantie.</p>

<h2>Article 5 — Clause de Révision du Loyer</h2>
<p>Le montant du loyer peut être révisé tous les <strong>trois (03) ans</strong> conformément aux usages et à l'évolution du coût de la vie. Le bailleur qui sollicite une augmentation doit préalablement notifier son intention à l'autre partie par tout moyen au moins <strong>trois (3) mois</strong> avant la date d'effet de la révision.</p>

<h2>Article 6 — Clause de Résiliation du Bail</h2>
<p>Le présent contrat peut être légitimement résilié avant son terme dans les cas ci-après :</p>
<ul>
  <li>En cas de force majeure ;</li>
  <li>Par accord commun des parties ;</li>
  <li>En cas de manquement à ses obligations par l'une des parties ;</li>
  <li>Au terme d'un congé de <strong>trois (3) mois</strong> notifié au locataire par le bailleur pour reprise du bien à usage personnel ou familial jusqu'au 3ème degré inclusivement.</li>
</ul>
<p style="margin-top:8px">Le présent contrat est résilié de plein droit en cas de non-paiement d'<strong>un (1) seul mois</strong> de loyer échu ou de manquement à toute obligation incombant au preneur. Le preneur sera expulsé sur simple ordonnance du juge des référés, sans préjudice de tous dommages et intérêts.</p>

<h2>Article 7 — Entretien des Locaux</h2>
<p>L'entretien des locaux donnés à bail est exclusivement à la charge du preneur. Il devra maintenir et rendre les locaux dans un état semblable à celui dans lequel il les a trouvés. Le preneur jouira des lieux en bon père de famille et ne pourra rien faire ni rien laisser qui puisse les détériorer. Il supportera toutes les réparations nécessaires résultant de son fait ou de celui de sa famille ou de son personnel de maison.</p>
<p style="margin-top:8px">À défaut, le bailleur pourra faire procéder aux travaux d'entretien et de réparation aux frais du preneur. Les espaces communs (escaliers, paliers, parking) devront rester libres. Les animaux de compagnie sont formellement interdits dans le bâtiment.</p>

<h2>Article 8 — Visite des Lieux</h2>
<p>Le preneur devra laisser le bailleur ou son mandataire visiter les lieux chaque semestre, à charge pour lui de le prévenir <strong>sept (7) jours</strong> à l'avance.</p>

<h2>Article 9 — Assurance et Abonnements</h2>
<p>Le preneur s'engage dès la signature du présent bail à assurer son mobilier et ses matériels contre l'incendie, les vols et les risques locatifs (bris de glace).</p>
<p style="margin-top:8px">Les abonnements d'eau (SODECI) et d'électricité (CIE) ont préalablement été souscrits par le bailleur. Les abonnements d'électricité demeureront au nom du bailleur pendant toute la durée du bail. Les abonnements d'eau feront l'objet d'une mutation au nom du locataire.</p>

<h2>Article 10 — Destination des Locaux</h2>
<p>Sous peine de nullité du présent bail, le preneur s'engage à n'utiliser les locaux loués qu'à des fins d'<strong>habitation principale</strong>. Le locataire ne peut changer la destination du local, le transformer ou réaliser des travaux de modification sans l'accord écrit préalable du bailleur.</p>

<h2>Article 11 — Cession de Bail et Sous-location</h2>
<p>La présente location a été consentie au preneur <em>intuitu personae</em>. Toute cession de bail, sous-location ou occupation des lieux par un tiers est rigoureusement interdite sous peine de résiliation immédiate du présent bail à la simple constatation de l'infraction et sans qu'il soit besoin de recourir à une mise en demeure préalable.</p>

<h2>Article 12 — Sécurité</h2>
<p>La sécurité de l'immeuble sera assurée par une entreprise de gardiennage choisie par le bailleur. Toutefois, le bailleur ne sera tenu pour responsable des vols et autres infractions qui pourront survenir durant le séjour du preneur dans les locaux loués.</p>

<h2>Article 13 — Élection de Domicile</h2>
<p>Pour l'exécution des présentes, les parties font élection de domicile entraînant attribution de juridiction :</p>
<ul>
  <li>Le bailleur, à son siège ci-dessus indiqué ;</li>
  <li>Le preneur, dans les locaux de l'appartement objet du présent bail.</li>
</ul>
<p style="margin-top:8px">Tout litige sera soumis à la compétence exclusive des tribunaux d'<strong>Abidjan</strong>. Le présent contrat est établi en <strong>deux (2) exemplaires originaux</strong>, un pour chaque partie, ayant même force juridique.</p>

<p style="text-align:right;margin-top:32px;font-size:12px;font-style:italic">Fait à <strong>Abidjan</strong>, le <strong>${today}</strong></p>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-role">Le Bailleur</div>
    <div class="sig-name">${property?.owner || org?.companyName || '—'}</div>
    ${sigBailleur
      ? `<img src="${sigBailleur}" class="sig-img" alt="Signature Bailleur" /><div class="sig-stamp">✓ Signé numériquement — ${today}</div>`
      : '<div class="sig-empty"></div><div class="sig-caption">Signature et cachet</div>'
    }
  </div>
  <div class="sig-box">
    <div class="sig-role">Le Preneur</div>
    <div class="sig-name">${contract.tenant}</div>
    ${sigPreneur
      ? `<img src="${sigPreneur}" class="sig-img" alt="Signature Preneur" /><div class="sig-stamp">✓ Lu et approuvé — Signé numériquement — ${today}</div>`
      : '<div class="sig-empty"></div><div class="sig-caption">Lu et approuvé — Signature</div>'
    }
  </div>
</div>

<div class="footer">
  <p>Document généré le ${today} — ${org?.companyName || 'Minsouah Immobilier'} — Abidjan, Côte d'Ivoire</p>
  <p>Réf. AVBAIL-${contract.id || Date.now()} | Ce document constitue un avenant au contrat de bail et engage les deux parties signataires.</p>
</div>

</body>
</html>`;
}

export function openContractReport(contract, property, org, signatures = {}) {
  const html = generateContractHTML({ contract, property, org, ...signatures });
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
}
