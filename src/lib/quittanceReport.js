export function buildReceiptHTML(payment, orgSettings, signatures = {}, nextPaymentDate = null) {
  const org = orgSettings || {};
  const receiptNum = `QUI-${payment.id}-${Date.now().toString().slice(-5)}`;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Quittance de Loyer — ${payment.month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1b19; background: #fff; }
  .page { max-width: 680px; margin: 0 auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #785a00; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 26px; font-weight: 900; color: #785a00; letter-spacing: -1px; }
  .brand-sub { font-size: 11px; color: #817662; text-transform: uppercase; letter-spacing: 2px; margin-top: 3px; }
  .doc-info { text-align: right; }
  .doc-info h2 { font-size: 17px; font-weight: 700; color: #1c1b19; }
  .doc-info p { font-size: 12px; color: #817662; margin-top: 3px; }
  .receipt-num { display: inline-block; background: #fff8f2; border: 1px solid #e3d9cc; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; color: #785a00; margin-top: 6px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .party { background: #fff8f2; border: 1px solid #e3d9cc; border-radius: 10px; padding: 16px; }
  .party-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #817662; font-weight: 700; margin-bottom: 8px; }
  .party-name { font-size: 15px; font-weight: 700; color: #1c1b19; margin-bottom: 4px; }
  .party-detail { font-size: 12px; color: #5a5040; line-height: 1.6; }
  .amount-box { background: #785a00; color: white; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; }
  .amount-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8; margin-bottom: 8px; }
  .amount-value { font-size: 36px; font-weight: 900; letter-spacing: -1px; }
  .amount-period { font-size: 14px; opacity: 0.85; margin-top: 6px; }
  .details { border: 1px solid #e3d9cc; border-radius: 10px; overflow: hidden; margin-bottom: 24px; }
  .details-row { display: flex; justify-content: space-between; padding: 10px 16px; font-size: 13px; border-bottom: 1px solid #f0e8de; }
  .details-row:last-child { border-bottom: none; }
  .details-row span:first-child { color: #817662; }
  .details-row span:last-child { font-weight: 600; color: #1c1b19; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e3d9cc; }
  .sig-box { text-align: center; }
  .sig-line { border-bottom: 1px solid #817662; height: 60px; margin-bottom: 8px; display:flex; align-items:flex-end; justify-content:center; }
  .sig-line img { max-height:56px; max-width:100%; object-fit:contain; }
  .sig-label { font-size: 11px; color: #817662; text-transform: uppercase; letter-spacing: 1px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e3d9cc; font-size: 10px; color: #b0a090; text-align: center; line-height: 1.6; }
  .paid-stamp { position: absolute; top: 160px; right: 60px; border: 4px solid #166534; color: #166534; border-radius: 8px; padding: 8px 16px; font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; transform: rotate(-15deg); opacity: 0.5; pointer-events: none; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="page" style="position:relative">
  <div class="paid-stamp">PAYÉ</div>
  <div class="header">
    <div>
      <div class="brand">${org.companyName || 'Minsouah'}</div>
      <div class="brand-sub">L'immobilier réinventé</div>
      ${org.address ? `<div style="font-size:12px;color:#817662;margin-top:4px">${org.address}</div>` : ''}
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
  <div style="background:#fff8f2;border:1.5px solid #e3d9cc;border-radius:10px;padding:14px 18px;margin-bottom:24px;display:flex;align-items:center;gap:14px">
    <div style="font-size:22px">📅</div>
    <div>
      <div style="font-size:10px;color:#817662;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:4px">Prochain loyer attendu</div>
      <div style="font-size:17px;font-weight:900;color:#785a00">${nextPaymentDate}</div>
      <div style="font-size:11px;color:#817662;margin-top:2px">Période de règlement : du 5 au 10 du mois</div>
    </div>
  </div>` : ''}

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-line">
        ${(signatures.bailleur || payment.signatures?.bailleur) ? `<img src="${signatures.bailleur || payment.signatures?.bailleur}" alt="signature bailleur" />` : ''}
      </div>
      <div class="sig-label">Signature du Bailleur</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">
        ${(signatures.locataire || payment.signatures?.locataire) ? `<img src="${signatures.locataire || payment.signatures?.locataire}" alt="signature locataire" />` : ''}
      </div>
      <div class="sig-label">Signature du Locataire</div>
    </div>
  </div>

  <div class="footer">
    Ce document tient lieu de quittance de loyer et atteste du règlement intégral de la somme indiquée.<br>
    ${org.companyName || 'Minsouah'} — Gestion Immobilière — Document généré automatiquement — ${today}
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;
}
