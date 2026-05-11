// ─── Génération PDF bail d'habitation ─────────────────────────────────────────

const NUM = (n) => Number(n || 0).toLocaleString('fr-CI');

export function generateContractHTML({ contract, property, org }) {
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const deposit = NUM(2 * Number(contract.rent || 0));
  const rent    = NUM(contract.rent);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat de bail — ${contract.propertyName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Georgia, serif; max-width: 820px; margin: auto; padding: 48px 40px; font-size: 13px; line-height: 1.7; color: #111; }
  .brand { text-align: center; border-bottom: 3px solid #785a00; padding-bottom: 16px; margin-bottom: 28px; }
  .brand-name { font-size: 22px; font-weight: bold; color: #785a00; letter-spacing: 1px; }
  .brand-sub { font-size: 11px; color: #888; margin-top: 2px; }
  .doc-title { text-align: center; font-size: 17px; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; background: #f8f4ed; padding: 12px; border: 1px solid #d4c5a0; border-radius: 4px; margin-bottom: 28px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 24px 0; }
  .party-box { border: 1px solid #d4c5a0; border-radius: 6px; padding: 14px; background: #fdfcf8; }
  .party-box .party-role { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #785a00; font-weight: bold; border-bottom: 1px solid #e8dcc9; padding-bottom: 6px; margin-bottom: 8px; }
  .party-box .party-name { font-size: 15px; font-weight: bold; }
  .party-box .party-info { font-size: 11px; color: #666; margin-top: 4px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; color: #fff; background: #785a00; padding: 6px 12px; margin-top: 28px; margin-bottom: 10px; border-radius: 3px; }
  p { margin: 8px 0; text-align: justify; }
  ul { margin: 8px 0 8px 24px; }
  ul li { margin: 4px 0; }
  strong { color: #333; }
  .amount { font-size: 15px; font-weight: bold; color: #785a00; }
  .highlight-box { background: #fef9ee; border: 1px solid #d4c5a0; border-radius: 6px; padding: 14px; margin: 12px 0; }
  .prop-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .prop-table th, .prop-table td { border: 1px solid #e0d8c8; padding: 8px 12px; text-align: left; font-size: 12px; }
  .prop-table th { background: #f8f4ed; font-weight: bold; width: 40%; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
  .sig-box { border: 1px solid #ccc; border-radius: 6px; padding: 16px; }
  .sig-box .sig-label { font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .sig-box .sig-name { font-size: 13px; color: #555; }
  .sig-line { border-top: 1px solid #aaa; margin-top: 60px; padding-top: 6px; font-size: 10px; color: #aaa; text-align: center; }
  .footer { margin-top: 36px; border-top: 1px solid #ddd; padding-top: 12px; font-size: 10px; color: #888; text-align: center; }
  .ref { font-size: 10px; color: #aaa; margin-top: 4px; }
  @media print { body { padding: 24px 20px; } h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .brand { page-break-after: avoid; } }
</style>
</head>
<body>

<div class="brand">
  <div class="brand-name">${org?.companyName || 'Minsouah Immobilier'}</div>
  <div class="brand-sub">${org?.address || "Abidjan, Côte d'Ivoire"} ${org?.phone ? '— ' + org.phone : ''} ${org?.email ? '— ' + org.email : ''}</div>
</div>

<div class="doc-title">Contrat de bail d'habitation</div>

<div style="text-align:right;font-size:11px;color:#888;margin-bottom:8px">
  Référence : BAI-${contract.id || Date.now()} &nbsp;|&nbsp; Établi le ${today}
</div>

<h2>Article 1 — Parties au contrat</h2>
<div class="parties">
  <div class="party-box">
    <div class="party-role">Le Bailleur (Propriétaire)</div>
    <div class="party-name">${property?.owner || '—'}</div>
    <div class="party-info">Propriétaire du logement désigné ci-après</div>
  </div>
  <div class="party-box">
    <div class="party-role">Le Preneur (Locataire)</div>
    <div class="party-name">${contract.tenant}</div>
    <div class="party-info">Demeurant à l'adresse du logement loué</div>
  </div>
</div>
<p>Représentés et gérés par <strong>${org?.companyName || 'Minsouah Immobilier'}</strong>, gestionnaire immobilier mandaté.</p>

<h2>Article 2 — Désignation du logement</h2>
<table class="prop-table">
  <tr><th>Bien immobilier</th><td><strong>${contract.propertyName}</strong></td></tr>
  <tr><th>Adresse</th><td>${property?.address || '—'}</td></tr>
  <tr><th>Type</th><td>${property?.type || 'Résidentiel'}</td></tr>
  <tr><th>Surface</th><td>${property?.surface ? property.surface + ' m²' : '—'}</td></tr>
  <tr><th>Nombre de pièces</th><td>${property?.rooms ? property.rooms + ' pièce(s)' : '—'}</td></tr>
  <tr><th>Usage</th><td>Habitation principale</td></tr>
</table>

<h2>Article 3 — Durée du bail</h2>
<div class="highlight-box">
  <p>Le présent bail est consenti pour une durée de <strong>douze (12) mois</strong>, à compter de la date de signature.
  ${contract.endDate && contract.endDate !== '—'
    ? `Il prend fin le <strong>${contract.endDate}</strong>.`
    : ''
  }</p>
  <p>À l'expiration, il sera renouvelé par tacite reconduction pour des périodes successives d'un an, sauf congé signifié par l'une des parties.</p>
</div>

<h2>Article 4 — Loyer et charges</h2>
<div class="highlight-box">
  <p>Le loyer mensuel est fixé à : <span class="amount">${rent} FCFA</span></p>
  <p style="margin-top:8px">Payable d'avance, avant le <strong>5 de chaque mois</strong>, par virement, mobile money (Orange Money, MTN MoMo, Wave) ou tout autre moyen convenu entre les parties.</p>
  <p style="margin-top:8px">En cas de retard de paiement supérieur à dix (10) jours, des pénalités de retard de <strong>5% du loyer mensuel</strong> seront appliquées par quinzaine de retard.</p>
</div>

<h2>Article 5 — Dépôt de garantie</h2>
<p>Un dépôt de garantie correspondant à <strong>deux (2) mois de loyer</strong>, soit <span class="amount">${deposit} FCFA</span>, est versé par le locataire à la signature du présent bail.</p>
<p>Ce dépôt sera restitué au locataire dans un délai maximum de <strong>deux (2) mois</strong> après la remise des clés, déduction faite des sommes restant dues et du coût des réparations locatives.</p>

<h2>Article 6 — Obligations du bailleur</h2>
<ul>
  <li>Délivrer le logement en bon état d'usage et de réparation ;</li>
  <li>Assurer la jouissance paisible et continue du logement ;</li>
  <li>Prendre en charge les réparations importantes et les grosses réparations ;</li>
  <li>Entretenir les équipements mentionnés au contrat ;</li>
  <li>Ne pas s'opposer aux aménagements normaux réalisés par le locataire.</li>
</ul>

<h2>Article 7 — Obligations du locataire</h2>
<ul>
  <li>Payer le loyer et les charges aux termes convenus ;</li>
  <li>User paisiblement des locaux selon leur destination ;</li>
  <li>Répondre des dégradations et pertes survenues pendant l'occupation ;</li>
  <li>Permettre l'exécution des travaux nécessaires et urgents ;</li>
  <li>Souscrire et maintenir une assurance habitation multirisques ;</li>
  <li>Ne pas sous-louer tout ou partie du logement sans accord écrit du bailleur ;</li>
  <li>Ne pas transformer les locaux sans autorisation écrite préalable ;</li>
  <li>Restituer le logement en bon état d'entretien à la fin du bail.</li>
</ul>

<h2>Article 8 — État des lieux</h2>
<p>Un état des lieux contradictoire sera établi à l'entrée et à la sortie du locataire, en présence des deux parties ou de leurs représentants, par le gestionnaire mandaté.</p>
<p>Il constituera la référence pour l'appréciation de l'état du logement et le calcul des éventuelles retenues sur dépôt de garantie.</p>

<h2>Article 9 — Résiliation du bail</h2>
<p><strong>Par le locataire :</strong> Le locataire peut résilier le bail à tout moment, avec un préavis d'<strong>un (1) mois</strong> notifié par lettre remise en main propre contre récépissé ou par voie recommandée.</p>
<p style="margin-top:8px"><strong>Par le bailleur :</strong> Le bailleur peut résilier le bail en cas de manquement grave aux obligations du locataire (impayés, troubles de voisinage, dégradations) après mise en demeure restée sans effet sous quinze (15) jours.</p>
<p style="margin-top:8px">En cas de vente du bien, le locataire bénéficie d'un <strong>droit de préemption</strong> dans les conditions définies par la législation en vigueur.</p>

<h2>Article 10 — Dispositions générales</h2>
<p>Pour tout ce qui n'est pas expressément prévu aux présentes, les parties se réfèrent à la législation ivoirienne en vigueur et aux usages locaux en matière de baux d'habitation.</p>
<p style="margin-top:8px">Tout litige relatif à l'interprétation ou à l'exécution du présent contrat sera soumis à la compétence des tribunaux d'<strong>Abidjan</strong>.</p>
<p style="margin-top:8px">Le présent contrat est établi en <strong>deux (2) exemplaires originaux</strong>, un pour chaque partie, ayant même force juridique.</p>

<p style="text-align:right;margin-top:28px;font-size:12px">Fait à <strong>Abidjan</strong>, le <strong>${today}</strong></p>

<div class="signatures">
  <div class="sig-box">
    <div class="sig-label">Le Bailleur</div>
    <div class="sig-name">${property?.owner || '—'}</div>
    <div class="sig-line">Signature &amp; cachet</div>
  </div>
  <div class="sig-box">
    <div class="sig-label">Le Locataire</div>
    <div class="sig-name">${contract.tenant}</div>
    <div class="sig-line">Signature précédée de<br>«Lu et approuvé»</div>
  </div>
</div>

<div style="text-align:center;margin-top:24px;">
  <div class="sig-box" style="display:inline-block;min-width:200px;padding:12px 24px;">
    <div class="sig-label">Le Gestionnaire</div>
    <div class="sig-name">${org?.companyName || 'Minsouah Immobilier'}</div>
    <div class="sig-line">Signature &amp; cachet</div>
  </div>
</div>

<div class="footer">
  <p>Document généré le ${today} — ${org?.companyName || 'Minsouah Immobilier'} — Abidjan, Côte d'Ivoire</p>
  <p class="ref">Réf. BAI-${contract.id || Date.now()} | Ce document tient lieu de contrat de bail et engage les deux parties signataires.</p>
</div>

</body>
</html>`;
}

export function openContractReport(contract, property, org) {
  const html = generateContractHTML({ contract, property, org });
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const w    = window.open(url, '_blank');
  if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
}
