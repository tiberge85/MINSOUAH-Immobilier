/**
 * Bordereau de versement — professional printable document.
 * Same pattern as quittanceReport.js: build an HTML string with inlined styles
 * and base64 assets, open it in a new window and auto-print.
 */

const fmt = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} XOF`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildBordereauHTML(bord, orgSettings = {}, opts = {}) {
  const org = orgSettings || {};
  const isProprio = bord.type === 'PROPRIETAIRE';
  const logo = org.logo || '';
  const stamp = org.stamp || '';
  const qr = opts.qrDataUrl || '';
  const title = isProprio ? 'BORDEREAU DE VERSEMENT AU PROPRIÉTAIRE' : 'BORDEREAU DE VERSEMENT À LA COMPTABILITÉ';

  const lines = bord.lines || [];
  const rows = lines.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(l.tenantName)}</td>
      <td>${esc(l.propertyName)}${l.unit ? ` — ${esc(l.unit)}` : ''}</td>
      <td>${esc(l.period)}</td>
      <td>${esc(l.paidDate)}</td>
      <td class="num">${fmt(l.amount)}</td>
      ${isProprio ? `<td class="num">${fmt(l.commission)}</td><td class="num">${fmt(l.frais)}</td><td class="num strong">${fmt(l.net)}</td>` : ''}
    </tr>`).join('');

  const colspanBefore = 5;
  const totalsRow = isProprio
    ? `<tr class="totals"><td colspan="${colspanBefore}">TOTAUX</td><td class="num">${fmt(bord.totalAmount)}</td><td class="num">${fmt(bord.totalCommission)}</td><td class="num">${fmt(bord.totalFrais)}</td><td class="num strong">${fmt(bord.totalNet)}</td></tr>`
    : `<tr class="totals"><td colspan="${colspanBefore}">TOTAL VERSÉ</td><td class="num strong">${fmt(bord.totalAmount)}</td></tr>`;

  const headMeta = isProprio ? `
    <div class="meta">
      <div><span>Propriétaire</span><b>${esc(bord.ownerName)}</b></div>
      <div><span>Téléphone</span><b>${esc(bord.ownerPhone) || '—'}</b></div>
      <div><span>Email</span><b>${esc(bord.ownerEmail) || '—'}</b></div>
      <div><span>Banque</span><b>${esc(bord.ownerBank) || '—'}</b></div>
      <div><span>N° de compte</span><b>${esc(bord.ownerAccount) || '—'}</b></div>
      <div><span>Mode de versement</span><b>${esc(bord.paymentMode) || '—'}</b></div>
      <div><span>Référence transfert</span><b>${esc(bord.transferRef) || '—'}</b></div>
    </div>` : `
    <div class="meta">
      <div><span>Agence</span><b>${esc(bord.agence) || '—'}</b></div>
      <div><span>Caissier</span><b>${esc(bord.caissier) || '—'}</b></div>
      <div><span>Versé par</span><b>${esc(bord.createdBy?.userName) || '—'}</b></div>
      <div><span>Mode de versement</span><b>${esc(bord.paymentMode) || '—'}</b></div>
      <div><span>Banque</span><b>${esc(bord.bank) || '—'}</b></div>
      <div><span>Compte bénéficiaire</span><b>${esc(bord.beneficiaryAccount) || '—'}</b></div>
      <div><span>Référence bancaire</span><b>${esc(bord.bankRef) || '—'}</b></div>
    </div>`;

  const sigCells = [
    { k: 'caissier', label: 'Le Caissier' },
    { k: 'comptable', label: 'Le Comptable' },
    { k: 'directeur', label: 'Le Directeur' },
    ...(isProprio ? [{ k: 'proprietaire', label: 'Le Propriétaire' }] : []),
  ].map(s => `
    <div class="sig">
      ${bord.signatures?.[s.k] ? `<img src="${bord.signatures[s.k]}" alt="" />` : '<div class="sig-space"></div>'}
      <div class="sig-line"></div>
      <span>${s.label}</span>
    </div>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" />
  <title>${esc(bord.number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; padding: 28px; font-size: 12px; }
    .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #6d3b07; padding-bottom:14px; margin-bottom:16px; }
    .org-logo { max-height:64px; max-width:200px; object-fit:contain; }
    .brand { font-size:24px; font-weight:900; color:#6d3b07; }
    .org-info { font-size:11px; color:#6b7280; line-height:1.5; text-align:right; }
    h1 { font-size:15px; letter-spacing:.5px; text-align:center; margin:8px 0 4px; color:#6d3b07; }
    .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:700; }
    .center { text-align:center; margin-bottom:14px; }
    .ref { display:flex; justify-content:space-between; font-size:12px; margin-bottom:12px; }
    .ref b { font-size:14px; }
    .meta { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; background:#faf7f2; border:1px solid #ecdfce; border-radius:10px; padding:12px 16px; margin-bottom:16px; }
    .meta div { display:flex; justify-content:space-between; border-bottom:1px dotted #e5e7eb; padding:3px 0; }
    .meta span { color:#6b7280; }
    table { width:100%; border-collapse:collapse; margin-bottom:16px; }
    th, td { border:1px solid #e5e7eb; padding:6px 8px; text-align:left; }
    th { background:#6d3b07; color:#fff; font-size:10px; text-transform:uppercase; letter-spacing:.3px; }
    td.num { text-align:right; font-variant-numeric:tabular-nums; }
    td.strong { font-weight:700; }
    tr.totals td { background:#faf7f2; font-weight:800; }
    .obs { border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; margin-bottom:20px; font-size:11px; }
    .obs span { color:#6b7280; display:block; margin-bottom:3px; text-transform:uppercase; font-size:9px; letter-spacing:.4px; }
    .sigs { display:flex; gap:18px; justify-content:space-between; margin-top:24px; }
    .sig { flex:1; text-align:center; }
    .sig img { max-height:46px; max-width:130px; object-fit:contain; }
    .sig-space { height:46px; }
    .sig-line { border-top:1px solid #9ca3af; margin:4px 8px 4px; }
    .sig span { font-size:10px; color:#6b7280; }
    .foot { display:flex; justify-content:space-between; align-items:flex-end; margin-top:26px; border-top:1px solid #e5e7eb; padding-top:12px; }
    .qr { text-align:center; font-size:9px; color:#6b7280; }
    .qr img { width:88px; height:88px; }
    .stamp img { max-height:90px; opacity:.9; }
    @media print { body { padding:12px; } }
  </style></head><body>
    <div class="head">
      <div>${logo ? `<img src="${logo}" class="org-logo" alt="logo" />` : `<div class="brand">${esc(org.companyName || 'Minsouah')}</div>`}</div>
      <div class="org-info">
        <b>${esc(org.companyName || 'Minsouah Immobilier')}</b><br/>
        ${esc(org.address) || ''} ${esc(org.city) || ''}<br/>
        ${org.phone ? `Tél : ${esc(org.phone)}<br/>` : ''}
        ${org.email ? `${esc(org.email)}<br/>` : ''}
        ${org.rccm ? `RCCM : ${esc(org.rccm)}` : ''}
      </div>
    </div>

    <h1>${title}</h1>
    <div class="center"><span class="badge" style="background:${bord.status === 'Validé' ? '#dcfce7' : '#fef3c7'};color:${bord.status === 'Validé' ? '#166534' : '#92400e'}">${esc(bord.status)}</span></div>

    <div class="ref">
      <div>N° Bordereau<br/><b>${esc(bord.number)}</b></div>
      <div style="text-align:right">Date & heure<br/><b>${esc(bord.date)} ${esc(bord.time) || ''}</b></div>
    </div>

    ${headMeta}

    <table>
      <thead><tr>
        <th>#</th><th>Locataire</th><th>Bien / Appt.</th><th>Période</th><th>Payé le</th><th>Montant</th>
        ${isProprio ? '<th>Commission</th><th>Frais</th><th>Net à reverser</th>' : ''}
      </tr></thead>
      <tbody>${rows}${totalsRow}</tbody>
    </table>

    ${bord.observation ? `<div class="obs"><span>Observation</span>${esc(bord.observation)}</div>` : ''}

    <div class="sigs">${sigCells}</div>

    <div class="foot">
      <div class="stamp">${stamp ? `<img src="${stamp}" alt="cachet" />` : ''}</div>
      ${qr ? `<div class="qr"><img src="${qr}" alt="QR" /><br/>Vérifier l'authenticité<br/><b>${esc(bord.number)}</b></div>` : ''}
    </div>

    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
  </body></html>`;
}

export function openBordereauPrint(bord, orgSettings, qrDataUrl) {
  const html = buildBordereauHTML(bord, orgSettings, { qrDataUrl });
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}
