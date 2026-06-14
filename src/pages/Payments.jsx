import { useState, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import SearchSelect from '../components/SearchSelect';
import SignaturePad from '../components/SignaturePad';
import { buildReceiptHTML as buildReceiptHTMLShared } from '../lib/quittanceReport';
import { sendEmail, buildReminderHtml } from '../lib/email';

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const phoneForWA = raw => { const d = (raw || '').replace(/\D/g, ''); if (!d) return ''; return d.startsWith('225') ? d : '225' + (d.startsWith('0') ? d.slice(1) : d); };

const statusColor = {
  'Payé':      'text-green-700 bg-green-100',
  'Impayé':    'text-red-700 bg-red-100',
  'En retard': 'text-amber-700 bg-amber-100',
  'Annulé':    'text-on-surface-variant bg-surface-container',
};
const statusIcon = { 'Payé': 'check_circle', 'Impayé': 'cancel', 'En retard': 'schedule', 'Annulé': 'block' };

/* ── Receipt HTML ─────────────────────────────────────────────────────────── */
function buildReceiptHTML(payment, orgSettings, signatures = {}) {
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
      <div class="party-detail">${org.address || 'Abidjan, Côte d\'Ivoire'}</div>
    </div>
    <div class="party">
      <div class="party-title">Locataire</div>
      <div class="party-name">${payment.tenantName}</div>
      <div class="party-detail">
        ${payment.tenantEmail ? payment.tenantEmail + '<br>' : ''}
        ${payment.tenantPhone || ''}
      </div>
    </div>
  </div>

  <div class="amount-box">
    <div class="amount-label">Loyer reçu pour la période de</div>
    <div class="amount-period">${payment.month}</div>
    <div class="amount-value">${Number(payment.amount).toLocaleString('fr-FR')} FCFA</div>
  </div>

  <div class="details">
    <div class="details-row"><span>Propriété</span><span>${payment.propertyName}</span></div>
    <div class="details-row"><span>Période couverte</span><span>${payment.month}</span></div>
    <div class="details-row"><span>Date d'échéance</span><span>${payment.dueDate || '—'}</span></div>
    <div class="details-row"><span>Date de paiement</span><span>${payment.paidDate || today}</span></div>
    <div class="details-row"><span>Mode de paiement</span><span>${payment.method || 'Espèces'}</span></div>
    <div class="details-row"><span>Référence</span><span>${receiptNum}</span></div>
    <div class="details-row"><span>Statut</span><span style="color:#166534;font-weight:700">✓ Paiement confirmé</span></div>
  </div>

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-line">
        ${signatures.bailleur ? `<img src="${signatures.bailleur}" alt="signature bailleur" />` : ''}
      </div>
      <div class="sig-label">Signature du Bailleur</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">
        ${signatures.locataire ? `<img src="${signatures.locataire}" alt="signature locataire" />` : ''}
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

/* ── Monthly Report HTML ──────────────────────────────────────────────────── */
function buildReportHTML(month, paid, unpaid, orgSettings, allPayments = []) {
  const org = orgSettings || {};
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const totalCollected = paid.reduce((s, p) => s + (p.amount || 0), 0);
  const totalUnpaid   = unpaid.reduce((s, p) => s + (p.amount || 0), 0);
  const total  = totalCollected + totalUnpaid;
  const rateAmt = total > 0 ? Math.round(totalCollected / total * 100) : 0;
  const rateCnt = (paid.length + unpaid.length) > 0 ? Math.round(paid.length / (paid.length + unpaid.length) * 100) : 0;
  const rateColor = rateAmt >= 80 ? '#15803d' : rateAmt >= 50 ? '#b45309' : '#b91c1c';

  /* ── Donut SVG ── */
  const R = 70; const CX = 90; const CY = 90;
  const circ = +(2 * Math.PI * R).toFixed(2);
  const paidArc = total > 0 ? +((totalCollected / total) * circ).toFixed(2) : 0;
  const donutSVG = `<svg viewBox="0 0 180 180" width="180" height="180">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#fecaca" stroke-width="26"/>
    ${paidArc > 0 ? `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#4ade80" stroke-width="26"
      stroke-dasharray="${paidArc} ${circ}" transform="rotate(-90 ${CX} ${CY})"/>` : ''}
    <text x="${CX}" y="${CY - 6}" text-anchor="middle" font-size="30" font-weight="900" fill="${rateColor}">${rateAmt}%</text>
    <text x="${CX}" y="${CY + 14}" text-anchor="middle" font-size="11" fill="#888">Encaissé</text>
    <text x="${CX}" y="${CY + 30}" text-anchor="middle" font-size="10" fill="#bbb">${paid.length} / ${paid.length + unpaid.length} dossiers</text>
  </svg>`;

  /* ── Property horizontal bar chart SVG ── */
  const propData = {};
  [...paid, ...unpaid].forEach(p => {
    const k = p.propertyName || 'Inconnu';
    if (!propData[k]) propData[k] = { paid: 0, unpaid: 0 };
    if (p.status === 'Payé') propData[k].paid += (p.amount || 0);
    else propData[k].unpaid += (p.amount || 0);
  });
  const propItems = Object.entries(propData)
    .sort((a, b) => (b[1].paid + b[1].unpaid) - (a[1].paid + a[1].unpaid))
    .slice(0, 8);
  const maxProp = Math.max(...propItems.map(([, v]) => v.paid + v.unpaid), 1);
  const BH = 22; const BG = 9; const LW = 145; const PW = 220;
  const propChartH = propItems.length * (BH + BG) + 28;
  const propBars = propItems.map(([name, vals], i) => {
    const y = 8 + i * (BH + BG);
    const pW = vals.paid   > 0 ? Math.max(Math.round((vals.paid   / maxProp) * PW), 3) : 0;
    const uW = vals.unpaid > 0 ? Math.max(Math.round((vals.unpaid / maxProp) * PW), 3) : 0;
    const short = name.length > 22 ? name.slice(0, 22) + '…' : name;
    return `<text x="${LW - 5}" y="${y + 15}" text-anchor="end" font-size="10" fill="#555">${short}</text>
    ${pW ? `<rect x="${LW}" y="${y}" width="${pW}" height="${BH}" fill="#4ade80" rx="3"/>` : ''}
    ${uW ? `<rect x="${LW + pW}" y="${y}" width="${uW}" height="${BH}" fill="#fca5a5" rx="3"/>` : ''}
    <text x="${LW + pW + uW + 5}" y="${y + 15}" font-size="9" fill="#999">${Number(vals.paid + vals.unpaid).toLocaleString('fr-FR')}</text>`;
  }).join('');
  const propSVG = propItems.length > 0 ? `<svg viewBox="0 0 ${LW + PW + 80} ${propChartH}" width="100%" height="${propChartH}">
    ${propBars}
    <text x="${LW}" y="${propChartH - 2}" font-size="9" fill="#4ade80">■</text>
    <text x="${LW + 12}" y="${propChartH - 2}" font-size="9" fill="#888">Payé</text>
    <text x="${LW + 55}" y="${propChartH - 2}" font-size="9" fill="#fca5a5">■</text>
    <text x="${LW + 67}" y="${propChartH - 2}" font-size="9" fill="#888">Impayé</text>
  </svg>` : '<p style="color:#bbb;font-size:11px;padding:8px 0">Aucune donnée</p>';

  /* ── Trend line chart (6 months) ── */
  const [mName0, mYear0] = month.split(' ');
  const mIdx0 = MONTH_NAMES.indexOf(mName0);
  const mY0   = parseInt(mYear0);
  const trendMonths = Array.from({ length: 6 }, (_, k) => {
    let idx = mIdx0 - (5 - k), y = mY0;
    if (idx < 0) { idx += 12; y--; }
    return `${MONTH_NAMES[idx]} ${y}`;
  });
  const trendData = trendMonths.map(m => {
    const ps = allPayments.filter(p => p.month === m);
    const pA = ps.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
    const tA = ps.reduce((s, p) => s + (p.amount || 0), 0);
    return { label: m, rate: tA > 0 ? Math.round(pA / tA * 100) : null, collected: pA, total: tA };
  });
  const TW = 520; const TH = 165;
  const pL = 40; const pR = 20; const pT = 18; const pB = 38;
  const plotW = TW - pL - pR; const plotH = TH - pT - pB;
  const tPts = trendData.map((d, i) => ({ x: pL + (i / 5) * plotW, y: d.rate !== null ? pT + plotH - (d.rate / 100) * plotH : null, d }));
  const validPts = tPts.filter(p => p.y !== null);
  const linePath = validPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = validPts.length > 0
    ? `M${validPts[0].x.toFixed(1)},${(pT + plotH).toFixed(1)} ` + validPts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${validPts[validPts.length-1].x.toFixed(1)},${(pT + plotH).toFixed(1)}Z` : '';
  const gridLines = [0, 25, 50, 75, 100].map(v => {
    const gy = pT + plotH - (v / 100) * plotH;
    return `<line x1="${pL}" y1="${gy.toFixed(1)}" x2="${pL + plotW}" y2="${gy.toFixed(1)}" stroke="#f0ece6" stroke-width="1"/>
    <text x="${pL - 4}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#ccc">${v}%</text>`;
  }).join('');
  const trendDots = tPts.map(({ x, y, d }) => {
    const isCur = d.label === month;
    const dotColor = d.rate === null ? '#e5e7eb' : d.rate >= 80 ? '#4ade80' : d.rate >= 50 ? '#fbbf24' : '#f87171';
    const yPos = y !== null ? y : pT + plotH;
    const [mn, yr] = d.label.split(' ');
    return `<circle cx="${x.toFixed(1)}" cy="${yPos.toFixed(1)}" r="${isCur ? 6 : 4}"
      fill="${isCur ? '#785a00' : dotColor}" stroke="${isCur ? '#5a4300' : '#fff'}" stroke-width="${isCur ? 2 : 1.5}"/>
    ${d.rate !== null ? `<text x="${x.toFixed(1)}" y="${(yPos - 9).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="${isCur ? 700 : 400}" fill="${isCur ? '#785a00' : '#888'}">${d.rate}%</text>` : ''}
    <text x="${x.toFixed(1)}" y="${(TH - 3).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="${isCur ? '#785a00' : '#bbb'}" font-weight="${isCur ? 700 : 400}">${mn.slice(0,3)} ${yr.slice(2)}</text>`;
  }).join('');
  const trendSVG = `<svg viewBox="0 0 ${TW} ${TH}" width="100%" height="${TH}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#785a00" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#785a00" stop-opacity="0.01"/>
    </linearGradient></defs>
    ${gridLines}
    <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT + plotH}" stroke="#e8d5b7" stroke-width="1"/>
    ${areaPath ? `<path d="${areaPath}" fill="url(#ag)"/>` : ''}
    ${linePath ? `<path d="${linePath}" fill="none" stroke="#785a00" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    ${trendDots}
  </svg>`;

  /* ── Tables ── */
  const fCFA = n => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
  const paidRows = paid.map(p => `<tr>
    <td>${p.propertyName || '—'}</td><td>${p.tenantName || '—'}</td>
    <td style="text-align:right;font-weight:700;color:#15803d">${fCFA(p.amount)}</td>
    <td>${p.paidDate || '—'}</td><td style="text-align:center">${p.method || '—'}</td>
  </tr>`).join('');
  const unpaidRows = unpaid.map(p => `<tr>
    <td>${p.propertyName || '—'}</td><td>${p.tenantName || '—'}</td>
    <td style="text-align:right;font-weight:700;color:#b91c1c">${fCFA(p.amount)}</td>
    <td>${p.dueDate || '—'}</td>
    <td style="text-align:center;font-weight:600;color:${p.status === 'En retard' ? '#92400e' : '#b91c1c'}">${p.status || 'Impayé'}</td>
  </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><title>Rapport Financier — ${month}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1c1b19;background:#fff;font-size:13px}
.page{max-width:900px;margin:0 auto;padding:36px 40px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #785a00;padding-bottom:16px;margin-bottom:22px}
.brand{font-size:24px;font-weight:900;color:#785a00;letter-spacing:-0.5px}
.brand-sub{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:2px;margin-top:3px}
.report-meta{text-align:right}
.report-meta h1{font-size:16px;font-weight:800}
.report-meta p{font-size:11px;color:#aaa;margin-top:3px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
.kpi{background:#fafaf8;border:1px solid #ede8e0;border-radius:12px;padding:14px 12px}
.kpi-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:7px}
.kpi-v{font-size:18px;font-weight:800;line-height:1}
.kpi-s{font-size:10px;color:#bbb;margin-top:5px}
.charts-row{display:grid;grid-template-columns:200px 1fr;gap:16px;margin-bottom:16px;align-items:start}
.chart-box{background:#fafaf8;border:1px solid #ede8e0;border-radius:12px;padding:14px}
.chart-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin-bottom:10px}
.trend-box{background:#fafaf8;border:1px solid #ede8e0;border-radius:12px;padding:14px;margin-bottom:22px}
.section-title{font-size:13px;font-weight:700;margin:0 0 9px;display:flex;align-items:center;gap:8px}
.badge{display:inline-flex;align-items:center;justify-content:center;padding:1px 7px;border-radius:99px;font-size:10px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:22px}
thead th{background:#785a00;color:#fff;padding:8px 11px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px}
tbody td{padding:8px 11px;border-bottom:1px solid #f5f0ea}
tbody tr:last-child td{border-bottom:none}
tbody tr:nth-child(even){background:#fdf9f5}
.footer{border-top:1px solid #ede8e0;padding-top:11px;margin-top:4px;display:flex;justify-content:space-between;font-size:10px;color:#ccc}
@media print{.page{padding:18px 22px}.kpis{gap:8px}.kpi{padding:10px 9px}.kpi-v{font-size:15px}}
</style></head>
<body><div class="page">

<div class="header">
  <div><div class="brand">${org.companyName || 'Minsouah'}</div><div class="brand-sub">Gestion Immobilière</div></div>
  <div class="report-meta">
    <h1>Rapport Financier — ${month}</h1>
    <p>Généré le ${today}</p>
    <p style="margin-top:2px">${paid.length + unpaid.length} dossier(s) · ${paid.length} payé(s) · ${unpaid.length} impayé(s)</p>
  </div>
</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-l">Loyers attendus</div><div class="kpi-v" style="color:#785a00">${Number(total).toLocaleString('fr-FR')}</div><div class="kpi-s">FCFA</div></div>
  <div class="kpi"><div class="kpi-l">Encaissé</div><div class="kpi-v" style="color:#15803d">${Number(totalCollected).toLocaleString('fr-FR')}</div><div class="kpi-s">FCFA · ${paid.length} locataire(s)</div></div>
  <div class="kpi"><div class="kpi-l">Impayés</div><div class="kpi-v" style="color:#b91c1c">${Number(totalUnpaid).toLocaleString('fr-FR')}</div><div class="kpi-s">FCFA · ${unpaid.length} locataire(s)</div></div>
  <div class="kpi"><div class="kpi-l">Recouvrement</div><div class="kpi-v" style="color:${rateColor}">${rateAmt}%</div><div class="kpi-s">${rateCnt}% des dossiers</div></div>
</div>

<div class="charts-row">
  <div class="chart-box" style="text-align:center">
    <div class="chart-title">Répartition</div>
    ${donutSVG}
    <div style="font-size:10px;margin-top:6px;color:#15803d">■ Encaissé : ${Number(totalCollected).toLocaleString('fr-FR')} FCFA</div>
    <div style="font-size:10px;margin-top:3px;color:#b91c1c">■ Impayé : ${Number(totalUnpaid).toLocaleString('fr-FR')} FCFA</div>
  </div>
  <div class="chart-box">
    <div class="chart-title">Par propriété</div>
    ${propSVG}
  </div>
</div>

<div class="trend-box">
  <div class="chart-title">Évolution du taux de recouvrement — 6 derniers mois</div>
  ${trendSVG}
</div>

${paid.length > 0 ? `<div class="section-title" style="color:#15803d">✓ Paiements reçus <span class="badge" style="background:#dcfce7;color:#15803d">${paid.length}</span><span style="font-weight:400;font-size:11px;color:#999">— ${Number(totalCollected).toLocaleString('fr-FR')} FCFA</span></div>
<table><thead><tr><th>Propriété</th><th>Locataire</th><th style="text-align:right">Montant</th><th>Payé le</th><th style="text-align:center">Mode</th></tr></thead>
<tbody>${paidRows}</tbody></table>` : ''}

${unpaid.length > 0 ? `<div class="section-title" style="color:#b91c1c">⚠ Loyers impayés / en retard <span class="badge" style="background:#fee2e2;color:#b91c1c">${unpaid.length}</span><span style="font-weight:400;font-size:11px;color:#999">— ${Number(totalUnpaid).toLocaleString('fr-FR')} FCFA</span></div>
<table><thead><tr><th>Propriété</th><th>Locataire</th><th style="text-align:right">Montant dû</th><th>Échéance</th><th style="text-align:center">Statut</th></tr></thead>
<tbody>${unpaidRows}</tbody></table>` : ''}

<div class="footer"><span>${org.companyName || 'Minsouah'} — Document confidentiel</span><span>${today} · ${month}</span></div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

/* ── Local primitives ────────────────────────────────────────────────────── */
function Btn({ children, onClick, disabled, variant = 'primary', icon, small }) {
  const base = 'inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors focus:outline-none';
  const size = small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const colors = variant === 'primary'
    ? 'bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40'
    : variant === 'danger'
    ? 'bg-red-100 text-red-700 hover:bg-red-200'
    : variant === 'green'
    ? 'bg-green-100 text-green-700 hover:bg-green-200'
    : variant === 'amber'
    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
    : 'bg-surface-container-high text-on-surface hover:bg-outline-variant/30';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${size} ${colors}`}>
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

function ModalWrap({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className={`bg-surface w-full ${widths[size]} rounded-2xl shadow-2xl flex flex-col max-h-[90vh]`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
          <h3 className="font-semibold text-on-surface text-base">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-outline-variant/30 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary';

/* ── Main component ─────────────────────────────────────────────────────── */
export default function Payments() {
  const { state, dispatch } = useApp();
  const { payments = [], properties = [], tenants = [], contracts = [], transactions = [], orgSettings } = state;

  const now = new Date();
  const currentMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const todayDay = now.getDate();
  const isReminderPeriod = todayDay >= 1 && todayDay <= 10;
  const isAfterDeadline = todayDay > 10;

  const [tab, setTab] = useState('payments');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthLabel);
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [search, setSearch] = useState('');
  const [filterPropKey, setFilterPropKey] = useState('');
  const [filterTenantId, setFilterTenantId] = useState('');

  /* ── Payment modal ── */
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces' });
  const [quittancePayment, setQuittancePayment] = useState(null);

  /* ── Edit / delete / cancel modals ── */
  const [editModal, setEditModal]     = useState(null); // payment object
  const [editForm, setEditForm]       = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // payment object

  /* ── Reminder modal ── */
  const [reminderModal, setReminderModal] = useState(null);

  /* ── Compute next payment date for quittance ── */
  const computeNextPaymentDate = useCallback((payment) => {
    const tenant = (tenants || []).find(t => String(t.id) === String(payment.tenantId));
    const dueDay = parseInt(tenant?.paymentDueDay || '5', 10);
    const parts = (payment.month || '').split(' ');
    const mIdx = MONTH_NAMES.indexOf(parts[0]);
    const yr = parseInt(parts[1], 10);
    if (mIdx === -1 || isNaN(yr)) return null;
    const nextMIdx = (mIdx + 1) % 12;
    const nextYr = mIdx === 11 ? yr + 1 : yr;
    return `${dueDay} ${MONTH_NAMES[nextMIdx]} ${nextYr}`;
  }, [tenants]);

  /* ── All months: 24 months back → 12 months ahead + any existing payment months ── */
  const allMonths = useMemo(() => {
    const set = new Set();
    const ref = new Date();
    for (let i = -24; i <= 12; i++) {
      const d = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
      set.add(`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
    }
    payments.forEach(p => { if (p.month) set.add(p.month); });
    return [...set].sort((a, b) => {
      const [am, ay] = a.split(' ');
      const [bm, by] = b.split(' ');
      return by - ay || MONTH_NAMES.indexOf(bm) - MONTH_NAMES.indexOf(am);
    });
  }, [payments, currentMonthLabel]);

  /* ── Flatten all properties (buildings → units + standalone) ── */
  const allPropertyOptions = useMemo(() => {
    const opts = [];
    (properties || []).forEach(prop => {
      if (prop.isBuilding && prop.units?.length > 0) {
        prop.units.forEach(unit => {
          // Include floor in label to match the format stored in contracts (created in Rental.jsx)
          const unitLabel = unit.floor
            ? `${prop.name} — ${unit.number} (${unit.floor})`
            : `${prop.name} — ${unit.number}`;
          opts.push({
            value: `${prop.id}::${unit.id}`,
            label: unitLabel,
            propertyName: unitLabel,
            buildingId: prop.id,
            buildingName: prop.name,
            unitId: unit.id,
            rent: unit.rent,
            isUnit: true,
          });
        });
      } else {
        opts.push({
          value: String(prop.id),
          label: prop.name,
          propertyName: prop.name,
          buildingId: prop.id,
          rent: prop.rent,
          isUnit: false,
        });
      }
    });
    return opts;
  }, [properties]);

  /* ── Tenants matching the selected property, excluding already paid this month ── */
  const matchingTenants = useMemo(() => {
    // Tenants who already have a "Payé" payment for the selected month
    const paidThisMonth = new Set(
      (payments || [])
        .filter(p => p.month === payForm.month && p.status === 'Payé')
        .flatMap(p => [String(p.tenantId), (p.tenantName || '').toLowerCase()])
        .filter(Boolean)
    );
    const alreadyPaid = t => {
      const name = (t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim()).toLowerCase();
      return paidThisMonth.has(String(t.id)) || paidThisMonth.has(name);
    };

    if (!payForm.propertyKey) return (tenants || []).filter(t => !alreadyPaid(t));
    const selected = allPropertyOptions.find(o => o.value === payForm.propertyKey);
    if (!selected) return (tenants || []).filter(t => !alreadyPaid(t));

    const matched = (tenants || []).filter(t => {
      if (alreadyPaid(t)) return false;
      const tName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
      const viaContract = (contracts || []).some(c => {
        if (c.status !== 'Actif') return false;
        const tenantMatch = c.tenantId === t.id || c.tenant === tName;
        const propMatch =
          c.propertyName === selected.propertyName ||
          c.propertyName === selected.buildingName ||
          String(c.propertyId) === String(selected.buildingId) ||
          (selected.isUnit && String(c.buildingId) === String(selected.buildingId));
        return tenantMatch && propMatch;
      });
      const directMatch =
        (t.property || '').includes(selected.buildingName) ||
        (t.property || '').includes(selected.propertyName);
      return viaContract || directMatch;
    });
    return matched;
  }, [payForm.propertyKey, payForm.month, allPropertyOptions, tenants, contracts, payments]);

  /* ── Filtered payments (main tab) ── */
  /* ── Tenants list for the tracking filter (no paid exclusion) ── */
  const filterTenants = useMemo(() => {
    if (!filterPropKey) return tenants || [];
    const opt = allPropertyOptions.find(o => o.value === filterPropKey);
    if (!opt) return tenants || [];
    return (tenants || []).filter(t => {
      const tName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
      const via = (contracts || []).some(c =>
        (c.tenantId === t.id || c.tenant === tName) &&
        (c.propertyName === opt.propertyName || c.propertyName === opt.buildingName ||
          String(c.propertyId) === String(opt.buildingId) ||
          (opt.isUnit && String(c.buildingId) === String(opt.buildingId)))
      );
      return via || (t.property || '').includes(opt.buildingName || '') || (t.property || '').includes(opt.propertyName || '');
    });
  }, [filterPropKey, allPropertyOptions, tenants, contracts]);

  const filtered = useMemo(() => payments.filter(p => {
    const matchMonth = p.month === selectedMonth;
    const matchStatus = statusFilter === 'Tous' || p.status === statusFilter;
    const matchSearch = !search ||
      (p.propertyName || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.tenantName || '').toLowerCase().includes(search.toLowerCase());
    const matchProp = !filterPropKey || (() => {
      const opt = allPropertyOptions.find(o => o.value === filterPropKey);
      if (!opt) return true;
      const pn = (p.propertyName || '').toLowerCase();
      return pn === (opt.propertyName || '').toLowerCase() ||
        pn === (opt.buildingName || '').toLowerCase() ||
        pn.includes((opt.buildingName || '').toLowerCase()) ||
        pn.includes((opt.propertyName || '').toLowerCase());
    })();
    const matchTenant = !filterTenantId || String(p.tenantId) === String(filterTenantId);
    return matchMonth && matchStatus && matchSearch && matchProp && matchTenant;
  }), [payments, selectedMonth, statusFilter, search, filterPropKey, filterTenantId, allPropertyOptions]);

  /* ── Stats for selected month ── */
  const monthPmts = payments.filter(p => p.month === selectedMonth);
  const totalExpected = monthPmts.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCollected = monthPmts.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = monthPmts.filter(p => p.status !== 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const recoveryRate = monthPmts.length ? Math.round(monthPmts.filter(p => p.status === 'Payé').length / monthPmts.length * 100) : 0;

  /* ── Current month unpaid (for Rappels tab) ── */
  const currentMonthUnpaid = useMemo(() =>
    payments.filter(p => p.month === currentMonthLabel && p.status !== 'Payé'),
    [payments, currentMonthLabel]
  );

  /* ── Report month payments ── */
  const reportPaid = monthPmts.filter(p => p.status === 'Payé');
  const reportUnpaid = monthPmts.filter(p => p.status !== 'Payé');

  /* ── Shared helpers for contract-based auto-fill ── */
  // Contracts store tenant as a name string (not ID) and propertyName as the full label.
  // We match by propertyName first (exact, includes unit number) to avoid cross-unit confusion.
  // Flexible name match: handles floor suffix differences ("Apt 3B" vs "Apt 3B (RDC)")
  const propNameMatch = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    return a.startsWith(b + ' (') || b.startsWith(a + ' (');
  };

  const contractByProp = (opt) => {
    if (!opt) return null;
    return (contracts || []).find(c =>
      (c.status === 'Actif' || c.status === 'Expirant') &&
      propNameMatch(c.propertyName, opt.propertyName)
    ) || (!opt.isUnit && (contracts || []).find(c =>
      (c.status === 'Actif' || c.status === 'Expirant') &&
      propNameMatch(c.propertyName, opt.buildingName)
    )) || null;
  };

  const tenantFromContract = (c) => {
    if (!c) return null;
    return (tenants || []).find(t =>
      (t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim()) === c.tenant ||
      (c.tenantId && String(t.id) === String(c.tenantId))
    ) || null;
  };

  const propOptFromContract = (c) => {
    if (!c) return null;
    return allPropertyOptions.find(o => propNameMatch(o.propertyName, c.propertyName))
      || allPropertyOptions.find(o => !o.isUnit && propNameMatch(o.buildingName, c.propertyName))
      || null;
  };

  /* ── Handlers ── */
  const handlePropertySelect = (val) => {
    const opt = allPropertyOptions.find(o => o.value === val);
    const contract = contractByProp(opt);
    const match = tenantFromContract(contract);
    setPayForm(f => ({ ...f, propertyKey: val, tenantId: match ? String(match.id) : '', amount: opt?.rent || '' }));
  };

  const handleTenantSelect = (val) => {
    if (!val) { setPayForm(f => ({ ...f, tenantId: '' })); return; }
    if (!payForm.propertyKey) {
      const tenant = (tenants || []).find(t => String(t.id) === String(val));
      const tenantName = tenant ? (tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim()) : '';
      const contract = (contracts || []).find(c =>
        (c.status === 'Actif' || c.status === 'Expirant') &&
        (c.tenant === tenantName || (c.tenantId && String(c.tenantId) === String(val)))
      );
      const matchOpt = propOptFromContract(contract);
      if (matchOpt) {
        setPayForm(f => ({ ...f, tenantId: val, propertyKey: matchOpt.value, amount: matchOpt.rent || f.amount }));
        return;
      }
    }
    setPayForm(f => ({ ...f, tenantId: val }));
  };

  /* ── Tracking filter: bidirectional auto-fill ── */
  const handleFilterPropSelect = (val) => {
    let autoTenantId = '';
    if (val) {
      const opt = allPropertyOptions.find(o => o.value === val);
      const contract = contractByProp(opt);
      const match = tenantFromContract(contract);
      if (match) autoTenantId = String(match.id);
    }
    setFilterPropKey(val);
    setFilterTenantId(autoTenantId);
  };

  const handleFilterTenantSelect = (val) => {
    setFilterTenantId(val);
    if (val && !filterPropKey) {
      const tenant = (tenants || []).find(t => String(t.id) === String(val));
      const tenantName = tenant ? (tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim()) : '';
      const contract = (contracts || []).find(c =>
        (c.status === 'Actif' || c.status === 'Expirant') &&
        (c.tenant === tenantName || (c.tenantId && String(c.tenantId) === String(val)))
      );
      const matchOpt = propOptFromContract(contract);
      if (matchOpt) setFilterPropKey(matchOpt.value);
    }
  };

  const handleSavePayment = () => {
    const opt = allPropertyOptions.find(o => o.value === payForm.propertyKey);
    const tenant = (tenants || []).find(t => String(t.id) === String(payForm.tenantId));
    const today = new Date().toLocaleDateString('fr-CI');
    const tenantFullName = tenant ? (tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim()) : '';
    // Find matching contract: prefer one that also matches the property
    const matchingContract = (contracts || []).find(c =>
      (String(c.tenantId) === String(payForm.tenantId) || c.tenant === tenantFullName) &&
      (c.status === 'Actif' || c.status === 'Expirant') &&
      (opt ? (String(c.propertyId) === String(opt.buildingId) || c.propertyName === opt.propertyName || c.propertyName === opt.buildingName) : true)
    ) || (contracts || []).find(c =>
      String(c.tenantId) === String(payForm.tenantId) || c.tenant === tenantFullName
    );
    // Look up property for ownerId
    const linkedProp = opt ? (properties || []).find(p =>
      p.id === opt.buildingId || Number(p.id) === Number(opt.buildingId)
    ) : null;
    const newPayment = {
      propertyName: opt?.propertyName || payForm.propertyKey,
      tenantName: tenantFullName,
      tenantEmail: tenant?.email || '',
      tenantPhone: tenant?.phone || '',
      tenantId: tenant?.id || null,
      contractId: matchingContract?.id || null,
      ownerId: linkedProp?.ownerId || matchingContract?.ownerId || null,
      ownerName: linkedProp?.owner || matchingContract?.ownerName || null,
      amount: parseFloat(payForm.amount) || 0,
      month: payForm.month,
      dueDate: payForm.dueDate,
      method: payForm.method,
      status: 'Payé',
      paidDate: today,
      reminderSent: false,
      reminderCount: 0,
    };
    dispatch({ type: 'ADD_PAYMENT', payload: newPayment });
    setPayModal(false);
    setPayForm({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces' });
    setQuittancePayment(newPayment);
  };

  const handleMarkPaid = (id) => dispatch({ type: 'MARK_PAYMENT_PAID', payload: id });
  const handleReminder = (p) => { dispatch({ type: 'SEND_REMINDER', payload: p.id }); setReminderModal(null); };

  const openEdit = (p) => {
    setEditForm({ amount: p.amount, dueDate: p.dueDate || '', month: p.month, method: p.method || 'Espèces', status: p.status });
    setEditModal(p);
  };
  const saveEdit = () => {
    dispatch({ type: 'UPDATE_PAYMENT', payload: { ...editModal, ...editForm, amount: parseFloat(editForm.amount) || 0 } });
    setEditModal(null);
  };
  const handleCancel = (p) => {
    dispatch({ type: 'UPDATE_PAYMENT', payload: { ...p, status: 'Annulé', paidDate: null } });
  };
  const handleDelete = () => {
    dispatch({ type: 'DELETE_PAYMENT', payload: deleteConfirm.id });
    setDeleteConfirm(null);
  };

  /* ── Quittance / Signature state ── */
  const [receiptTab, setReceiptTab]       = useState('preview');
  const [signatures, setSignatures]       = useState({ bailleur: null, locataire: null });
  const [sigBailleur, setSigBailleur]     = useState(false);
  const [sigLocataire, setSigLocataire]   = useState(false);
  const sigBailleurRef                    = useRef(null);
  const sigLocataireRef                   = useRef(null);

  const openReceipt = useCallback((payment) => {
    setQuittancePayment(payment);
    setReceiptTab('preview');
    setSignatures({ bailleur: null, locataire: null });
    setSigBailleur(false);
    setSigLocataire(false);
  }, []);

  const handleConfirmSignatures = useCallback(() => {
    const bailleur  = sigBailleurRef.current?.getDataURL() || null;
    const locataire = sigLocataireRef.current?.getDataURL() || null;
    setSignatures({ bailleur, locataire });
    setReceiptTab('send');
  }, []);

  const printReceipt = useCallback(() => {
    if (signatures.bailleur || signatures.locataire) {
      dispatch({ type: 'UPDATE_PAYMENT', payload: { ...quittancePayment, signatures } });
    }
    const nextDate = computeNextPaymentDate(quittancePayment);
    const html = buildReceiptHTMLShared(quittancePayment, orgSettings, signatures, nextDate);
    const win = window.open('', '_blank', 'width=820,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  }, [quittancePayment, orgSettings, signatures, dispatch, computeNextPaymentDate]);

  const whatsappReceipt = useCallback(() => {
    const phone = phoneForWA(quittancePayment?.tenantPhone);
    if (!phone) { alert('Numéro de téléphone manquant pour ce locataire.'); return; }
    const msg = encodeURIComponent(
      `Bonjour ${quittancePayment?.tenantName},\n\nVotre quittance de loyer pour ${quittancePayment?.month} d'un montant de ${fmt(quittancePayment?.amount)} a bien été enregistrée.${signatures.bailleur ? '\n✅ Quittance signée numériquement.' : ''}\nMerci pour votre paiement.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
  }, [quittancePayment, orgSettings, signatures]);

  const emailReceipt = useCallback(() => {
    const email = quittancePayment?.tenantEmail || '';
    const subject = encodeURIComponent(`Quittance de loyer — ${quittancePayment?.month}`);
    const body = encodeURIComponent(
      `Bonjour ${quittancePayment?.tenantName},\n\nVeuillez trouver ci-joint votre quittance de loyer pour la période de ${quittancePayment?.month}.\n\nMontant : ${fmt(quittancePayment?.amount)}\nPropriété : ${quittancePayment?.propertyName}\n\nCordialement,\n${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }, [quittancePayment, orgSettings]);

  const handlePrintReport = () => {
    const html = buildReportHTML(selectedMonth, reportPaid, reportUnpaid, orgSettings, payments);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const sendWhatsAppReminder = (p) => {
    const phone = phoneForWA(p.tenantPhone);
    if (!phone) { alert('Numéro de téléphone manquant pour ce locataire.'); return; }
    const msg = encodeURIComponent(
      `Bonjour ${p.tenantName},\n\nNous vous rappelons que votre loyer de ${fmt(p.amount)} pour ${p.month} est en attente de règlement.\nPropriété : ${p.propertyName}\n\nMerci de procéder au paiement dès que possible.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    dispatch({ type: 'SEND_REMINDER', payload: p.id });
  };

  const sendEmailReminder = async (p) => {
    const email = p.tenantEmail || '';
    if (!email) { alert('Adresse email manquante pour ce locataire.'); return; }
    const companyName = orgSettings?.companyName || 'Minsouah Immobilier';
    const { ok } = await sendEmail({
      to: email,
      subject: `Rappel de loyer — ${p.month}`,
      html: buildReminderHtml({
        tenantName: p.tenantName,
        amount: p.amount,
        month: p.month,
        propertyName: p.propertyName,
        companyName,
      }),
    });
    if (!ok) {
      // Fallback gracieux si Firestore indisponible
      const subject = encodeURIComponent(`Rappel de loyer — ${p.month}`);
      const body = encodeURIComponent(`Bonjour ${p.tenantName},\n\nVotre loyer de ${fmt(p.amount)} pour ${p.month} n'a pas été reçu.\nPropriété : ${p.propertyName}\n\nCordialement,\n${companyName}`);
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    }
    dispatch({ type: 'SEND_REMINDER', payload: p.id });
  };

  const sendBulkReminders = () => {
    currentMonthUnpaid.forEach((p, i) => {
      const phone = phoneForWA(p.tenantPhone);
      if (phone) {
        const msg = encodeURIComponent(
          `Bonjour ${p.tenantName},\n\nNous vous rappelons que votre loyer de ${fmt(p.amount)} pour ${p.month} est en attente de règlement.\nPropriété : ${p.propertyName}\n\nMerci de procéder au paiement avant le 10 du mois.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
        );
        setTimeout(() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank'), i * 600);
      }
      dispatch({ type: 'SEND_REMINDER', payload: p.id });
    });
  };

  const sendBulkPenalties = () => {
    currentMonthUnpaid.forEach((p, i) => {
      const phone = phoneForWA(p.tenantPhone);
      const penalty = Math.round((p.amount || 0) * 0.10);
      if (phone) {
        const msg = encodeURIComponent(
          `Bonjour ${p.tenantName},\n\nSans nouvelles de votre paiement de loyer pour ${p.month}, une pénalité de 10% a été appliquée.\n\n• Loyer dû : ${fmt(p.amount)}\n• Pénalité (10%) : ${fmt(penalty)}\n• Total à régler : ${fmt((p.amount || 0) + penalty)}\n\nPropriété : ${p.propertyName}\n\nMerci de régulariser sans délai.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
        );
        setTimeout(() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank'), i * 600);
      }
      dispatch({ type: 'SEND_REMINDER', payload: p.id });
    });
  };

  const TABS = [
    { id: 'payments', label: 'Paiements', icon: 'payments' },
    { id: 'reminders', label: 'Rappels du mois', icon: 'notifications_active', badge: currentMonthUnpaid.length },
    { id: 'report', label: 'Rapport mensuel', icon: 'bar_chart' },
  ];

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* ── Header ── */}
      <div className="flex flex-wrap gap-sm items-center justify-between">
        <div className="flex flex-wrap gap-sm">
          <Btn icon="add_circle" onClick={() => setPayModal(true)}>Enregistrer un paiement</Btn>
        </div>
        <div className="flex items-center gap-sm bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2">
          <Icon name="calendar_month" className="text-primary" size={16} />
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none text-sm text-on-surface focus:outline-none">
            {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* ── Stats ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-md">
        {[
          { label: 'Loyers Attendus', value: fmt(totalExpected), icon: 'request_quote', cls: 'bg-primary/10 text-primary' },
          { label: 'Encaissés', value: fmt(totalCollected), icon: 'check_circle', cls: 'bg-green-100 text-green-700' },
          { label: 'Impayés', value: fmt(totalPending), icon: 'warning', cls: 'bg-red-100 text-red-700' },
          { label: 'Recouvrement', value: `${recoveryRate}%`, icon: 'percent', cls: recoveryRate >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-center gap-md">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${s.cls}`}>
              <Icon name={s.icon} size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-on-surface-variant text-[10px] md:text-xs uppercase tracking-wider font-semibold truncate">{s.label}</p>
              <p className="font-bold text-on-surface mt-0.5 text-sm md:text-base truncate">{s.value}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-surface-container-low rounded-xl p-1 w-full overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors relative ${
              tab === t.id ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}>
            <Icon name={t.icon} size={16} />
            {t.label}
            {t.badge > 0 && (
              <span className="bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB: PAIEMENTS ══════════════════ */}
      {tab === 'payments' && (
        <>
          {/* Filters */}
          <div className="bg-surface-container-lowest rounded-xl p-sm border border-outline-variant/20 flex flex-col gap-sm">
            {/* Row 1: property + tenant searchable dropdowns */}
            <div className="flex flex-col sm:flex-row gap-sm items-start sm:items-center">
              <div className="w-full sm:w-64">
                <SearchSelect
                  value={filterPropKey}
                  onChange={v => handleFilterPropSelect(v)}
                  placeholder="— Tous les appartements —"
                  options={[
                    { value: '', label: '— Tous les appartements —' },
                    ...allPropertyOptions,
                  ]}
                  className="w-full pl-3 pr-8 py-2 border border-outline-variant rounded-lg bg-surface-container-low text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="w-full sm:w-64">
                <SearchSelect
                  value={filterTenantId}
                  onChange={v => handleFilterTenantSelect(v)}
                  placeholder="— Tous les locataires —"
                  options={[
                    { value: '', label: '— Tous les locataires —' },
                    ...filterTenants.map(t => ({
                      value: String(t.id),
                      label: t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim(),
                    })),
                  ]}
                  className="w-full pl-3 pr-8 py-2 border border-outline-variant rounded-lg bg-surface-container-low text-sm focus:outline-none focus:border-primary"
                />
              </div>
              {(filterPropKey || filterTenantId) && (
                <button onClick={() => { setFilterPropKey(''); setFilterTenantId(''); }}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-error border border-error/30 hover:bg-error/8 transition-colors whitespace-nowrap">
                  <Icon name="close" size={13} /> Effacer
                </button>
              )}
            </div>
            {/* Row 2: text search + status pills + count */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-md">
              <div className="relative w-full sm:w-64">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={15} />
                <input type="text" placeholder="Propriété, locataire..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-outline-variant rounded-lg bg-surface-container-low text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="flex flex-wrap gap-xs">
                {['Tous','Payé','Impayé','En retard'].map(opt => (
                  <button key={opt} onClick={() => setStatusFilter(opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      statusFilter === opt ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                    }`}>
                    {opt}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-sm text-on-surface-variant">{filtered.length} paiement(s)</span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary text-on-primary">
                  <tr>
                    {['Propriété / Locataire','Montant','Échéance','Payé le','Statut','Rappels','Actions'].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${i === 1 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-on-surface-variant">
                      <Icon name="payments" size={36} className="opacity-30 mb-2" /><p>Aucun paiement pour ce mois</p>
                    </td></tr>
                  )}
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-sm text-on-surface">{p.propertyName}</p>
                        <p className="text-xs text-on-surface-variant">{p.tenantName}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className={`font-bold text-sm ${p.status === 'Payé' ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(p.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-on-surface">{p.dueDate || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-on-surface">{p.paidDate || <span className="text-on-surface-variant">—</span>}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                          <Icon name={statusIcon[p.status] || 'info'} size={12} />
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-on-surface-variant">
                        {p.reminderCount > 0
                          ? <span className="text-amber-700 flex items-center gap-1"><Icon name="notifications_active" size={12} />{p.reminderCount}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                          {p.status === 'Payé' && (
                            <Btn small icon="receipt" variant="secondary" onClick={() => openReceipt(p)}>Quittance</Btn>
                          )}
                          {p.status !== 'Payé' && p.status !== 'Annulé' && (
                            <>
                              <Btn small icon="check_circle" variant="green" onClick={() => handleMarkPaid(p.id)}>Payé</Btn>
                              <Btn small icon="notifications" variant="amber" onClick={() => setReminderModal(p)}>Rappel</Btn>
                            </>
                          )}
                          <Btn small icon="edit" variant="secondary" onClick={() => openEdit(p)}>Modifier</Btn>
                          {p.status === 'Payé' && (
                            <Btn small icon="block" variant="amber" onClick={() => handleCancel(p)}>Annuler</Btn>
                          )}
                          <Btn small icon="delete" variant="danger" onClick={() => setDeleteConfirm(p)}>Supprimer</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 bg-surface-container-low border-t border-outline-variant/20 flex justify-between text-xs text-on-surface-variant">
              <span>{monthPmts.filter(p => p.status === 'Payé').length} / {monthPmts.length} reçus — {recoveryRate}% recouvrement</span>
              <span className={recoveryRate >= 80 ? 'text-green-700 font-semibold' : 'text-error font-semibold'}>
                {recoveryRate >= 80 ? '✓ Bon taux' : '⚠ Taux faible'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════ TAB: RAPPELS ══════════════════ */}
      {tab === 'reminders' && (
        <div className="flex flex-col gap-md">
          {/* Period banner */}
          {isReminderPeriod && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center gap-3">
              <Icon name="notifications_active" size={20} className="text-amber-700 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">Période de rappels — du 1er au 10 du mois</p>
                <p className="text-xs text-amber-700 mt-0.5">Nous sommes le {todayDay}. Envoyez les rappels aux locataires qui n'ont pas encore payé.</p>
              </div>
            </div>
          )}
          {isAfterDeadline && currentMonthUnpaid.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex items-center gap-3">
              <Icon name="warning" size={20} className="text-red-700 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-800">Délai dépassé — pénalité de 10% applicable</p>
                <p className="text-xs text-red-700 mt-0.5">{currentMonthUnpaid.length} locataire(s) n'ont pas payé après le 10. La pénalité de 10% s'applique sur leur loyer.</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between flex-wrap gap-sm">
            <div>
              <h3 className="font-bold text-on-surface text-base">Rappels — {currentMonthLabel}</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {currentMonthUnpaid.length} locataire(s) n'ont pas encore payé ce mois-ci
              </p>
            </div>
            <div className="flex gap-sm flex-wrap">
              {currentMonthUnpaid.length > 0 && (
                <Btn icon="notifications_active" onClick={sendBulkReminders}>
                  Rappels WhatsApp ({currentMonthUnpaid.length})
                </Btn>
              )}
              {isAfterDeadline && currentMonthUnpaid.length > 0 && (
                <Btn icon="warning" onClick={sendBulkPenalties}
                  className="bg-red-600 text-white hover:bg-red-700">
                  Pénalités 10% ({currentMonthUnpaid.length})
                </Btn>
              )}
            </div>
          </div>

          {currentMonthUnpaid.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <Icon name="check_circle" size={40} className="text-green-600 mb-3" />
              <p className="font-semibold text-green-800">Tous les loyers ont été réglés ce mois-ci !</p>
              <p className="text-sm text-green-600 mt-1">Aucun rappel à envoyer pour {currentMonthLabel}.</p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-secondary text-on-primary">
                    <tr>
                      {['Locataire','Propriété','Montant dû','Statut','Rappels','Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {currentMonthUnpaid.map(p => (
                      <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-sm">{p.tenantName}</p>
                          {p.tenantPhone && <p className="text-xs text-on-surface-variant">{p.tenantPhone}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-on-surface">{p.propertyName}</td>
                        <td className="px-4 py-3.5 font-bold text-sm text-red-700">{fmt(p.amount)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                            <Icon name={statusIcon[p.status] || 'info'} size={12} />
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-on-surface-variant">
                          {p.reminderCount > 0
                            ? <span className="text-amber-700">{p.reminderCount} envoyé(s)</span>
                            : <span>Aucun</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => sendWhatsAppReminder(p)}
                              className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                              <Icon name="chat" size={12} /> WhatsApp
                            </button>
                            {p.tenantEmail && (
                              <button onClick={() => sendEmailReminder(p)}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-200 transition-colors">
                                <Icon name="mail" size={12} /> Email
                              </button>
                            )}
                            {isAfterDeadline && (() => {
                              const phone = phoneForWA(p.tenantPhone);
                              const penalty = Math.round((p.amount || 0) * 0.10);
                              const msg = encodeURIComponent(
                                `Bonjour ${p.tenantName},\n\nPénalité de 10% appliquée pour loyer impayé de ${p.month}.\n• Loyer : ${fmt(p.amount)}\n• Pénalité : ${fmt(penalty)}\n• Total : ${fmt((p.amount || 0) + penalty)}\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
                              );
                              return phone ? (
                                <button onClick={() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')}
                                  className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200 transition-colors">
                                  <Icon name="warning" size={12} /> +10%
                                </button>
                              ) : null;
                            })()}
                            <button onClick={() => handleMarkPaid(p.id)}
                              className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                              <Icon name="check_circle" size={12} /> Marquer payé
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: RAPPORT MENSUEL ══════════════════ */}
      {tab === 'report' && (() => {
        // Compute monthly expenses from transactions (non-positive = dépense)
        const [reportMonthName, reportYear] = selectedMonth.split(' ');
        const monthTransactions = transactions.filter(t => {
          if (!t.date) return false;
          const d = new Date(t.date);
          return d.getFullYear() === Number(reportYear) && MONTH_NAMES[d.getMonth()] === reportMonthName;
        });
        const totalDepenses = monthTransactions.filter(t => !t.positive).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
        const solde = totalCollected - totalDepenses;
        return (
        <div className="flex flex-col gap-md">
          <div className="flex items-center justify-between flex-wrap gap-sm">
            <div>
              <h3 className="font-bold text-on-surface text-base">Rapport — {selectedMonth}</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">{reportPaid.length} payés · {reportUnpaid.length} impayés</p>
            </div>
            <Btn icon="picture_as_pdf" variant="secondary" onClick={handlePrintReport}>Imprimer / Exporter</Btn>
          </div>

          {/* Financial bilan */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden shadow-card">
            <div className="bg-primary/10 px-5 py-3 border-b border-outline-variant/20 flex items-center gap-2">
              <Icon name="account_balance" size={16} className="text-primary" />
              <h4 className="font-bold text-primary text-sm">Bilan financier — {selectedMonth}</h4>
            </div>
            <div className="grid grid-cols-3 divide-x divide-outline-variant/20">
              <div className="p-4 text-center">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Encaissements</p>
                <p className="text-lg font-black text-green-700">{fmt(totalCollected)}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{reportPaid.length} paiement(s) reçu(s)</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Dépenses</p>
                <p className="text-lg font-black text-red-700">{fmt(totalDepenses)}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{monthTransactions.filter(t => !t.positive).length} transaction(s)</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Solde net</p>
                <p className={`text-lg font-black ${solde >= 0 ? 'text-primary' : 'text-error'}`}>{fmt(solde)}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{solde >= 0 ? 'Excédent' : 'Déficit'}</p>
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 shadow-card">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Taux de recouvrement</p>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-red-100 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${recoveryRate}%` }}
                />
              </div>
              <span className={`text-lg font-black w-14 text-right ${recoveryRate >= 80 ? 'text-green-700' : 'text-red-700'}`}>
                {recoveryRate}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant mt-2">
              <span className="text-green-700 font-semibold">{fmt(totalCollected)} encaissé</span>
              <span className="text-red-700 font-semibold">{fmt(totalPending)} en attente</span>
            </div>

            {/* Per-property mini bars */}
            {monthPmts.length > 0 && (() => {
              const byProp = {};
              monthPmts.forEach(p => {
                if (!byProp[p.propertyName]) byProp[p.propertyName] = { paid: 0, total: 0 };
                byProp[p.propertyName].total++;
                if (p.status === 'Payé') byProp[p.propertyName].paid++;
              });
              return (
                <div className="mt-4 flex flex-col gap-2">
                  {Object.entries(byProp).map(([name, v]) => {
                    const pct = Math.round(v.paid / v.total * 100);
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <span className="text-xs text-on-surface-variant w-40 truncate">{name}</span>
                        <div className="flex-1 bg-outline-variant/20 rounded-full h-2.5 overflow-hidden">
                          <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-on-surface w-12 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Paid list */}
          {reportPaid.length > 0 && (
            <div className="bg-surface-container-lowest rounded-xl border border-green-200 overflow-hidden shadow-card">
              <div className="bg-green-50 px-5 py-3 border-b border-green-200 flex items-center gap-2">
                <Icon name="check_circle" size={16} className="text-green-600" />
                <h4 className="font-bold text-green-800 text-sm">Paiements reçus ({reportPaid.length})</h4>
                <span className="ml-auto font-bold text-green-700 text-sm">{fmt(totalCollected)}</span>
              </div>
              <table className="w-full text-left">
                <thead><tr className="bg-green-50 border-b border-green-100">
                  {['Propriété','Locataire','Montant','Payé le'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-green-700">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-green-50">
                  {reportPaid.map(p => (
                    <tr key={p.id} className="hover:bg-green-50/50">
                      <td className="px-4 py-3 text-sm font-medium">{p.propertyName}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{p.tenantName}</td>
                      <td className="px-4 py-3 text-sm font-bold text-green-700">{fmt(p.amount)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{p.paidDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Unpaid list */}
          {reportUnpaid.length > 0 && (
            <div className="bg-surface-container-lowest rounded-xl border border-red-200 overflow-hidden shadow-card">
              <div className="bg-red-50 px-5 py-3 border-b border-red-200 flex items-center gap-2">
                <Icon name="warning" size={16} className="text-red-600" />
                <h4 className="font-bold text-red-800 text-sm">Impayés / En retard ({reportUnpaid.length})</h4>
                <span className="ml-auto font-bold text-red-700 text-sm">{fmt(totalPending)}</span>
              </div>
              <table className="w-full text-left">
                <thead><tr className="bg-red-50 border-b border-red-100">
                  {['Propriété','Locataire','Montant dû','Statut'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-700">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-red-50">
                  {reportUnpaid.map(p => (
                    <tr key={p.id} className="hover:bg-red-50/50">
                      <td className="px-4 py-3 text-sm font-medium">{p.propertyName}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{p.tenantName}</td>
                      <td className="px-4 py-3 text-sm font-bold text-red-700">{fmt(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                          <Icon name={statusIcon[p.status] || 'info'} size={12} />{p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {monthPmts.length === 0 && (
            <div className="text-center py-12 text-on-surface-variant">
              <Icon name="bar_chart" size={40} className="opacity-30 mb-2" />
              <p>Aucune donnée pour {selectedMonth}</p>
            </div>
          )}
        </div>
        );
      })()}

      {/* ══════════════ MODAL: Enregistrer un paiement ══════════════ */}
      <ModalWrap
        open={payModal}
        onClose={() => { setPayModal(false); setPayForm({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces' }); }}
        title="Enregistrer un paiement"
        size="md"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayModal(false)}>Annuler</Btn>
            <Btn icon="check_circle" onClick={handleSavePayment}
              disabled={!payForm.propertyKey || !payForm.tenantId || !payForm.amount}>
              Confirmer le paiement
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Propriété / Appartement" required>
            <SearchSelect
              value={payForm.propertyKey}
              onChange={v => handlePropertySelect(v)}
              placeholder="— Choisir la propriété —"
              options={[
                { value: '', label: '— Choisir la propriété —' },
                ...allPropertyOptions,
              ]}
              className={inputCls}
            />
          </Field>

          <Field label="Locataire" required>
            <SearchSelect
              value={payForm.tenantId}
              onChange={v => handleTenantSelect(v)}
              placeholder="— Choisir le locataire —"
              options={[
                { value: '', label: '— Choisir le locataire —' },
                ...matchingTenants.map(t => ({
                  value: String(t.id),
                  label: t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim(),
                })),
              ]}
              className={inputCls}
            />
            {payForm.propertyKey && matchingTenants.length === 0 && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <Icon name="info" size={12} /> Aucun contrat actif trouvé pour cette propriété.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Montant (FCFA)" required>
              <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Ex: 150000" className={inputCls} />
            </Field>
            <Field label="Mois concerné">
              <select value={payForm.month} onChange={e => setPayForm(f => ({ ...f, month: e.target.value }))} className={inputCls}>
                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date d'échéance">
              <input type="date" value={payForm.dueDate} onChange={e => setPayForm(f => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Mode de paiement">
              <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                {['Espèces','Virement','Mobile Money','Chèque','Autre'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </ModalWrap>

      {/* ══════════════ MODAL: Quittance ══════════════ */}
      <ModalWrap
        open={!!quittancePayment}
        onClose={() => setQuittancePayment(null)}
        title="Quittance de Loyer"
        size="xl"
        footer={
          receiptTab === 'preview' ? (
            <div className="flex gap-3 w-full justify-between items-center">
              <Btn variant="secondary" onClick={() => setQuittancePayment(null)}>Fermer</Btn>
              <div className="flex gap-3">
                <Btn icon="draw" onClick={() => setReceiptTab('sign')}>Signer numériquement</Btn>
                <Btn icon="print" variant="secondary" onClick={printReceipt}>Imprimer sans signature</Btn>
              </div>
            </div>
          ) : receiptTab === 'sign' ? (
            <div className="flex gap-3 w-full justify-between">
              <Btn variant="secondary" onClick={() => setReceiptTab('preview')}>← Retour</Btn>
              <Btn icon="check_circle" onClick={handleConfirmSignatures}>
                Valider les signatures →
              </Btn>
            </div>
          ) : (
            <div className="flex gap-3 w-full flex-wrap justify-between items-center">
              <Btn variant="secondary" onClick={() => setReceiptTab('sign')}>← Modifier signatures</Btn>
              <div className="flex gap-2 flex-wrap">
                <Btn icon="print" onClick={printReceipt}>Imprimer</Btn>
                <Btn icon="chat" variant="green" onClick={whatsappReceipt}>WhatsApp</Btn>
                <Btn icon="mail" variant="secondary" onClick={emailReceipt}>Email</Btn>
              </div>
            </div>
          )
        }
      >
        {quittancePayment && (
          <div className="flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-surface-container-low rounded-xl p-1">
              {[
                { key: 'preview', label: 'Aperçu', icon: 'preview' },
                { key: 'sign',    label: 'Signatures', icon: 'draw' },
                { key: 'send',    label: 'Envoyer', icon: 'send',
                  badge: (signatures.bailleur || signatures.locataire) },
              ].map(t => (
                <button key={t.key} onClick={() => setReceiptTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors relative ${
                    receiptTab === t.key ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}>
                  <Icon name={t.icon} size={14} />
                  {t.label}
                  {t.badge && <span className="w-2 h-2 bg-green-500 rounded-full absolute top-1 right-1" />}
                </button>
              ))}
            </div>

            {/* ── TAB: APERÇU ── */}
            {receiptTab === 'preview' && (
              <div className="flex flex-col gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                  <Icon name="check_circle" size={20} className="text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-green-800 text-sm">Paiement enregistré</p>
                    <p className="text-xs text-green-700">Prévisualisez la quittance avant de la signer ou l'envoyer.</p>
                  </div>
                </div>
                {/* Iframe preview */}
                <div className="border border-outline-variant/30 rounded-xl overflow-hidden bg-gray-50" style={{ height: '460px' }}>
                  <iframe
                    srcDoc={buildReceiptHTML(quittancePayment, orgSettings, signatures)}
                    title="Aperçu quittance"
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
                <p className="text-xs text-on-surface-variant text-center">
                  Aperçu en temps réel — les signatures apparaîtront une fois ajoutées.
                </p>
              </div>
            )}

            {/* ── TAB: SIGNATURES ── */}
            {receiptTab === 'sign' && (
              <div className="flex flex-col gap-5">
                <div className="bg-primary-container/20 border border-primary/20 rounded-xl p-3 flex items-start gap-3">
                  <Icon name="info" size={18} className="text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-on-surface">
                    Dessinez les signatures dans les zones ci-dessous. Elles seront intégrées dans la quittance avant impression ou envoi.
                    La signature du locataire est <strong>optionnelle</strong>.
                  </p>
                </div>

                <SignaturePad
                  ref={sigBailleurRef}
                  label="Signature du Bailleur / Gestionnaire"
                  subtitle={`${orgSettings?.companyName || 'Minsouah Immobilier'}`}
                  required
                  onChange={setSigBailleur}
                />

                <SignaturePad
                  ref={sigLocataireRef}
                  label="Signature du Locataire"
                  subtitle={`${quittancePayment.tenantName} — optionnel`}
                  onChange={setSigLocataire}
                />

                {/* Preview of signed receipt */}
                {(sigBailleur || sigLocataire) && (
                  <button
                    type="button"
                    onClick={() => {
                      const b = sigBailleurRef.current?.getDataURL();
                      const l = sigLocataireRef.current?.getDataURL();
                      const html = buildReceiptHTML(quittancePayment, orgSettings, { bailleur: b, locataire: l });
                      const win = window.open('', '_blank', 'width=820,height=700');
                      if (win) { win.document.write(html); win.document.close(); }
                    }}
                    className="flex items-center justify-center gap-2 text-xs text-primary hover:underline"
                  >
                    <Icon name="preview" size={14} /> Prévisualiser avec les signatures actuelles
                  </button>
                )}
              </div>
            )}

            {/* ── TAB: ENVOYER ── */}
            {receiptTab === 'send' && (
              <div className="flex flex-col gap-4">
                {/* Signature status */}
                <div className={`rounded-xl p-3 flex items-start gap-3 ${
                  signatures.bailleur ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <Icon name={signatures.bailleur ? 'verified' : 'warning'} size={20}
                    className={signatures.bailleur ? 'text-green-600' : 'text-amber-600'} />
                  <div>
                    <p className={`font-semibold text-sm ${signatures.bailleur ? 'text-green-800' : 'text-amber-800'}`}>
                      {signatures.bailleur ? 'Quittance signée numériquement' : 'Quittance sans signature'}
                    </p>
                    <div className="flex gap-4 mt-1">
                      <span className={`text-xs flex items-center gap-1 ${signatures.bailleur ? 'text-green-700' : 'text-amber-600'}`}>
                        <Icon name={signatures.bailleur ? 'check_circle' : 'radio_button_unchecked'} size={12} />
                        Bailleur
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${signatures.locataire ? 'text-green-700' : 'text-on-surface-variant'}`}>
                        <Icon name={signatures.locataire ? 'check_circle' : 'radio_button_unchecked'} size={12} />
                        Locataire
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details summary */}
                <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
                  {[
                    ['Locataire',  quittancePayment.tenantName],
                    ['Propriété',  quittancePayment.propertyName],
                    ['Période',    quittancePayment.month],
                    ['Montant',    fmt(quittancePayment.amount)],
                    ['Mode',       quittancePayment.method || 'Espèces'],
                    ['Date',       quittancePayment.paidDate || new Date().toLocaleDateString('fr-CI')],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between px-4 py-2 border-b border-outline-variant/10 last:border-0">
                      <span className="text-xs text-on-surface-variant">{k}</span>
                      <span className="text-xs font-semibold text-on-surface">{v}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-on-surface-variant text-center">
                  Choisissez le canal d'envoi ci-dessous.
                </p>
              </div>
            )}
          </div>
        )}
      </ModalWrap>

      {/* ══════════════ MODAL: Rappel confirm ══════════════ */}
      <ModalWrap
        open={!!reminderModal}
        onClose={() => setReminderModal(null)}
        title="Envoyer un rappel de paiement"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setReminderModal(null)}>Annuler</Btn>
            <Btn icon="send" onClick={() => handleReminder(reminderModal)}>Confirmer l'envoi</Btn>
          </>
        }
      >
        {reminderModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <Icon name="notifications_active" size={22} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-on-surface">Rappel pour <strong>{reminderModal.tenantName}</strong></p>
                <p className="text-sm text-on-surface-variant mt-1">
                  Loyer de <strong>{fmt(reminderModal.amount)}</strong> — {reminderModal.month}<br />
                  Propriété : <strong>{reminderModal.propertyName}</strong>
                </p>
                {reminderModal.reminderCount > 0 && (
                  <p className="text-xs text-amber-700 mt-2">⚠ {reminderModal.reminderCount} rappel(s) déjà envoyé(s)</p>
                )}
              </div>
            </div>
            <p className="text-sm text-on-surface-variant">Le statut passera en <strong>«&nbsp;En retard&nbsp;»</strong> et le compteur sera incrémenté.</p>
          </div>
        )}
      </ModalWrap>

      {/* ══════════════ MODAL: Modifier un paiement ══════════════ */}
      <ModalWrap
        open={!!editModal}
        onClose={() => setEditModal(null)}
        title="Modifier le paiement"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setEditModal(null)}>Annuler</Btn>
            <Btn icon="save" onClick={saveEdit}>Enregistrer</Btn>
          </>
        }
      >
        {editModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-surface-container rounded-xl px-4 py-3 text-sm">
              <p className="font-semibold text-on-surface">{editModal.propertyName}</p>
              <p className="text-on-surface-variant text-xs">{editModal.tenantName} — {editModal.month}</p>
            </div>
            <Field label="Montant (FCFA)" required>
              <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mois concerné">
                <select value={editForm.month} onChange={e => setEditForm(f => ({ ...f, month: e.target.value }))} className={inputCls}>
                  {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Statut">
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                  {['Payé','Impayé','En retard','Annulé'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date d'échéance">
                <input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Mode de paiement">
                <select value={editForm.method} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                  {['Espèces','Virement','Mobile Money','Chèque','Autre'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
          </div>
        )}
      </ModalWrap>

      {/* ══════════════ MODAL: Confirmer suppression ══════════════ */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
              <Icon name="delete" size={24} className="text-red-700" />
            </div>
            <h3 className="font-bold text-on-surface text-lg mb-1">Supprimer ce paiement ?</h3>
            <p className="text-sm text-on-surface-variant mb-1">
              <strong>{deleteConfirm.tenantName}</strong> — {deleteConfirm.propertyName}
            </p>
            <p className="text-sm text-on-surface-variant mb-5">
              {deleteConfirm.month} · <span className="font-semibold text-red-700">{fmt(deleteConfirm.amount)}</span>
            </p>
            <p className="text-xs text-on-surface-variant bg-red-50 rounded-xl px-3 py-2 mb-5">
              Cette action est irréversible. Le paiement sera définitivement supprimé.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">
                Annuler
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                <Icon name="delete" size={16} /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
