import { SCI_NORA_LOGO, SCI_NORA_STAMP } from './sciNoraAssets.js';

export function buildReceiptHTML(payment, orgSettings, signatures = {}, nextPaymentDate = null, opts = {}) {
  const org = orgSettings || {};
  const orgLogo  = org.logo  || '';
  const orgStamp = org.stamp || '';
  // Stable receipt number (based on the payment id) so the QR / verification match
  const receiptNum = payment.receiptNum || `QUI-${payment.id}`;
  const qr = opts.qrDataUrl || '';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Quittance de Loyer — ${payment.month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 8mm 12mm; }
  html, body { height: 100%; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1b19; background: #fff; font-size: 11.5px; }
  .page { width: 100%; padding: 6px 10px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #785a00; padding-bottom: 8px; margin-bottom: 10px; }
  .brand { font-size: 19px; font-weight: 900; color: #785a00; letter-spacing: -0.5px; }
  .brand-sub { font-size: 9px; color: #817662; text-transform: uppercase; letter-spacing: 2px; margin-top: 2px; }
  .doc-info { text-align: right; }
  .doc-info h2 { font-size: 14px; font-weight: 700; color: #1c1b19; }
  .doc-info p { font-size: 10px; color: #817662; margin-top: 2px; }
  .receipt-num { display: inline-block; background: #fff8f2; border: 1px solid #e3d9cc; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 700; color: #785a00; margin-top: 4px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .party { background: #fff8f2; border: 1px solid #e3d9cc; border-radius: 8px; padding: 8px 10px; }
  .party-title { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; color: #817662; font-weight: 700; margin-bottom: 4px; }
  .party-name { font-size: 12.5px; font-weight: 700; color: #1c1b19; margin-bottom: 2px; }
  .party-detail { font-size: 10px; color: #5a5040; line-height: 1.4; }
  .amount-box { background: #785a00; color: white; border-radius: 10px; padding: 10px 18px; text-align: center; margin-bottom: 10px; }
  .amount-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8; margin-bottom: 3px; }
  .amount-value { font-size: 25px; font-weight: 900; letter-spacing: -1px; }
  .amount-period { font-size: 12px; opacity: 0.85; margin-top: 2px; }
  .details { border: 1px solid #e3d9cc; border-radius: 8px; overflow: hidden; margin-bottom: 10px; }
  .details-row { display: flex; justify-content: space-between; padding: 4px 12px; font-size: 10.5px; border-bottom: 1px solid #f0e8de; }
  .details-row:last-child { border-bottom: none; }
  .details-row span:first-child { color: #817662; }
  .details-row span:last-child { font-weight: 600; color: #1c1b19; }
  .next-payment { background:#fff8f2; border:1px solid #e3d9cc; border-radius:8px; padding:6px 12px; margin-bottom:10px; display:flex; align-items:center; gap:10px; }
  .signatures { display: flex; justify-content: space-around; gap: 12px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #e3d9cc; }
  .sig-box { flex: 1; text-align: center; }
  .sig-line { border-bottom: 1px solid #817662; height: 40px; margin-bottom: 5px; display:flex; align-items:flex-end; justify-content:center; }
  .sig-line img { max-height:38px; max-width:100%; object-fit:contain; }
  .sig-label { font-size: 9px; color: #817662; text-transform: uppercase; letter-spacing: 1px; }
  .nb { margin-top: 10px; background: #fff8f2; border: 1px solid #e3d9cc; border-left: 3px solid #785a00; border-radius: 8px; padding: 7px 12px; }
  .nb-title { font-size: 9.5px; font-weight: 800; color: #785a00; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .nb ol { margin: 0; padding-left: 16px; }
  .nb li { font-size: 9px; color: #5a5040; line-height: 1.4; margin-bottom: 2px; }
  .verify { margin-top: 10px; display: flex; align-items: center; gap: 12px; border: 1px solid #e3d9cc; border-radius: 8px; padding: 8px 12px; background:#fbfbfb; }
  .verify img { width: 78px; height: 78px; }
  .verify-txt { font-size: 9px; color: #6b7280; line-height: 1.45; }
  .verify-txt b { color: #1c1b19; }
  .footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #e3d9cc; font-size: 8.5px; color: #b0a090; text-align: center; line-height: 1.4; }
  .paid-stamp { position: absolute; top: 120px; right: 30px; border: 3px solid #166534; color: #166534; border-radius: 6px; padding: 5px 10px; font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; transform: rotate(-15deg); opacity: 0.4; pointer-events: none; }
  .org-logo { max-height: 48px; max-width: 130px; object-fit: contain; }
  .org-stamp { max-height: 66px; max-width: 66px; object-fit: contain; opacity: 0.85; }
  @media print { .no-print { display: none; } .page { padding: 0; } }
</style>
</head>
<body>
<div class="page" style="position:relative">
  <div class="paid-stamp">PAYÉ</div>
  <div class="header">
    <div>
      ${orgLogo
        ? `<img src="${orgLogo}" alt="logo" class="org-logo" />`
        : `<div class="brand">${org.companyName || 'Minsouah'}</div>
           <div class="brand-sub">${org.tagline || "L'immobilier réinventé"}</div>
           ${org.address ? `<div style="font-size:10px;color:#817662;margin-top:2px">${org.address}</div>` : ''}
           ${org.phone ? `<div style="font-size:10px;color:#817662">${org.phone}</div>` : ''}`
      }
    </div>
    <div class="doc-info">
      <h2>Quittance de Loyer</h2>
      <p>Date d'émission : ${today}</p>
      <div class="receipt-num">${receiptNum}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-title">Bailleur / Propriétaire</div>
      <div class="party-name">${org.companyName || 'Minsouah Immobilier'}</div>
      <div class="party-detail">${org.address || "Abidjan, Côte d'Ivoire"}</div>
    </div>
    <div class="party">
      <div class="party-title">Locataire</div>
      <div class="party-name">${payment.tenantName || '—'}</div>
      <div class="party-detail">
        ${payment.tenantEmail ? payment.tenantEmail + '<br>' : ''}
        ${payment.tenantPhone || ''}
      </div>
    </div>
  </div>

  <div class="amount-box">
    <div class="amount-label">${payment.penaltyAmount > 0 ? 'Loyer + Pénalité reçus pour la période de' : 'Loyer reçu pour la période de'}</div>
    <div class="amount-period">${payment.month}</div>
    <div class="amount-value">${Number(payment.amount).toLocaleString('fr-FR')} FCFA</div>
    ${payment.penaltyAmount > 0 ? `<div style="font-size:12px;opacity:0.8;margin-top:6px">dont pénalité de retard : ${Number(payment.penaltyAmount).toLocaleString('fr-FR')} FCFA</div>` : ''}
  </div>

  <div class="details">
    <div class="details-row"><span>Propriété</span><span>${payment.propertyName || '—'}</span></div>
    <div class="details-row"><span>Période couverte</span><span>${payment.month}</span></div>
    ${payment.penaltyAmount > 0 ? `
    <div class="details-row"><span>Loyer de base</span><span>${Number(payment.baseAmount).toLocaleString('fr-FR')} FCFA</span></div>
    <div class="details-row" style="background:#fff3cd"><span style="color:#92400e;font-weight:700">Pénalité de retard (10%)</span><span style="color:#b45309;font-weight:700">+ ${Number(payment.penaltyAmount).toLocaleString('fr-FR')} FCFA</span></div>
    <div class="details-row" style="background:#fef3c7"><span style="color:#78350f;font-weight:800">Total réglé</span><span style="color:#78350f;font-weight:800">${Number(payment.amount).toLocaleString('fr-FR')} FCFA</span></div>
    ` : ''}
    <div class="details-row"><span>Date d'échéance</span><span>${payment.dueDate || '—'}</span></div>
    <div class="details-row"><span>Date de paiement</span><span>${payment.paidDate || today}</span></div>
    <div class="details-row"><span>Mode de paiement</span><span>${payment.method || 'Espèces'}</span></div>
    <div class="details-row"><span>Référence</span><span>${receiptNum}</span></div>
    <div class="details-row"><span>Statut</span><span style="color:#166534;font-weight:700">✓ Paiement confirmé</span></div>
  </div>

  ${nextPaymentDate ? `
  <div class="next-payment">
    <div style="font-size:18px">📅</div>
    <div>
      <div style="font-size:9px;color:#817662;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:2px">Prochain loyer attendu</div>
      <div style="font-size:14px;font-weight:900;color:#785a00">${nextPaymentDate}</div>
      <div style="font-size:9px;color:#817662;margin-top:1px">Période de règlement : du 5 au 10 du mois</div>
    </div>
  </div>` : ''}

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-line">
        ${(signatures.bailleur || payment.signatures?.bailleur) ? `<img src="${signatures.bailleur || payment.signatures?.bailleur}" alt="signature bailleur" />` : ''}
      </div>
      ${orgStamp ? `<div style="display:flex;justify-content:center;margin-top:4px"><img src="${orgStamp}" alt="cachet" class="org-stamp" /></div>` : ''}
      <div class="sig-label">Signature et cachet du Bailleur</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">
        ${(signatures.locataire || payment.signatures?.locataire) ? `<img src="${signatures.locataire || payment.signatures?.locataire}" alt="signature locataire" />` : ''}
      </div>
      <div class="sig-label">Signature du Locataire</div>
    </div>
  </div>

  <div class="nb">
    <div class="nb-title">NB — Un locataire ne peut déménager sans :</div>
    <ol>
      <li>qu'il n'ait justifié au propriétaire par une quittance qu'il a acquitté toutes ses contributions personnelles et mobilières de l'année en cours ;</li>
      <li>qu'il n'ait donné ou reçu un congé par écrit dans les délais prescrits ;</li>
      <li>qu'il n'ait fait faire les réparations locatives à sa charge suivant l'usage ou d'après l'état des lieux.</li>
    </ol>
  </div>

  ${qr ? `
  <div class="verify">
    <img src="${qr}" alt="QR de vérification" />
    <div class="verify-txt">
      <b>Vérification d'authenticité</b><br>
      Scannez ce QR code pour vérifier l'authenticité de cette quittance en ligne.<br>
      Référence : <b>${receiptNum}</b>
    </div>
  </div>` : ''}

  <div class="footer">
    Ce document tient lieu de quittance de loyer et atteste du règlement intégral de la somme indiquée.<br>
    ${org.companyName || 'Minsouah'} — Gestion Immobilière — Document généré automatiquement — ${today}
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;
}
