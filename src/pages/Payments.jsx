import { useState, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import SearchSelect from '../components/SearchSelect';
import SignaturePad from '../components/SignaturePad';
import { buildReceiptHTML as buildReceiptHTMLShared } from '../lib/quittanceReport';
import { sendEmail, buildReminderHtml } from '../lib/email';
import { SCI_NORA_LOGO, SCI_NORA_STAMP } from '../lib/sciNoraAssets';
import { can } from '../lib/permissions';
import { QRCodeCanvas } from 'qrcode.react';

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// First day of a date's month. The advance-period check must compare MONTHS,
// not exact days: a tenant whose paymentStartDate is e.g. the 5th of a month
// still owes rent for THAT whole month, so they must appear from the 1st.
const monthFirst = (d) => (d && !isNaN(d.getTime())) ? new Date(d.getFullYear(), d.getMonth(), 1) : null;

// Parse dates stored as dd/mm/yyyy OR ISO yyyy-mm-dd
function parseTxDate(str) {
  if (!str) return null;
  if (str.includes('/')) {
    const [d, m, y] = str.split('/');
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(str);
}

const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const phoneForWA = raw => { const d = (raw || '').replace(/\D/g, ''); if (!d) return ''; return d.startsWith('225') ? d : '225' + d; };

const statusColor = {
  'Payé':      'text-green-700 bg-green-100',
  'Impayé':    'text-red-700 bg-red-100',
  'En retard': 'text-amber-700 bg-amber-100',
  'Annulé':    'text-on-surface-variant bg-surface-container',
};
const statusIcon = { 'Payé': 'check_circle', 'Impayé': 'cancel', 'En retard': 'schedule', 'Annulé': 'block' };

/* ── Penalty Report HTML ──────────────────────────────────────────────────── */
function buildPenaltyReportHTML(penaltyList, month, orgSettings) {
  const org = orgSettings || {};
  const orgLogo  = org.logo  || '';
  const orgStamp = org.stamp || '';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fCFA = n => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
  const totalLoyer = penaltyList.reduce((s, i) => s + (i.rent || 0), 0);
  const totalPenalty = penaltyList.reduce((s, i) => s + (i.penalty || 0), 0);
  const totalDu = penaltyList.reduce((s, i) => s + (i.total || 0), 0);

  const rows = penaltyList.map((item, idx) => `
    <tr style="${idx % 2 === 0 ? '' : 'background:#fafafa'}">
      <td style="padding:10px 14px;font-weight:600">${item.tenantName || '—'}</td>
      <td style="padding:10px 14px;color:#555">${item.tenantPhone || '—'}</td>
      <td style="padding:10px 14px;color:#555">${item.propertyName || '—'}</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600">${fCFA(item.rent)}</td>
      <td style="padding:10px 14px;text-align:right;color:#b91c1c;font-weight:700">+ ${fCFA(item.penalty)}</td>
      <td style="padding:10px 14px;text-align:right;font-weight:900;color:#7f1d1d">${fCFA(item.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Liste des Pénalités — ${month}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:28px}
    @media print{body{padding:0}@page{margin:18mm 14mm}}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #b91c1c}
    .org-name{font-size:20px;font-weight:900;color:#b91c1c}
    .doc-title{font-size:15px;font-weight:700;color:#1a1a1a;margin-top:4px}
    .meta{font-size:11px;color:#666;margin-top:2px}
    .badge{background:#b91c1c;color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;white-space:nowrap}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    thead tr{background:#b91c1c;color:#fff}
    th{padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    th:nth-child(4),th:nth-child(5),th:nth-child(6){text-align:right}
    tfoot tr{background:#fef2f2;border-top:2px solid #b91c1c}
    td,tfoot td{border-bottom:1px solid #f3f4f6}
    .total-row td{font-weight:900;padding:12px 14px;color:#7f1d1d;font-size:13px}
    .summary{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
    .kpi{flex:1;min-width:140px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 16px;text-align:center}
    .kpi-val{font-size:18px;font-weight:900;color:#b91c1c}
    .kpi-lbl{font-size:10px;color:#666;margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#999;text-align:center}
  </style>
  </head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px">
      ${orgLogo
        ? `<img src="${orgLogo}" style="max-height:52px;max-width:130px;object-fit:contain"/>`
        : `<div class="org-name">${org.companyName || 'Minsouah Immobilier'}</div>`
      }
      <div>
        <div class="doc-title">Liste des pénalités de retard — ${month}</div>
        <div class="meta">Généré le ${today} · Pénalité applicable après le 10 du mois (10% du loyer)</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <div class="badge">${penaltyList.length} dossier(s)</div>
      ${orgStamp ? `<img src="${orgStamp}" style="max-height:48px;max-width:48px;object-fit:contain;opacity:0.85"/>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="kpi"><div class="kpi-val">${penaltyList.length}</div><div class="kpi-lbl">Locataires concernés</div></div>
    <div class="kpi"><div class="kpi-val">${fCFA(totalLoyer)}</div><div class="kpi-lbl">Total loyers dus</div></div>
    <div class="kpi"><div class="kpi-val">${fCFA(totalPenalty)}</div><div class="kpi-lbl">Total pénalités 10%</div></div>
    <div class="kpi" style="background:#fff7ed;border-color:#fed7aa"><div class="kpi-val" style="color:#c2410c">${fCFA(totalDu)}</div><div class="kpi-lbl">Total à encaisser</div></div>
  </div>

  <table>
    <thead><tr>
      <th>Locataire</th><th>Téléphone</th><th>Propriété</th>
      <th style="text-align:right">Loyer dû</th>
      <th style="text-align:right">Pénalité 10%</th>
      <th style="text-align:right">Total à payer</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="3">TOTAUX</td>
      <td style="text-align:right">${fCFA(totalLoyer)}</td>
      <td style="text-align:right;color:#b91c1c">+ ${fCFA(totalPenalty)}</td>
      <td style="text-align:right;color:#7f1d1d">${fCFA(totalDu)}</td>
    </tr></tfoot>
  </table>

  <div class="footer">${org.companyName || 'Minsouah Immobilier'} · Document généré automatiquement · ${today}</div>
  <script>window.onload=()=>window.print();</script>
  </body></html>`;
}

/* ── Arrears Report HTML ──────────────────────────────────────────────────── */
function buildArrearsReportHTML(arrearsByTenant, arrearsTotal, orgSettings) {
  const org = orgSettings || {};
  const orgLogo  = org.logo  || '';
  const orgStamp = org.stamp || '';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fCFA = n => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
  const totalTenants = arrearsByTenant.length;
  const totalMonths = arrearsByTenant.reduce((s, g) => s + g.payments.length, 0);

  /* Bar chart SVG */
  const maxAmt = Math.max(...arrearsByTenant.map(g => g.total), 1);
  const BAR_H = 22; const BAR_GAP = 8; const LEFT = 160; const RIGHT = 320;
  const svgH = arrearsByTenant.length * (BAR_H + BAR_GAP) + 20;
  const bars = arrearsByTenant.map((g, i) => {
    const barW = Math.max(4, Math.round((g.total / maxAmt) * RIGHT));
    const y = i * (BAR_H + BAR_GAP) + 10;
    const name = g.tenantName.length > 22 ? g.tenantName.slice(0, 20) + '…' : g.tenantName;
    return `
      <text x="${LEFT - 6}" y="${y + BAR_H * 0.72}" text-anchor="end" font-size="11" fill="#374151">${name}</text>
      <rect x="${LEFT}" y="${y}" width="${barW}" height="${BAR_H}" fill="#f59e0b" rx="3"/>
      <text x="${LEFT + barW + 6}" y="${y + BAR_H * 0.72}" font-size="10" fill="#92400e" font-weight="700">${fCFA(g.total)}</text>`;
  }).join('');
  const barChart = `<svg viewBox="0 0 ${LEFT + RIGHT + 120} ${svgH}" width="100%" style="max-height:${Math.min(svgH, 300)}px">${bars}</svg>`;

  /* Tenant tables */
  const tenantSections = arrearsByTenant.map(g => {
    const rows = g.payments.map((p, idx) => `
      <tr style="${idx % 2 === 0 ? '' : 'background:#fffbeb'}">
        <td style="padding:8px 12px;font-weight:600">${p.month}</td>
        <td style="padding:8px 12px;color:#555">${p.propertyName || '—'}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:#92400e">${fCFA(p.amount)}</td>
        <td style="padding:8px 12px;text-align:center;color:${p.status === 'En retard' ? '#b45309' : '#b91c1c'};font-weight:600">${p.status}</td>
      </tr>`).join('');
    return `
      <div style="margin-bottom:20px;border:1px solid #fcd34d;border-radius:10px;overflow:hidden">
        <div style="background:#fef3c7;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-size:14px;font-weight:800;color:#78350f">${g.tenantName}</span>
            <span style="font-size:11px;color:#92400e;margin-left:10px">${g.payments.length} mois impayé(s)</span>
          </div>
          <span style="font-weight:900;color:#78350f;background:#fde68a;padding:4px 12px;border-radius:8px;font-size:13px">${fCFA(g.total)}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f59e0b;color:#fff">
            <th style="padding:7px 12px;text-align:left">Mois</th>
            <th style="padding:7px 12px;text-align:left">Propriété</th>
            <th style="padding:7px 12px;text-align:right">Montant</th>
            <th style="padding:7px 12px;text-align:center">Statut</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Rapport des Arriérés</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:28px}
    @media print{body{padding:0}@page{margin:18mm 14mm}h2{page-break-before:auto}}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #d97706}
    .org-name{font-size:20px;font-weight:900;color:#d97706}
    .kpis{display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap}
    .kpi{flex:1;min-width:130px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;text-align:center}
    .kpi-val{font-size:20px;font-weight:900;color:#d97706}
    .kpi-lbl{font-size:10px;color:#78350f;margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
    h2{font-size:14px;font-weight:800;color:#1a1a1a;margin:20px 0 10px;border-bottom:2px solid #fde68a;padding-bottom:6px}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#999;text-align:center}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:12px">
      ${orgLogo
        ? `<img src="${orgLogo}" style="max-height:52px;max-width:130px;object-fit:contain"/>`
        : `<div class="org-name">${org.companyName || 'Minsouah Immobilier'}</div>`
      }
      <div>
        <div style="font-size:13px;font-weight:700;color:#1a1a1a">Rapport des Arriérés de Loyers</div>
        <div style="font-size:11px;color:#666;margin-top:2px">Généré le ${today}</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
      <div style="background:#f59e0b;color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:700;white-space:nowrap">${totalTenants} locataire(s)</div>
      ${orgStamp ? `<img src="${orgStamp}" style="max-height:48px;max-width:48px;object-fit:contain;opacity:0.85"/>` : ''}
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-val">${totalTenants}</div><div class="kpi-lbl">Locataires concernés</div></div>
    <div class="kpi"><div class="kpi-val">${totalMonths}</div><div class="kpi-lbl">Mois impayés</div></div>
    <div class="kpi" style="background:#fff7ed;border-color:#fed7aa"><div class="kpi-val" style="color:#c2410c">${fCFA(arrearsTotal)}</div><div class="kpi-lbl">Total à récupérer</div></div>
  </div>

  <h2>Arriérés par locataire</h2>
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;margin-bottom:20px">${barChart}</div>

  <h2>Détail par locataire</h2>
  ${tenantSections}

  <div class="footer">${org.companyName || 'Minsouah Immobilier'} · Document généré automatiquement · ${today}</div>
  <script>window.onload=()=>window.print();</script>
  </body></html>`;
}

/* ── Global Report HTML ───────────────────────────────────────────────────── */
function buildGlobalReportHTML({ currentMonth, contracts = [], payments = [], arrearsByTenant = [], advanceTenants = [], orgSettings = {} }) {
  const org = orgSettings;
  const orgLogo = org.logo || '';
  const fCFA = n => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Active contracts
  const activeContracts = contracts.filter(c => c.status === 'Actif' || c.status === 'Expirant');

  // Payments for the current month
  const [curMonthName, curYear] = currentMonth.split(' ');
  const curMonthPmts = payments.filter(p => p.month === currentMonth);
  const paidNames = new Set(curMonthPmts.filter(p => p.status === 'Payé').map(p => (p.tenantName || '').toLowerCase().trim()));
  const advanceNames = new Set(advanceTenants.map(a => (a.tenantName || '').toLowerCase().trim()));

  // Expected this month = active contracts not in advance period
  const expectedContracts = activeContracts.filter(c => !advanceNames.has((c.tenant || '').toLowerCase().trim()));
  const totalExpected = expectedContracts.reduce((s, c) => s + (c.rent || 0), 0);
  const paidMonth = curMonthPmts.filter(p => p.status === 'Payé');
  const totalCollected = paidMonth.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCommission = paidMonth.reduce((s, p) => s + (p.commissionAmount != null ? p.commissionAmount : 0), 0);
  const totalNetOwner = totalCollected - totalCommission;
  const totalArrieres = arrearsByTenant.reduce((s, g) => s + g.total, 0);

  // Build contract rows for current month
  const contractRows = expectedContracts.map(c => {
    const tKey = (c.tenant || '').toLowerCase().trim();
    const isPaid = paidNames.has(tKey);
    const pmt = curMonthPmts.find(p => (p.tenantName || '').toLowerCase().trim() === tKey && p.status === 'Payé');
    const statusLabel = isPaid ? 'Payé' : 'Impayé';
    const statusStyle = isPaid
      ? 'color:#15803d;font-weight:700;background:#dcfce7;padding:2px 8px;border-radius:4px'
      : 'color:#b91c1c;font-weight:700;background:#fee2e2;padding:2px 8px;border-radius:4px';
    return `<tr>
      <td style="padding:8px 10px">${c.propertyName || '—'}</td>
      <td style="padding:8px 10px;font-weight:600">${c.tenant || '—'}</td>
      <td style="padding:8px 10px;text-align:right">${fCFA(c.rent)}</td>
      <td style="padding:8px 10px;text-align:right">${isPaid ? fCFA(pmt?.amount || c.rent) : '—'}</td>
      <td style="padding:8px 10px;text-align:center"><span style="${statusStyle}">${statusLabel}</span></td>
    </tr>`;
  }).join('');

  // Arrears rows per tenant
  const arrearsRows = arrearsByTenant.length > 0
    ? arrearsByTenant.map(g => {
        const monthList = g.payments.map(p => `${p.month} (${fCFA(p.amount)})`).join(', ');
        return `<tr>
          <td style="padding:8px 10px;font-weight:700;color:#92400e">${g.tenantName}</td>
          <td style="padding:8px 10px;font-size:11px;color:#6b7280">${monthList}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:800;color:#b91c1c">${fCFA(g.total)}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="3" style="padding:12px;text-align:center;color:#bbb;font-style:italic">Aucun arriéré</td></tr>';

  // Advance rows
  const advanceRows = advanceTenants.length > 0
    ? advanceTenants.map(a => {
        const startDate = a.paymentStartDate ? new Date(a.paymentStartDate).toLocaleDateString('fr-FR') : '—';
        return `<tr>
          <td style="padding:8px 10px;font-weight:700;color:#0369a1">${a.tenantName}</td>
          <td style="padding:8px 10px">${a.propertyName || '—'}</td>
          <td style="padding:8px 10px;text-align:right">${fCFA(a.amount)}</td>
          <td style="padding:8px 10px;text-align:center;font-weight:700;color:#0369a1">${startDate}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="4" style="padding:12px;text-align:center;color:#bbb;font-style:italic">Aucun locataire en avance</td></tr>';

  const paidCount = expectedContracts.filter(c => paidNames.has((c.tenant || '').toLowerCase().trim())).length;
  const unpaidCount = expectedContracts.length - paidCount;
  const recoveryRate = totalExpected > 0 ? Math.round(totalCollected / totalExpected * 100) : 0;
  const rateColor = recoveryRate >= 80 ? '#15803d' : recoveryRate >= 50 ? '#b45309' : '#b91c1c';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport Global — ${currentMonth}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4 portrait;margin:12mm 14mm}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1c1b19;background:#fff;font-size:12px}
  .page{padding:14px 18px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #785a00;padding-bottom:10px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:900;color:#785a00}
  .brand-sub{font-size:9px;color:#817662;text-transform:uppercase;letter-spacing:2px;margin-top:2px}
  .org-logo{max-height:52px;max-width:130px;object-fit:contain}
  .doc-info{text-align:right}
  .doc-info h2{font-size:15px;font-weight:700;color:#1c1b19}
  .doc-info p{font-size:10px;color:#817662;margin-top:2px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
  .kpi{background:#fff8f2;border:1px solid #e3d9cc;border-radius:8px;padding:10px 12px;text-align:center}
  .kpi-l{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#817662;font-weight:700;margin-bottom:4px}
  .kpi-v{font-size:16px;font-weight:900}
  .kpi-s{font-size:9px;color:#817662;margin-top:2px}
  .rate-bar{background:#f0e8de;border-radius:4px;height:10px;margin:8px 0;overflow:hidden}
  .rate-fill{height:100%;border-radius:4px;background:${rateColor}}
  section{margin-bottom:18px}
  section h2{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#785a00;font-weight:800;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e3d9cc}
  table{width:100%;border-collapse:collapse;font-size:11px}
  thead tr{background:#f9f5f0}
  th{padding:7px 10px;text-align:left;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#817662;border-bottom:1px solid #e3d9cc}
  tr:nth-child(even){background:#fafaf9}
  tr:hover{background:#fff8f2}
  .footer{margin-top:14px;padding-top:8px;border-top:1px solid #e3d9cc;font-size:9px;color:#b0a090;text-align:center}
  @media print{html,body{height:100%}}
</style>
</head><body><div class="page">

  <div class="header">
    <div>
      ${orgLogo
        ? `<img src="${orgLogo}" alt="logo" class="org-logo"/>`
        : `<div class="brand">${org.companyName || 'Minsouah'}</div><div class="brand-sub">${org.tagline || "L'immobilier réinventé"}</div>`
      }
    </div>
    <div class="doc-info">
      <h2>Rapport Global de Gestion</h2>
      <p>Période de référence : <strong>${currentMonth}</strong></p>
      <p>Édité le ${today}</p>
    </div>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-l">Attendu ce mois</div>
      <div class="kpi-v" style="color:#785a00">${fCFA(totalExpected)}</div>
      <div class="kpi-s">${expectedContracts.length} contrat(s) actif(s)</div>
    </div>
    <div class="kpi">
      <div class="kpi-l">Encaissé (brut)</div>
      <div class="kpi-v" style="color:#15803d">${fCFA(totalCollected)}</div>
      <div class="kpi-s">${paidCount} payé(s) · ${recoveryRate}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-l">Commission Minsouah</div>
      <div class="kpi-v" style="color:#b45309">${fCFA(totalCommission)}</div>
      <div class="kpi-s">Net proprio : ${fCFA(totalNetOwner)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-l">Impayés (mois)</div>
      <div class="kpi-v" style="color:#b45309">${fCFA(totalExpected - totalCollected)}</div>
      <div class="kpi-s">${unpaidCount} locataire(s)</div>
    </div>
    <div class="kpi">
      <div class="kpi-l">Arriérés cumulés</div>
      <div class="kpi-v" style="color:#b91c1c">${fCFA(totalArrieres)}</div>
      <div class="kpi-s">${arrearsByTenant.length} locataire(s) en retard</div>
    </div>
  </div>

  <div style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#817662;margin-bottom:4px">
      <span>Taux de recouvrement mensuel</span><span style="font-weight:800;color:${rateColor}">${recoveryRate}%</span>
    </div>
    <div class="rate-bar"><div class="rate-fill" style="width:${recoveryRate}%"></div></div>
  </div>

  <!-- Current month detail -->
  <section>
    <h2>Point des paiements — ${currentMonth}</h2>
    <table>
      <thead><tr><th>Propriété</th><th>Locataire</th><th>Loyer attendu</th><th>Montant reçu</th><th style="text-align:center">Statut</th></tr></thead>
      <tbody>${contractRows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#bbb;font-style:italic">Aucun contrat actif</td></tr>'}</tbody>
    </table>
  </section>

  <!-- Arrears -->
  <section>
    <h2>Arriérés — Mois antérieurs non réglés</h2>
    <table>
      <thead><tr><th>Locataire</th><th>Mois concernés</th><th style="text-align:right">Total dû</th></tr></thead>
      <tbody>${arrearsRows}</tbody>
      ${arrearsByTenant.length > 0 ? `<tfoot><tr style="background:#fef2f2;font-weight:800"><td colspan="2" style="padding:8px 10px;color:#b91c1c">TOTAL ARRIÉRÉS</td><td style="padding:8px 10px;text-align:right;color:#b91c1c">${fCFA(totalArrieres)}</td></tr></tfoot>` : ''}
    </table>
  </section>

  <!-- Advance -->
  <section>
    <h2>Locataires en période d'avance</h2>
    <table>
      <thead><tr><th>Locataire</th><th>Propriété</th><th style="text-align:right">Loyer mensuel</th><th style="text-align:center">1er paiement dû le</th></tr></thead>
      <tbody>${advanceRows}</tbody>
    </table>
  </section>

  <div class="footer">${org.companyName || 'Minsouah'} · Rapport Global · ${today}</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
}

/* ── Monthly Report HTML ──────────────────────────────────────────────────── */
function buildReportHTML(month, paid, unpaid, orgSettings, allPayments = [], advance = [], contracts = [], expenses = [], properties = []) {
  const org = orgSettings || {};
  const orgLogo  = org.logo  || '';
  const orgStamp = org.stamp || '';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fCFA = n => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';

  /* ── Category detection ── */
  const STORE_ICONS = ['store', 'storefront', 'local_grocery_store', 'shopping_bag', 'warehouse'];
  function getCategory(entry) {
    const contract = (contracts || []).find(c =>
      (c.propertyName || '').toLowerCase() === (entry.propertyName || '').toLowerCase()
    );
    const pType = (entry.propertyType || contract?.propertyType || '').toLowerCase();
    const pIcon = entry.propertyIcon || contract?.propertyIcon || '';
    const pName = (entry.propertyName || contract?.propertyName || '').toLowerCase();
    // Detect by type, icon, or "Mag" anywhere in the property name
    if (
      pType.includes('commercial') || pType.includes('magasin') || pType.includes('local') ||
      STORE_ICONS.includes(pIcon) ||
      /\bmag\b|\bmagasin/.test(pName)
    ) {
      return 'Magasins';
    }
    return String(entry.amount || 0);
  }

  /* ── Building metadata DERIVED from the org's actual properties (no hardcoding,
        so each org's report only reflects ITS OWN patrimoine) ── */
  const unitRent = (buildingName, unit) => {
    let rent = Number(unit.rent) || 0;
    if (!rent) {
      const num = String(unit.number || '').toLowerCase();
      const c = (contracts || []).find(c => {
        const pn = (c.propertyName || '').toLowerCase();
        return num && pn.includes(num) && (!buildingName || pn.includes(buildingName.toLowerCase()));
      });
      rent = Number(c?.rent) || 0;
    }
    return rent;
  };
  const unitCatKey = (buildingName, unit) => {
    const type = (unit.type || '').toLowerCase();
    const nm = `${buildingName} ${unit.number || ''}`.toLowerCase();
    if (type.includes('commercial') || type.includes('magasin') || type.includes('local') || /\bmag\b|\bmagasin/.test(nm)) return 'Magasins';
    return String(unitRent(buildingName, unit));
  };
  const CAT_META = {};
  (properties || []).forEach(prop => {
    const bName = prop.name || '';
    const units = prop.isBuilding ? (prop.units || []) : [{ number: '', type: prop.type, rent: prop.rent }];
    units.forEach(u => {
      const key = unitCatKey(bName, u);
      if (!CAT_META[key]) CAT_META[key] = { totalUnits: 0, _b: new Set(), _t: new Set(), _rent: 0 };
      CAT_META[key].totalUnits++;
      if (bName) CAT_META[key]._b.add(bName);
      if (u.type) CAT_META[key]._t.add(u.type);
      const r = unitRent(bName, u);
      if (r && !CAT_META[key]._rent) CAT_META[key]._rent = r;
    });
  });
  Object.keys(CAT_META).forEach(k => {
    const m = CAT_META[k];
    const buildings = [...m._b].join(', ');
    if (k === 'Magasins') { m.label = 'Magasins / Locaux Commerciaux'; m.sublabel = buildings; }
    else {
      const rent = m._rent || Number(k) || 0;
      const types = [...m._t].filter(Boolean).join(', ');
      m.label = buildings || types || 'Logements';
      m.sublabel = `${types ? types + ' · ' : ''}${rent.toLocaleString('fr-FR')} FCFA / mois`;
    }
  });

  /* ── Group by category — only the org's real categories appear ── */
  const CATEGORY_ORDER = Object.keys(CAT_META).sort((a, b) => {
    if (a === 'Magasins') return 1; if (b === 'Magasins') return -1;
    return Number(a) - Number(b);
  });
  const catMap = {};
  CATEGORY_ORDER.forEach(k => { catMap[k] = { paid: [], unpaid: [] }; });
  paid.forEach(p => {
    const cat = getCategory(p);
    if (!catMap[cat]) catMap[cat] = { paid: [], unpaid: [] };
    catMap[cat].paid.push(p);
  });
  unpaid.forEach(p => {
    const cat = getCategory(p);
    if (!catMap[cat]) catMap[cat] = { paid: [], unpaid: [] };
    catMap[cat].unpaid.push(p);
  });

  /* count advance tenants per category to include in occupancy */
  const advCatCount = {};
  advance.forEach(a => {
    const cat = getCategory(a);
    advCatCount[cat] = (advCatCount[cat] || 0) + 1;
  });

  const sortedCats = Object.keys(catMap).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return Number(a) - Number(b);
  });

  function catLabel(cat) {
    return CAT_META[cat]?.label || (cat === 'Magasins' ? 'Magasins / Locaux Commerciaux' : (() => { const n = Number(cat); return isNaN(n) ? cat : `${n.toLocaleString('fr-FR')} FCFA / mois`; })());
  }

  /* ── Mini donut per category ── */
  function miniDonut(paidAmt, totalAmt) {
    const R = 40; const CX = 50; const CY = 50;
    const circ = +(2 * Math.PI * R).toFixed(2);
    const rate = totalAmt > 0 ? Math.round(paidAmt / totalAmt * 100) : 0;
    const arc = totalAmt > 0 ? +((paidAmt / totalAmt) * circ).toFixed(2) : 0;
    const rc = rate >= 80 ? '#15803d' : rate >= 50 ? '#b45309' : '#b91c1c';
    return `<svg viewBox="0 0 100 100" width="90" height="90">
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#fecaca" stroke-width="18"/>
      ${arc > 0 ? `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#4ade80" stroke-width="18"
        stroke-dasharray="${arc} ${circ}" transform="rotate(-90 ${CX} ${CY})"/>` : ''}
      <text x="${CX}" y="${CY - 4}" text-anchor="middle" font-size="18" font-weight="900" fill="${rc}">${rate}%</text>
      <text x="${CX}" y="${CY + 12}" text-anchor="middle" font-size="8" fill="#aaa">Encaissé</text>
    </svg>`;
  }

  /* ── Per-category section ── */
  function catSection(cat, data) {
    const meta = CAT_META[cat] || {};
    const paidAmt = data.paid.reduce((s, p) => s + (p.amount || 0), 0);
    const unpaidAmt = data.unpaid.reduce((s, p) => s + (p.amount || 0), 0);
    const totalAmt = paidAmt + unpaidAmt;
    const occupied = data.paid.length + data.unpaid.length + (advCatCount[cat] || 0);
    const totalUnits = meta.totalUnits || null;
    const disponibles = totalUnits !== null ? totalUnits - occupied : null;

    const paidRows = data.paid.map(p => `<tr>
      <td>${p.propertyName || '—'}</td><td>${p.tenantName || '—'}</td>
      <td style="text-align:right;font-weight:700;color:#15803d">${fCFA(p.amount)}</td>
      <td>${p.paidDate || '—'}</td><td style="text-align:center">${p.method || '—'}</td>
    </tr>`).join('');
    const unpaidRows = data.unpaid.map(p => `<tr>
      <td>${p.propertyName || '—'}</td><td>${p.tenantName || '—'}</td>
      <td style="text-align:right;font-weight:700;color:#b91c1c">${fCFA(p.amount)}</td>
      <td>${p.dueDate || '—'}</td>
      <td style="text-align:center;font-weight:600;color:${p.status === 'En retard' ? '#92400e' : '#b91c1c'}">${p.status || 'Impayé'}</td>
    </tr>`).join('');

    return `<div class="cat-section">
  <div class="cat-header">
    <div>
      <div class="cat-title">${catLabel(cat)}</div>
      ${meta.sublabel ? `<div style="font-size:10px;color:#aaa;margin-top:2px">${meta.sublabel}</div>` : ''}
    </div>
    <div class="cat-stats" style="flex-direction:column;align-items:flex-end;gap:4px">
      <div style="display:flex;gap:6px">
        <span class="badge" style="background:#dcfce7;color:#15803d">${data.paid.length} payé(s)</span>
        ${data.unpaid.length > 0 ? `<span class="badge" style="background:#fee2e2;color:#b91c1c">${data.unpaid.length} impayé(s)</span>` : ''}
      </div>
      ${totalUnits !== null ? `<div style="font-size:10px;color:#888">${occupied} loué(s) sur ${totalUnits}${disponibles !== null && disponibles > 0 ? ` · <span style="color:#0369a1;font-weight:700">${disponibles} disponible(s)</span>` : ''}</div>` : ''}
      ${meta.note ? `<div style="font-size:10px;color:#999">${meta.note}</div>` : ''}
    </div>
  </div>
  <div class="cat-body">
    <div class="cat-donut">
      ${miniDonut(paidAmt, totalAmt)}
      <div style="font-size:9px;color:#15803d;margin-top:4px">■ ${Number(paidAmt).toLocaleString('fr-FR')} FCFA</div>
      ${unpaidAmt > 0 ? `<div style="font-size:9px;color:#b91c1c;margin-top:2px">■ ${Number(unpaidAmt).toLocaleString('fr-FR')} FCFA</div>` : ''}
    </div>
    <div class="cat-tables">
      ${data.paid.length > 0 ? `<div class="sub-title" style="color:#15803d">✓ Paiements reçus</div>
      <table><thead><tr><th>Propriété</th><th>Locataire</th><th style="text-align:right">Montant</th><th>Payé le</th><th style="text-align:center">Mode</th></tr></thead>
      <tbody>${paidRows}</tbody></table>` : ''}
      ${data.unpaid.length > 0 ? `<div class="sub-title" style="color:#b91c1c">⚠ Loyers impayés</div>
      <table><thead><tr><th>Propriété</th><th>Locataire</th><th style="text-align:right">Montant dû</th><th>Échéance</th><th style="text-align:center">Statut</th></tr></thead>
      <tbody>${unpaidRows}</tbody></table>` : ''}
    </div>
  </div>
</div>`;
  }

  const categorySections = sortedCats.map(cat => catSection(cat, catMap[cat])).join('');

  /* ── Global KPIs ── */
  const totalCollected = paid.reduce((s, p) => s + (p.amount || 0), 0);
  const totalUnpaid = unpaid.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCommission = paid.reduce((s, p) => s + (p.commissionAmount != null ? p.commissionAmount : 0), 0);
  const totalNetOwner = totalCollected - totalCommission;
  const totalExpenses = expenses.reduce((s, t) => s + (t.amount || 0), 0);
  const netResult = totalCollected - totalExpenses;
  const total = totalCollected + totalUnpaid;
  const rateAmt = total > 0 ? Math.round(totalCollected / total * 100) : 0;
  const rateColor = rateAmt >= 80 ? '#15803d' : rateAmt >= 50 ? '#b45309' : '#b91c1c';
  const netColor = netResult >= 0 ? '#15803d' : '#b91c1c';

  /* ── Advance tenants section ── */
  const advanceSection = advance.length > 0 ? (() => {
    const advRows = advance.map(a => {
      const sinceStr = a.since ? new Date(a.since).toLocaleDateString('fr-CI') : '—';
      const nextStr = a.paymentStartDate ? new Date(a.paymentStartDate).toLocaleDateString('fr-CI') : '—';
      return `<tr>
        <td>${a.propertyName || '—'}</td><td>${a.tenantName || '—'}</td>
        <td>${sinceStr}</td>
        <td style="text-align:right;color:#92400e;font-weight:700">${fCFA(a.amount)}</td>
        <td style="text-align:center;color:#0369a1;font-weight:700">${nextStr}</td>
      </tr>`;
    }).join('');
    return `<div class="cat-section" style="border-color:#bfdbfe">
  <div class="cat-header" style="background:#eff6ff">
    <div class="cat-title" style="color:#0369a1">🕐 Locataires en période d'avance</div>
    <div class="cat-stats"><span class="badge" style="background:#dbeafe;color:#0369a1">${advance.length} locataire(s) — 1er loyer non encore échu</span></div>
  </div>
  <table style="margin:0"><thead><tr><th>Propriété</th><th>Locataire</th><th>Date d'entrée</th><th style="text-align:right">Loyer mensuel</th><th style="text-align:center">1er loyer dû le</th></tr></thead>
  <tbody>${advRows}</tbody></table>
</div>`;
  })() : '';

  /* ── Synthesis: per-category summary ── */
  const synthRows = sortedCats.map(cat => {
    const data = catMap[cat];
    const paidAmt = data.paid.reduce((s, p) => s + (p.amount || 0), 0);
    const unpaidAmt = data.unpaid.reduce((s, p) => s + (p.amount || 0), 0);
    const totalCat = paidAmt + unpaidAmt;
    const rate = totalCat > 0 ? Math.round(paidAmt / totalCat * 100) : 0;
    const rc = rate >= 80 ? '#15803d' : rate >= 50 ? '#b45309' : '#b91c1c';
    return `<tr>
      <td>${catLabel(cat)}</td>
      <td style="text-align:center">${data.paid.length + data.unpaid.length}</td>
      <td style="text-align:right;color:#15803d;font-weight:700">${Number(paidAmt).toLocaleString('fr-FR')}</td>
      <td style="text-align:right;color:#b91c1c;font-weight:700">${Number(unpaidAmt).toLocaleString('fr-FR')}</td>
      <td style="text-align:right;font-weight:700;color:#785a00">${Number(totalCat).toLocaleString('fr-FR')}</td>
      <td style="text-align:center;font-weight:700;color:${rc}">${rate}%</td>
    </tr>`;
  }).join('');

  /* ── Expenses table ── */
  const expenseRows = expenses.length > 0
    ? expenses.map(t => `<tr>
        <td>${t.label || t.description || '—'}</td>
        <td>${t.date ? new Date(t.date).toLocaleDateString('fr-CI') : '—'}</td>
        <td style="text-align:right;color:#b91c1c;font-weight:700">${fCFA(t.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:#bbb;font-style:italic">Aucune dépense enregistrée</td></tr>';

  /* ── 6-month trend chart ── */
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
    return { label: m, rate: tA > 0 ? Math.round(pA / tA * 100) : null, collected: pA };
  });
  const TW = 520; const TH = 165;
  const pL = 40; const pR = 20; const pT = 18; const pB = 38;
  const plotW = TW - pL - pR; const plotH = TH - pT - pB;
  const tPts = trendData.map((d, i) => ({ x: pL + (i / 5) * plotW, y: d.rate !== null ? pT + plotH - (d.rate / 100) * plotH : null, d }));
  const validPts = tPts.filter(p => p.y !== null);
  const linePath = validPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = validPts.length > 0
    ? `M${validPts[0].x.toFixed(1)},${(pT + plotH).toFixed(1)} ` + validPts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${validPts[validPts.length - 1].x.toFixed(1)},${(pT + plotH).toFixed(1)}Z` : '';
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
    <text x="${x.toFixed(1)}" y="${(TH - 3).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="${isCur ? '#785a00' : '#bbb'}" font-weight="${isCur ? 700 : 400}">${mn.slice(0, 3)} ${yr.slice(2)}</text>`;
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

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"><title>Rapport Financier — ${month}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#1c1b19;background:#fff;font-size:13px}
.page{max-width:950px;margin:0 auto;padding:32px 36px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #785a00;padding-bottom:16px;margin-bottom:20px}
.brand{font-size:24px;font-weight:900;color:#785a00;letter-spacing:-0.5px}
.brand-sub{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:2px;margin-top:3px}
.report-meta{text-align:right}
.report-meta h1{font-size:16px;font-weight:800}
.report-meta p{font-size:11px;color:#aaa;margin-top:3px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.kpi{background:#fafaf8;border:1px solid #ede8e0;border-radius:10px;padding:12px 10px}
.kpi-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:6px}
.kpi-v{font-size:17px;font-weight:800;line-height:1}
.kpi-s{font-size:10px;color:#bbb;margin-top:4px}
.cat-section{border:1px solid #ede8e0;border-radius:12px;margin-bottom:16px;overflow:hidden}
.cat-header{background:#fafaf8;padding:11px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ede8e0}
.cat-title{font-size:13px;font-weight:800;color:#785a00}
.cat-stats{display:flex;gap:6px;flex-wrap:wrap}
.cat-body{display:flex;align-items:flex-start}
.cat-donut{padding:12px 10px;min-width:108px;text-align:center;border-right:1px solid #f5f0ea}
.cat-tables{flex:1;padding:8px 12px}
.sub-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:6px 0 5px}
.badge{display:inline-flex;align-items:center;justify-content:center;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:8px}
thead th{background:#785a00;color:#fff;padding:6px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.8px}
tbody td{padding:6px 9px;border-bottom:1px solid #f5f0ea}
tbody tr:last-child td{border-bottom:none}
tbody tr:nth-child(even){background:#fdf9f5}
.section-divider{border:none;border-top:2px dashed #e8d5b7;margin:22px 0}
.synth-section{border:2px solid #785a00;border-radius:12px;overflow:hidden;margin-bottom:16px}
.synth-header{background:#785a00;color:#fff;padding:12px 16px;font-size:14px;font-weight:800}
.synth-body{padding:14px 16px}
.synth-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.synth-kpi{border:1px solid #ede8e0;border-radius:10px;padding:12px;text-align:center}
.synth-kpi-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:6px}
.synth-kpi-v{font-size:20px;font-weight:900}
.synth-kpi-s{font-size:10px;color:#bbb;margin-top:4px}
.synth-sub{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin:14px 0 7px}
.trend-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#aaa;margin:14px 0 7px}
.footer{border-top:1px solid #ede8e0;padding-top:10px;margin-top:4px;display:flex;justify-content:space-between;font-size:10px;color:#ccc}
@media print{.page{padding:16px 20px}.cat-section{break-inside:avoid}.synth-section{break-inside:avoid}}
</style></head>
<body><div class="page">

<div class="header">
  <div style="display:flex;align-items:center;gap:12px">
    ${orgLogo
      ? `<img src="${orgLogo}" style="max-height:56px;max-width:140px;object-fit:contain"/>`
      : `<div><div class="brand">${org.companyName || 'Minsouah'}</div><div class="brand-sub">Gestion Immobilière</div></div>`
    }
  </div>
  <div class="report-meta" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
    <div>
      <h1>Rapport Financier — ${month}</h1>
      <p>Généré le ${today}</p>
      <p style="margin-top:2px">${paid.length + unpaid.length} dossier(s) · ${paid.length} payé(s) · ${unpaid.length} impayé(s)${advance.length > 0 ? ` · ${advance.length} en avance` : ''}</p>
    </div>
    ${orgStamp ? `<img src="${orgStamp}" style="max-height:48px;max-width:48px;object-fit:contain;opacity:0.85"/>` : ''}
  </div>
</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-l">Loyers attendus</div><div class="kpi-v" style="color:#785a00">${Number(total).toLocaleString('fr-FR')}</div><div class="kpi-s">FCFA</div></div>
  <div class="kpi"><div class="kpi-l">Encaissé</div><div class="kpi-v" style="color:#15803d">${Number(totalCollected).toLocaleString('fr-FR')}</div><div class="kpi-s">FCFA · ${paid.length} locataire(s)</div></div>
  <div class="kpi"><div class="kpi-l">Impayés</div><div class="kpi-v" style="color:#b91c1c">${Number(totalUnpaid).toLocaleString('fr-FR')}</div><div class="kpi-s">FCFA · ${unpaid.length} locataire(s)</div></div>
  <div class="kpi"><div class="kpi-l">Recouvrement</div><div class="kpi-v" style="color:${rateColor}">${rateAmt}%</div><div class="kpi-s">${paid.length + unpaid.length > 0 ? Math.round(paid.length / (paid.length + unpaid.length) * 100) : 0}% des dossiers</div></div>
</div>

${categorySections}

${advanceSection}

<hr class="section-divider"/>

<div class="synth-section">
  <div class="synth-header">📊 Synthèse Financière — ${month}</div>
  <div class="synth-body">

    <div class="synth-kpis">
      <div class="synth-kpi"><div class="synth-kpi-l">Loyers bruts encaissés</div><div class="synth-kpi-v" style="color:#15803d">${Number(totalCollected).toLocaleString('fr-FR')}</div><div class="synth-kpi-s">FCFA</div></div>
      <div class="synth-kpi"><div class="synth-kpi-l">Commission Minsouah</div><div class="synth-kpi-v" style="color:#b45309">${Number(totalCommission).toLocaleString('fr-FR')}</div><div class="synth-kpi-s">FCFA</div></div>
      <div class="synth-kpi" style="background:#f0fdf4"><div class="synth-kpi-l">Net propriétaires</div><div class="synth-kpi-v" style="color:#15803d">${Number(totalNetOwner).toLocaleString('fr-FR')}</div><div class="synth-kpi-s">FCFA</div></div>
      <div class="synth-kpi"><div class="synth-kpi-l">Total dépenses</div><div class="synth-kpi-v" style="color:#b91c1c">${Number(totalExpenses).toLocaleString('fr-FR')}</div><div class="synth-kpi-s">FCFA</div></div>
      <div class="synth-kpi" style="background:${netResult >= 0 ? '#f0fdf4' : '#fef2f2'}"><div class="synth-kpi-l">Résultat net</div><div class="synth-kpi-v" style="color:${netColor}">${netResult >= 0 ? '+' : ''}${Number(netResult).toLocaleString('fr-FR')}</div><div class="synth-kpi-s">FCFA</div></div>
    </div>

    <div class="synth-sub" style="color:#785a00">Récapitulatif par catégorie</div>
    <table>
      <thead><tr><th>Catégorie</th><th style="text-align:center">Dossiers</th><th style="text-align:right">Encaissé (FCFA)</th><th style="text-align:right">Impayé (FCFA)</th><th style="text-align:right">Total (FCFA)</th><th style="text-align:center">Taux</th></tr></thead>
      <tbody>
        ${synthRows}
        <tr style="font-weight:800;background:#fdf5e6">
          <td>Total</td>
          <td style="text-align:center">${paid.length + unpaid.length}</td>
          <td style="text-align:right;color:#15803d">${Number(totalCollected).toLocaleString('fr-FR')}</td>
          <td style="text-align:right;color:#b91c1c">${Number(totalUnpaid).toLocaleString('fr-FR')}</td>
          <td style="text-align:right;color:#785a00">${Number(total).toLocaleString('fr-FR')}</td>
          <td style="text-align:center;color:${rateColor}">${rateAmt}%</td>
        </tr>
      </tbody>
    </table>

    <div class="synth-sub" style="color:#b91c1c">Dépenses du mois</div>
    <table>
      <thead><tr><th>Libellé</th><th>Date</th><th style="text-align:right">Montant (FCFA)</th></tr></thead>
      <tbody>
        ${expenseRows}
        ${expenses.length > 0 ? `<tr style="font-weight:800;background:#fef2f2"><td colspan="2">Total dépenses</td><td style="text-align:right;color:#b91c1c">${Number(totalExpenses).toLocaleString('fr-FR')}</td></tr>` : ''}
      </tbody>
    </table>

    <div class="trend-title">Évolution du taux de recouvrement — 6 derniers mois</div>
    ${trendSVG}

  </div>
</div>

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

/* ── Post-clôture report ──────────────────────────────────────────────────── */
function buildPostClotureHTML(closure, postPmts, pendingPmts, orgSettings) {
  const org = orgSettings || {};
  const orgLogo = org.logo || '';
  const fCFA = n => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const snap = closure.snapshot || {};
  const closedDate = closure.closedAt ? new Date(closure.closedAt).toLocaleDateString('fr-FR') : '—';
  const totalPost = postPmts.reduce((s, p) => s + (p.amount || 0), 0);
  const pending = pendingPmts || [];
  const totalPending = pending.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingRows = pending.map(p => `<tr>
    <td style="padding:8px 10px">${p.propertyName || '—'}</td>
    <td style="padding:8px 10px;font-weight:600">${p.tenantName || '—'}</td>
    <td style="padding:8px 10px;text-align:right;font-weight:700;color:#b91c1c">${fCFA(p.amount)}</td>
    <td style="padding:8px 10px">${p.tenantPhone || '—'}</td>
  </tr>`).join('');
  const newTotal = (snap.totalCollected || 0) + totalPost;
  const newRate = snap.totalExpected > 0 ? Math.round(newTotal / snap.totalExpected * 100) : 0;

  const postRows = postPmts.map(p => `<tr>
    <td style="padding:8px 10px">${p.propertyName || '—'}</td>
    <td style="padding:8px 10px;font-weight:600">${p.tenantName || '—'}</td>
    <td style="padding:8px 10px;text-align:right;font-weight:700;color:#15803d">${fCFA(p.amount)}</td>
    <td style="padding:8px 10px">${p.paidDate || '—'}</td>
    <td style="padding:8px 10px">${p.method || '—'}</td>
  </tr>`).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Paiements post-clôture — ${closure.month}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4 portrait;margin:12mm 14mm}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1c1b19;font-size:12px;background:#fff}
  .page{padding:14px 18px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #785a00;padding-bottom:10px;margin-bottom:16px}
  .brand{font-size:20px;font-weight:900;color:#785a00}
  .org-logo{max-height:52px;max-width:130px;object-fit:contain}
  .doc-info{text-align:right}
  .doc-info h2{font-size:14px;font-weight:700}
  .doc-info p{font-size:10px;color:#817662;margin-top:2px}
  .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700}
  .badge-amber{background:#fef3c7;color:#92400e}
  .badge-green{background:#dcfce7;color:#15803d}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
  .box{background:#fff8f2;border:1px solid #e3d9cc;border-radius:8px;padding:12px}
  .box-title{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#817662;font-weight:700;margin-bottom:6px}
  .box-row{display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid #f0e8de}
  .box-row:last-child{border:none;font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px}
  thead tr{background:#785a00}
  th{padding:7px 10px;text-align:left;font-size:10px;color:#fff;text-transform:uppercase;letter-spacing:.5px}
  tr:nth-child(even){background:#fafaf9}
  .footer{margin-top:14px;padding-top:8px;border-top:1px solid #e3d9cc;font-size:9px;color:#b0a090;text-align:center}
  @media print{html,body{height:100%}}
</style>
</head><body><div class="page">
  <div class="header">
    <div>
      ${orgLogo ? `<img src="${orgLogo}" alt="logo" class="org-logo"/>` : `<div class="brand">${org.companyName || 'Minsouah'}</div>`}
    </div>
    <div class="doc-info">
      <h2>Paiements Post-Clôture</h2>
      <p>Mois de référence : <strong>${closure.month}</strong></p>
      <p>Clôture effectuée le : ${closedDate}</p>
      <p>Édité le ${today}</p>
    </div>
  </div>

  <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#92400e">
    <strong>⚠ Ce rapport concerne des paiements reçus APRÈS la clôture du mois ${closure.month}.</strong>
    ${closure.closedBy ? ` Clôture effectuée par ${closure.closedBy}.` : ''}
    ${closure.note ? `<br>Note : ${closure.note}` : ''}
  </div>

  <div class="grid2">
    <div class="box">
      <div class="box-title">Bilan de clôture initial</div>
      <div class="box-row"><span>Attendu</span><span>${fCFA(snap.totalExpected)}</span></div>
      <div class="box-row"><span>Encaissé à la clôture</span><span style="color:#15803d;font-weight:700">${fCFA(snap.totalCollected)}</span></div>
      <div class="box-row"><span>Impayés à la clôture</span><span style="color:#b91c1c;font-weight:700">${fCFA(snap.totalUnpaid)}</span></div>
    </div>
    <div class="box">
      <div class="box-title">Après paiements post-clôture</div>
      <div class="box-row"><span>Reçu post-clôture</span><span style="color:#0369a1;font-weight:700">${fCFA(totalPost)}</span></div>
      <div class="box-row"><span>Total encaissé cumulé</span><span style="color:#15803d;font-weight:800">${fCFA(newTotal)}</span></div>
      <div class="box-row"><span>Taux de recouvrement révisé</span><span style="font-weight:800;color:${newRate >= 80 ? '#15803d' : '#b45309'}">${newRate}%</span></div>
    </div>
  </div>

  <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#785a00;font-weight:800;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e3d9cc">
    Détail des paiements post-clôture (${postPmts.length})
  </h3>
  <table>
    <thead><tr><th>Propriété</th><th>Locataire</th><th style="text-align:right">Montant</th><th>Date paiement</th><th>Mode</th></tr></thead>
    <tbody>${postRows || '<tr><td colspan="5" style="text-align:center;padding:12px;color:#bbb;font-style:italic">Aucun paiement post-clôture</td></tr>'}</tbody>
    ${postPmts.length > 0 ? `<tfoot><tr style="background:#dcfce7;font-weight:800"><td colspan="2" style="padding:8px 10px;color:#15803d">TOTAL POST-CLÔTURE</td><td style="padding:8px 10px;text-align:right;color:#15803d">${fCFA(totalPost)}</td><td colspan="2"></td></tr></tfoot>` : ''}
  </table>

  <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#b45309;font-weight:800;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid #e3d9cc">
    Locataires à régler après échéance (${pending.length})
  </h3>
  <p style="font-size:10px;color:#817662;margin-bottom:8px">Locataires n'ayant pas encore payé le loyer de ${closure.month} — paiements attendus après la date d'échéance.</p>
  <table>
    <thead><tr><th>Propriété</th><th>Locataire</th><th style="text-align:right">Montant dû</th><th>Téléphone</th></tr></thead>
    <tbody>${pendingRows || '<tr><td colspan="4" style="text-align:center;padding:12px;color:#15803d;font-style:italic">Tous les loyers ont été réglés ✓</td></tr>'}</tbody>
    ${pending.length > 0 ? `<tfoot><tr style="background:#fee2e2;font-weight:800"><td colspan="2" style="padding:8px 10px;color:#b91c1c">TOTAL RESTANT À RÉGLER</td><td style="padding:8px 10px;text-align:right;color:#b91c1c">${fCFA(totalPending)}</td><td></td></tr></tfoot>` : ''}
  </table>

  <div class="footer">${org.companyName || 'Minsouah'} · Rapport Post-Clôture ${closure.month} · ${today}</div>
</div>
<script>window.onload=()=>window.print();</script>
</body></html>`;
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function Payments() {
  const { state, dispatch } = useApp();
  const { orgSettings, budgets = [] } = state;
  // Strict org isolation: even if the store somehow holds cross-org rows
  // (e.g. multi-org admin), every report/list here only counts the ACTIVE org's
  // patrimoine. Rows carry orgId; when an active org is set we keep only its rows.
  const myOrgId = state.currentUser?.orgId || null;
  const scopeOrg = (arr) => (myOrgId ? (arr || []).filter(x => x.orgId === myOrgId) : (arr || []));
  const payments      = useMemo(() => scopeOrg(state.payments),      [state.payments, myOrgId]);      // eslint-disable-line react-hooks/exhaustive-deps
  const properties    = useMemo(() => scopeOrg(state.properties),    [state.properties, myOrgId]);    // eslint-disable-line react-hooks/exhaustive-deps
  const tenants       = useMemo(() => scopeOrg(state.tenants),       [state.tenants, myOrgId]);       // eslint-disable-line react-hooks/exhaustive-deps
  const contracts     = useMemo(() => scopeOrg(state.contracts),     [state.contracts, myOrgId]);     // eslint-disable-line react-hooks/exhaustive-deps
  const transactions  = useMemo(() => scopeOrg(state.transactions),  [state.transactions, myOrgId]);  // eslint-disable-line react-hooks/exhaustive-deps
  const monthClosures = useMemo(() => scopeOrg(state.monthClosures), [state.monthClosures, myOrgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fine-grained permissions for this module
  const canCreate = can(state.currentUser, 'payments', 'create');
  const canEdit   = can(state.currentUser, 'payments', 'edit');
  const canDelete = can(state.currentUser, 'payments', 'delete');

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
  const [payForm, setPayForm] = useState({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces', withPenalty: false });
  const [quittancePayment, setQuittancePayment] = useState(null);
  const qrReceiptRef = useRef(null);
  const quittanceVerifyUrl = (p) => `${window.location.origin}/#/quittance/${p?.id || ''}`;

  /* ── Edit / delete / cancel modals ── */
  const [editModal, setEditModal]     = useState(null); // payment object
  const [editForm, setEditForm]       = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // payment object

  /* ── Reminder modal ── */
  const [reminderModal, setReminderModal] = useState(null);

  /* ── Month closure modal ── */
  const [closureModal, setClosureModal] = useState(false);
  const [closureNote, setClosureNote]   = useState('');
  const [closureLoading, setClosureLoading] = useState(false);

  /* ── Budget vs Réalisé ── */
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [budgetInput, setBudgetInput]       = useState('');

  /* ── Arrears add modal ── */
  const [arrearsAddModal, setArrearsAddModal] = useState(false);
  const [arrearsAddForm, setArrearsAddForm] = useState({ tenantId: '', months: [], amountPerMonth: '', status: 'Impayé', propertyName: '' });
  const [arrearsSelected, setArrearsSelected] = useState(new Set());
  const [arrearsExpanded, setArrearsExpanded] = useState(new Set());
  const [arrearsSearch, setArrearsSearch] = useState('');

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
            unitNumber: unit.number,
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

  /* ── Property name fuzzy match helpers ── */
  const propNameMatch = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    return a.startsWith(b + ' (') || b.startsWith(a + ' (');
  };
  const normProp = s => (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[—–\-]/g, '-').replace(/\s+/g, ' ').trim();
  // Strip trailing floor suffix "(RDC)" / "()" for loose comparison
  const stripFloor = s => normProp(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
  // Check if two property names match under any normalization
  const propMatch = (cName, optName) =>
    propNameMatch(cName, optName) ||
    normProp(cName) === normProp(optName) ||
    stripFloor(cName) === stripFloor(optName);

  /* ── Tenants matching the selected property (no paid exclusion — allows advance payments) ── */
  const paidThisMonthSet = useMemo(() => new Set(
    (payments || [])
      .filter(p => p.month === payForm.month && p.status === 'Payé')
      .flatMap(p => [String(p.tenantId), (p.tenantName || '').toLowerCase()])
      .filter(Boolean)
  ), [payments, payForm.month]);

  const matchingTenants = useMemo(() => {
    if (!payForm.propertyKey) return tenants || [];
    const selected = allPropertyOptions.find(o => o.value === payForm.propertyKey);
    if (!selected) return tenants || [];

    return (tenants || []).filter(t => {
      const tName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
      return (contracts || []).some(c => {
        if (!['Actif', 'Expirant', 'Brouillon'].includes(c.status)) return false;
        const tenantOk = String(c.tenantId) === String(t.id) || c.tenant === tName;
        if (!tenantOk) return false;
        if (selected.isUnit) {
          // Tier 1: name-based match (exact / floor-stripped / normalized)
          if (propMatch(c.propertyName, selected.propertyName)) return true;
          // Tier 2: building ID + unit number appears in contract property name
          if (String(c.propertyId) === String(selected.buildingId) && selected.unitNumber &&
              normProp(c.propertyName).includes(normProp(selected.unitNumber))) return true;
          // Tier 3 (last resort): building ID alone — for contracts that only store building name
          return String(c.propertyId) === String(selected.buildingId);
        }
        return propMatch(c.propertyName, selected.propertyName) ||
               propMatch(c.propertyName, selected.buildingName) ||
               String(c.propertyId) === String(selected.buildingId);
      });
    });
  }, [payForm.propertyKey, allPropertyOptions, tenants, contracts]);

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

  /* ── Current month unpaid (for Rappels tab) ──
     Combine explicit unpaid payment records with active-contract tenants who
     have NO payment record yet for the current month (records are only created
     when a payment is entered, so unpaid tenants have no record at all).
     Tenants still in their advance period (paymentStartDate not yet reached)
     are excluded. Mirrors the reportUnpaid / penaltyList logic. */
  const currentMonthUnpaid = useMemo(() => {
    const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRecords = (payments || []).filter(p => p.month === currentMonthLabel);
    // Explicit unpaid records (real payment docs) keep their id / reminderCount
    const explicit = monthRecords.filter(p => p.status !== 'Payé');
    // Names already covered by a record this month (paid OR unpaid) — don't duplicate
    const alreadyInMonth = new Set(
      monthRecords.map(p => (p.tenantName || '').toLowerCase().trim()).filter(Boolean)
    );

    const synthesized = [];
    (contracts || [])
      .filter(c => c.status === 'Actif' || c.status === 'Expirant')
      .filter(c => !alreadyInMonth.has((c.tenant || '').toLowerCase().trim()))
      .forEach(c => {
        const tenant = (tenants || []).find(t =>
          (t.name || '').toLowerCase().trim() === (c.tenant || '').toLowerCase().trim() ||
          (c.tenantId && String(t.id) === String(c.tenantId))
        );
        const psDate = tenant?.paymentStartDate ? new Date(tenant.paymentStartDate) : null;
        // Skip tenants whose payment starts in a LATER month (still in advance).
        if (psDate && currentDate < monthFirst(psDate)) return;
        synthesized.push({
          id: `synth-${c.id}`,
          isSynthetic: true,
          contractId: c.id,
          tenantId: c.tenantId || tenant?.id || null,
          tenantName: c.tenant || '',
          tenantPhone: tenant?.phone || '',
          tenantEmail: tenant?.email || '',
          propertyName: c.propertyName || '',
          amount: c.rent || 0,
          month: currentMonthLabel,
          status: 'Impayé',
          reminderCount: 0,
        });
      });

    return [...explicit, ...synthesized];
  }, [payments, currentMonthLabel, contracts, tenants, now]);

  /* ── Active tenants in their ADVANCE period this month (paid caution/avance,
        payment starts a later month) → not due this month, shown for clarity ── */
  const currentMonthAdvance = useMemo(() => {
    const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const alreadyInMonth = new Set(
      (payments || []).filter(p => p.month === currentMonthLabel)
        .map(p => (p.tenantName || '').toLowerCase().trim()).filter(Boolean)
    );
    const out = [];
    (contracts || [])
      .filter(c => c.status === 'Actif' || c.status === 'Expirant')
      .filter(c => !alreadyInMonth.has((c.tenant || '').toLowerCase().trim()))
      .forEach(c => {
        const tenant = (tenants || []).find(t =>
          (t.name || '').toLowerCase().trim() === (c.tenant || '').toLowerCase().trim() ||
          (c.tenantId && String(t.id) === String(c.tenantId))
        );
        const psDate = tenant?.paymentStartDate ? new Date(tenant.paymentStartDate) : null;
        if (psDate && currentDate < monthFirst(psDate)) {
          out.push({ tenantName: c.tenant || '', propertyName: c.propertyName || '', amount: c.rent || 0, paymentStartDate: tenant.paymentStartDate });
        }
      });
    return out;
  }, [payments, currentMonthLabel, contracts, tenants, now]);

  /* ── Penalty list: active tenants who haven't paid for current month ── */
  const penaltyList = useMemo(() => {
    const currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const paidThisMonth = new Set(
      (payments || [])
        .filter(p => p.month === currentMonthLabel && p.status === 'Payé')
        .map(p => (p.tenantName || '').toLowerCase().trim())
        .filter(Boolean)
    );
    return (contracts || [])
      .filter(c => c.status === 'Actif' || c.status === 'Expirant')
      .filter(c => !paidThisMonth.has((c.tenant || '').toLowerCase().trim()))
      .filter(c => {
        const tenant = (tenants || []).find(t =>
          (t.name || '').toLowerCase().trim() === (c.tenant || '').toLowerCase().trim() ||
          (c.tenantId && String(t.id) === String(c.tenantId))
        );
        const psDate = tenant?.paymentStartDate ? new Date(tenant.paymentStartDate) : null;
        return !psDate || currentDate >= monthFirst(psDate);
      })
      .map(c => {
        const tenant = (tenants || []).find(t =>
          (t.name || '').toLowerCase().trim() === (c.tenant || '').toLowerCase().trim() ||
          (c.tenantId && String(t.id) === String(c.tenantId))
        );
        const rent = c.rent || 0;
        const penalty = Math.round(rent * 0.10);
        return {
          contractId: c.id,
          tenantName: c.tenant || '',
          tenantPhone: tenant?.phone || '',
          tenantEmail: tenant?.email || '',
          tenantId: c.tenantId || tenant?.id || null,
          propertyName: c.propertyName || '',
          rent,
          penalty,
          total: rent + penalty,
        };
      });
  }, [contracts, payments, currentMonthLabel, tenants, now]);

  /* ── Arrears: unpaid payments from months BEFORE the current month ── */
  // Arrears = explicit unpaid records from months BEFORE the current month.
  // These are created when a month is closed (CLOSE_MONTH turns unpaid active
  // tenants into "Impayé" records) or entered manually — NOT auto-synthesized.
  const arrearsList = useMemo(() => {
    const cy = now.getFullYear();
    const cm = now.getMonth();
    return (payments || []).filter(p => {
      if (p.status === 'Payé' || p.status === 'Annulé') return false;
      if (!p.month) return false;
      const [mn, yr] = p.month.split(' ');
      const idx = MONTH_NAMES.indexOf(mn);
      if (idx === -1) return false;
      const y = parseInt(yr);
      return y < cy || (y === cy && idx < cm);
    });
  }, [payments, now]);
  const arrearsTotal = arrearsList.reduce((s, p) => s + (p.amount || 0), 0);

  /* ── Arrears grouped by tenant ── */
  const arrearsByTenant = useMemo(() => {
    const groups = {};
    arrearsList.forEach(p => {
      const key = (p.tenantName || '—').toLowerCase();
      if (!groups[key]) groups[key] = { tenantName: p.tenantName || '—', tenantPhone: p.tenantPhone || '', payments: [], total: 0 };
      groups[key].payments.push(p);
      groups[key].total += p.amount || 0;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [arrearsList]);

  /* ── Report month payments ── */
  const reportPaid = monthPmts.filter(p => p.status === 'Payé');

  // Helper: convert "Juin 2026" → Date(2026, 5, 1)
  const monthLabelToDate = (label) => {
    const [mn, yr] = (label || '').split(' ');
    const idx = MONTH_NAMES.indexOf(mn);
    return idx >= 0 ? new Date(parseInt(yr), idx, 1) : null;
  };
  const selectedDate = monthLabelToDate(selectedMonth);

  // A payment is "anticipé" (advance) when it was settled BEFORE the month it covers
  // (e.g. a tenant paying several months upfront → one 'Payé' record per month).
  const isAdvancePayment = (p) => {
    if (p.status !== 'Payé' || !p.paidDate) return false;
    const paid = parseTxDate(p.paidDate) || new Date(p.paidDate);
    const monthStart = monthLabelToDate(p.month);
    return !!(paid && !isNaN(paid) && monthStart && paid < monthStart);
  };

  // Unpaid = explicit records (status != Payé) + active-contract tenants with no payment record
  //          BUT exclude those still in their advance period (paymentStartDate not yet reached)
  // Advance = active-contract tenants whose paymentStartDate is after the selected month
  const { reportUnpaid, reportAdvance } = (() => {
    const explicit = monthPmts.filter(p => p.status !== 'Payé');
    const alreadyInReport = new Set(monthPmts.map(p => (p.tenantName || '').toLowerCase().trim()));

    const unpaid = [...explicit];
    const advance = [];

    (contracts || [])
      .filter(c => (c.status === 'Actif' || c.status === 'Expirant') && !alreadyInReport.has((c.tenant || '').toLowerCase().trim()))
      .forEach(c => {
        const tenant = (tenants || []).find(t =>
          (t.name || '').toLowerCase().trim() === (c.tenant || '').toLowerCase().trim() ||
          (c.tenantId && String(t.id) === String(c.tenantId))
        );
        const psDate = tenant?.paymentStartDate ? new Date(tenant.paymentStartDate) : null;
        const inAdvancePeriod = psDate && selectedDate && selectedDate < monthFirst(psDate);

        if (inAdvancePeriod) {
          advance.push({
            propertyName: c.propertyName || '',
            tenantName: c.tenant || '',
            amount: c.rent || 0,
            since: tenant?.since || '',
            paymentStartDate: tenant.paymentStartDate,
          });
        } else {
          unpaid.push({
            propertyName: c.propertyName || '',
            tenantName: c.tenant || '',
            amount: c.rent || 0,
            dueDate: '',
            status: 'Impayé',
          });
        }
      });

    return { reportUnpaid: unpaid, reportAdvance: advance };
  })();

  /* ── Monthly expenses for the report ── */
  const monthExpenses = (() => {
    const [mn, yr] = selectedMonth.split(' ');
    return (transactions || []).filter(t => {
      if (!t.date || t.positive) return false;
      const d = parseTxDate(t.date);
      return d && d.getFullYear() === Number(yr) && MONTH_NAMES[d.getMonth()] === mn;
    });
  })();

  /* ── Shared helpers for contract-based auto-fill ── */
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
    const linked = !opt ? [] : (tenants || []).filter(t => {
      const tName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
      return (contracts || []).some(c => {
        if (!['Actif', 'Expirant', 'Brouillon'].includes(c.status)) return false;
        const tenantOk = String(c.tenantId) === String(t.id) || c.tenant === tName;
        if (!tenantOk) return false;
        if (opt.isUnit) {
          if (propMatch(c.propertyName, opt.propertyName)) return true;
          if (String(c.propertyId) === String(opt.buildingId) && opt.unitNumber &&
              normProp(c.propertyName).includes(normProp(opt.unitNumber))) return true;
          return String(c.propertyId) === String(opt.buildingId);
        }
        return propMatch(c.propertyName, opt.propertyName) ||
               propMatch(c.propertyName, opt.buildingName) ||
               String(c.propertyId) === String(opt.buildingId);
      });
    });
    // For units with multiple building-level matches, prefer the one whose contract
    // propertyName actually contains the unit number (most specific match first)
    linked.sort((a, b) => {
      if (!opt?.isUnit || !opt?.unitNumber) return 0;
      const un = normProp(opt.unitNumber);
      const aHas = (contracts || []).some(c => ['Actif','Expirant','Brouillon'].includes(c.status) &&
        (String(c.tenantId) === String(a.id) || c.tenant === (a.name || '')) &&
        normProp(c.propertyName).includes(un));
      const bHas = (contracts || []).some(c => ['Actif','Expirant','Brouillon'].includes(c.status) &&
        (String(c.tenantId) === String(b.id) || c.tenant === (b.name || '')) &&
        normProp(c.propertyName).includes(un));
      return (bHas ? 1 : 0) - (aHas ? 1 : 0);
    });
    const match = linked.length >= 1 ? linked[0] : null;
    setPayForm(f => ({ ...f, propertyKey: val, tenantId: match ? String(match.id) : '', amount: opt?.rent || '' }));
  };

  const handleTenantSelect = (val) => {
    if (!val) { setPayForm(f => ({ ...f, tenantId: '' })); return; }
    const tenant = (tenants || []).find(t => String(t.id) === String(val));
    const tenantName = tenant ? (tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim()) : '';
    const contract = (contracts || []).find(c =>
      ['Actif', 'Expirant', 'Brouillon'].includes(c.status) &&
      (c.tenant === tenantName || (c.tenantId && String(c.tenantId) === String(val)))
    );
    const matchOpt = propOptFromContract(contract);
    if (matchOpt) {
      setPayForm(f => ({ ...f, tenantId: val, propertyKey: matchOpt.value, amount: matchOpt.rent || f.amount }));
    } else {
      setPayForm(f => ({ ...f, tenantId: val }));
    }
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
    const baseAmount = parseFloat(payForm.amount) || 0;
    const penaltyAmount = payForm.withPenalty ? Math.round(baseAmount * 0.10) : 0;
    const newPayment = {
      propertyName: opt?.propertyName || payForm.propertyKey,
      tenantName: tenantFullName,
      tenantEmail: tenant?.email || '',
      tenantPhone: tenant?.phone || '',
      tenantId: tenant?.id || null,
      contractId: matchingContract?.id || null,
      ownerId: linkedProp?.ownerId || matchingContract?.ownerId || null,
      ownerName: linkedProp?.owner || matchingContract?.ownerName || null,
      baseAmount: payForm.withPenalty ? baseAmount : null,
      penaltyAmount: payForm.withPenalty ? penaltyAmount : null,
      amount: baseAmount + penaltyAmount,
      month: payForm.month,
      dueDate: payForm.dueDate,
      method: payForm.method,
      status: 'Payé',
      paidDate: today,
      reminderSent: false,
      reminderCount: 0,
      ...(isClosed(payForm.month) ? { postCloture: true } : {}),
    };
    dispatch({ type: 'ADD_PAYMENT', payload: newPayment });
    setPayModal(false);
    setPayForm({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces', withPenalty: false });
    setQuittancePayment(newPayment);
  };

  const handleMarkPaid = (id) => dispatch({ type: 'MARK_PAYMENT_PAID', payload: id });

  // Toggle "already reversed to the owner" on an advance payment so it no longer
  // shows up in the owner-remittance bilan / financial point at each month-end.
  const markAdvanceReversed = (p) => {
    const next = !p.avanceVerseeProprio;
    dispatch({ type: 'UPDATE_PAYMENT', payload: { ...p, avanceVerseeProprio: next, avanceVerseeAt: next ? new Date().toISOString() : null } });
  };

  // Mark an unpaid tenant paid — creates a record if none exists yet (synthetic
  // entries from the Rappels tab have no payment doc to update).
  const markUnpaidPaid = (p) => {
    if (!p) return;
    if (p.isSynthetic) {
      dispatch({
        type: 'ADD_PAYMENT',
        payload: {
          tenantId: p.tenantId || null,
          tenantName: p.tenantName || '',
          tenantPhone: p.tenantPhone || '',
          tenantEmail: p.tenantEmail || '',
          propertyName: p.propertyName || '',
          amount: p.amount || 0,
          month: p.month || currentMonthLabel,
          status: 'Payé',
          method: 'Espèces',
          paidDate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
          reminderCount: 0,
        },
      });
    } else {
      dispatch({ type: 'MARK_PAYMENT_PAID', payload: p.id });
    }
  };
  const handleReminder = (p) => { dispatch({ type: 'SEND_REMINDER', payload: p.id }); setReminderModal(null); };

  const openEdit = (p) => {
    setEditForm({ amount: p.amount, dueDate: p.dueDate || '', paidDate: p.paidDate || '', month: p.month, method: p.method || 'Espèces', status: p.status });
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
    setSignatures({
      bailleur:  payment.signatures?.bailleur  || null,
      locataire: payment.signatures?.locataire || null,
    });
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
    let qrDataUrl = '';
    try { qrDataUrl = qrReceiptRef.current?.toDataURL('image/png') || ''; } catch { /* ignore */ }
    dispatch({ type: 'SAVE_QUITTANCE_VERIFY', payload: quittancePayment });
    const nextDate = computeNextPaymentDate(quittancePayment);
    const html = buildReceiptHTMLShared(quittancePayment, orgSettings, signatures, nextDate, { qrDataUrl });
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

  const whatsappReceiptWithPDF = useCallback(() => {
    const phone = phoneForWA(quittancePayment?.tenantPhone);
    if (!phone) { alert('Numéro de téléphone manquant pour ce locataire.'); return; }
    // Open the receipt for printing/saving as PDF
    let qrDataUrl = '';
    try { qrDataUrl = qrReceiptRef.current?.toDataURL('image/png') || ''; } catch { /* ignore */ }
    dispatch({ type: 'SAVE_QUITTANCE_VERIFY', payload: quittancePayment });
    const nextDate = computeNextPaymentDate(quittancePayment);
    const html = buildReceiptHTMLShared(quittancePayment, orgSettings, signatures, nextDate, { qrDataUrl });
    const win = window.open('', '_blank', 'width=820,height=700');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 700);
    }
    // Open WhatsApp after a short delay so both windows open
    const msg = encodeURIComponent(
      `Bonjour ${quittancePayment?.tenantName},\n\nVeuillez trouver ci-joint votre quittance de loyer pour ${quittancePayment?.month}.\n\n• Montant : ${fmt(quittancePayment?.amount)}\n• Propriété : ${quittancePayment?.propertyName}${signatures.bailleur ? '\n✅ Signée numériquement' : ''}\n\nMerci pour votre paiement.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    setTimeout(() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank'), 1400);
  }, [quittancePayment, orgSettings, signatures, computeNextPaymentDate]);

  const emailReceipt = useCallback(() => {
    const email = quittancePayment?.tenantEmail || '';
    const subject = encodeURIComponent(`Quittance de loyer — ${quittancePayment?.month}`);
    const body = encodeURIComponent(
      `Bonjour ${quittancePayment?.tenantName},\n\nVeuillez trouver ci-joint votre quittance de loyer pour la période de ${quittancePayment?.month}.\n\nMontant : ${fmt(quittancePayment?.amount)}\nPropriété : ${quittancePayment?.propertyName}\n\nCordialement,\n${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }, [quittancePayment, orgSettings]);

  /* ── Open payment modal pre-filled with penalty amount ── */
  const openPenaltyPayment = (item) => {
    const opt = allPropertyOptions.find(o =>
      (o.propertyName || '').toLowerCase() === (item.propertyName || '').toLowerCase() ||
      (o.buildingName || '').toLowerCase() === (item.propertyName || '').toLowerCase()
    );
    setPayForm({
      propertyKey: opt?.value || '',
      tenantId: String(item.tenantId || ''),
      amount: String(item.total),
      month: currentMonthLabel,
      dueDate: '',
      method: 'Espèces',
    });
    setPayModal(true);
  };

  /* ── Save an arrear (past month payment) ── */
  const handleSaveArrear = () => {
    const tenant = (tenants || []).find(t => String(t.id) === String(arrearsAddForm.tenantId));
    const tenantName = tenant ? (tenant.name || '') : '';
    const contract = (contracts || []).find(c =>
      (c.status === 'Actif' || c.status === 'Expirant') &&
      (c.tenant === tenantName || String(c.tenantId) === String(arrearsAddForm.tenantId))
    );
    const today = new Date().toLocaleDateString('fr-CI');
    const propName = arrearsAddForm.propertyName || contract?.propertyName || '';
    (arrearsAddForm.months || []).forEach(month => {
      dispatch({
        type: 'ADD_PAYMENT',
        payload: {
          propertyName: propName,
          tenantName,
          tenantEmail: tenant?.email || '',
          tenantPhone: tenant?.phone || '',
          tenantId: tenant?.id || null,
          contractId: contract?.id || null,
          amount: parseFloat(arrearsAddForm.amountPerMonth) || 0,
          month,
          dueDate: '',
          method: 'Espèces',
          status: arrearsAddForm.status,
          paidDate: arrearsAddForm.status === 'Payé' ? today : null,
          isArrear: true,
          reminderSent: false,
          reminderCount: 0,
          ...(arrearsAddForm.status === 'Payé' && isClosed(month) ? { postCloture: true } : {}),
        },
      });
    });
    setArrearsAddModal(false);
    setArrearsAddForm({ tenantId: '', months: [], amountPerMonth: '', status: 'Impayé', propertyName: '' });
  };

  const handlePrintArrears = () => {
    const html = buildArrearsReportHTML(arrearsByTenant, arrearsTotal, orgSettings);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleExportExcel = () => {
    const monthData = payments
      .filter(p => p.month === selectedMonth)
      .map(p => ({
        'Mois': p.month, 'Propriété': p.propertyName || '',
        'Locataire': p.tenantName || '', 'Montant (FCFA)': p.amount || 0,
        'Statut': p.status || '', 'Date paiement': p.paidDate || '',
        'Mode': p.method || '', 'Post-clôture': p.postCloture ? 'Oui' : 'Non',
      }));
    const allData = payments.map(p => ({
      'Mois': p.month, 'Propriété': p.propertyName || '',
      'Locataire': p.tenantName || '', 'Montant (FCFA)': p.amount || 0,
      'Statut': p.status || '', 'Date paiement': p.paidDate || '', 'Mode': p.method || '',
    }));
    const tenantData = (state.tenants || []).map(t => ({
      'Nom': t.name || '', 'Email': t.email || '', 'Téléphone': t.phone || '',
      'Propriété': t.property || '', 'Loyer': t.rent || 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthData), selectedMonth.slice(0, 30));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allData), 'Tous paiements');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tenantData), 'Locataires');
    XLSX.writeFile(wb, `Minsouah_${selectedMonth.replace(' ', '_')}.xlsx`);
  };

  const handlePrintPenalties = () => {
    const html = buildPenaltyReportHTML(penaltyList, currentMonthLabel, orgSettings);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handlePrintReport = () => {
    const html = buildReportHTML(selectedMonth, reportPaid, reportUnpaid, orgSettings, payments, reportAdvance, contracts, monthExpenses, properties);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handlePrintGlobalReport = () => {
    const html = buildGlobalReportHTML({
      currentMonth: selectedMonth,
      contracts,
      payments,
      arrearsByTenant,
      advanceTenants: reportAdvance,
      orgSettings,
    });
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  /* ── Month closure helpers ── */
  const orgId = state.currentUser?.orgId || 'default';
  const closureForMonth = (month) =>
    monthClosures.find(c => c.month === month && (c.orgId === orgId || !c.orgId));
  const isClosed = (month) => !!closureForMonth(month);

  const handleCloseMonth = async () => {
    setClosureLoading(true);
    try {
      await dispatch({ type: 'CLOSE_MONTH', payload: { month: selectedMonth, closedAt: new Date().toISOString(), note: closureNote } });
      setClosureModal(false);
      setClosureNote('');
    } catch (err) {
      alert('Erreur lors de la clôture : ' + (err?.message || 'Vérifiez votre connexion.'));
    } finally {
      setClosureLoading(false);
    }
  };

  const handleReopenMonth = async (month) => {
    if (!window.confirm(`Rouvrir le mois ${month} ? Les paiements post-clôture resteront en place.`)) return;
    await dispatch({ type: 'REOPEN_MONTH', payload: month });
  };

  const handlePrintPostCloture = (month) => {
    const closure = closureForMonth(month);
    if (!closure) return;
    const closedAt = closure.closedAt ? new Date(closure.closedAt) : null;
    // Include payments flagged postCloture OR paid after the closure date
    const postPmts = payments.filter(p => {
      if (p.month !== month || p.status !== 'Payé') return false;
      if (p.postCloture) return true;
      if (closedAt && p.paidDate) {
        const pd = parseTxDate(p.paidDate) || new Date(p.paidDate);
        return pd > closedAt;
      }
      return false;
    });
    // Tenants of this (org-scoped) month still expected to pay after the deadline
    const pendingPmts = payments.filter(p => p.month === month && p.status !== 'Payé' && p.status !== 'Annulé');
    const html = buildPostClotureHTML(closure, postPmts, pendingPmts, orgSettings);
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

  const sendBulkPenaltyNotifications = () => {
    penaltyList.forEach((item, i) => {
      const phone = phoneForWA(item.tenantPhone);
      if (phone) {
        const msg = encodeURIComponent(
          `Bonjour ${item.tenantName},\n\nVotre loyer de ${currentMonthLabel} n'a pas été réglé avant le 10 du mois. Une pénalité de 10% est donc appliquée.\n\n• Loyer : ${fmt(item.rent)}\n• Pénalité (10%) : ${fmt(item.penalty)}\n• Total à régler : ${fmt(item.total)}\n\nPropriété : ${item.propertyName}\n\nMerci de régulariser sans délai.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
        );
        setTimeout(() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank'), i * 600);
      }
    });
  };

  const TABS = [
    { id: 'payments', label: 'Paiements', icon: 'payments' },
    { id: 'reminders', label: 'Rappels du mois', icon: 'notifications_active', badge: currentMonthUnpaid.length },
    { id: 'penalties', label: 'Pénalités 10%', icon: 'gavel', badge: isAfterDeadline ? penaltyList.length : 0 },
    { id: 'arrears', label: 'Arriérés', icon: 'history', badge: arrearsList.length },
    { id: 'report', label: 'Rapport mensuel', icon: 'bar_chart' },
  ];

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* ── Header ── */}
      <div className="flex flex-wrap gap-sm items-center justify-between">
        <div className="flex flex-wrap gap-sm">
          {canCreate && <Btn icon="add_circle" onClick={() => setPayModal(true)}>Enregistrer un paiement</Btn>}
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
                    {['Propriété / Locataire','Montant brut','Commission','Net propriétaire','Échéance','Payé le','Statut','Rappels','Actions'].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${(i >= 1 && i <= 3) ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-12 text-on-surface-variant">
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
                        {(() => {
                          const amt = p.amount || 0;
                          const contract = amt === 0 ? (contracts || []).find(c =>
                            (c.tenant || '').toLowerCase().trim() === (p.tenantName || '').toLowerCase().trim() &&
                            (c.status === 'Actif' || c.status === 'Expirant')
                          ) : null;
                          const display = amt > 0 ? amt : (contract?.rent || 0);
                          return (
                            <span className={`font-bold text-sm ${p.status === 'Payé' ? 'text-green-700' : 'text-red-700'}`}>
                              {fmt(display)}
                              {amt === 0 && display > 0 && <span className="block text-[10px] font-normal text-on-surface-variant">(loyer contrat)</span>}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm">
                        {p.commissionAmount != null
                          ? <span className="text-amber-700 font-semibold">−{fmt(p.commissionAmount)}<span className="block text-[10px] font-normal text-on-surface-variant">{p.commissionRate}%</span></span>
                          : <span className="text-on-surface-variant">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm">
                        {p.montantNet != null
                          ? <span className="text-green-700 font-bold">{fmt(p.montantNet)}</span>
                          : <span className="text-on-surface-variant">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-on-surface">{p.dueDate || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-on-surface">{p.paidDate || <span className="text-on-surface-variant">—</span>}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                            <Icon name={statusIcon[p.status] || 'info'} size={12} />
                            {p.status}
                          </span>
                          {p.avanceVerseeProprio ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700" title="Paiement anticipé déjà reversé au propriétaire">
                              <Icon name="verified" size={11} /> Anticipé · versé propriétaire
                            </span>
                          ) : isAdvancePayment(p) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700" title="Réglé en avance">
                              <Icon name="schedule" size={11} /> Anticipé
                            </span>
                          ) : null}
                        </div>
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
                          {p.status !== 'Payé' && p.status !== 'Annulé' && canEdit && (
                            <>
                              <Btn small icon="check_circle" variant="green" onClick={() => handleMarkPaid(p.id)}>Payé</Btn>
                              <Btn small icon="notifications" variant="amber" onClick={() => setReminderModal(p)}>Rappel</Btn>
                            </>
                          )}
                          {canEdit && <Btn small icon="edit" variant="secondary" onClick={() => openEdit(p)}>Modifier</Btn>}
                          {p.status === 'Payé' && canEdit && (
                            <Btn small icon={p.avanceVerseeProprio ? 'undo' : 'real_estate_agent'} variant="secondary" onClick={() => markAdvanceReversed(p)}>
                              {p.avanceVerseeProprio ? 'Annuler versé' : 'Versé propriétaire'}
                            </Btn>
                          )}
                          {p.status === 'Payé' && canEdit && (
                            <Btn small icon="block" variant="amber" onClick={() => handleCancel(p)}>Annuler</Btn>
                          )}
                          {canDelete && <Btn small icon="delete" variant="danger" onClick={() => setDeleteConfirm(p)}>Supprimer</Btn>}
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
                <span className="font-semibold text-red-700">{currentMonthUnpaid.length}</span> à relancer
                {currentMonthAdvance.length > 0 && <> · <span className="font-semibold text-blue-700">{currentMonthAdvance.length}</span> en avance</>}
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
              <p className="font-semibold text-green-800">Aucun loyer en attente ce mois-ci</p>
              <p className="text-sm text-green-600 mt-1">
                {currentMonthAdvance.length > 0
                  ? `Les loyers dus pour ${currentMonthLabel} sont réglés. ${currentMonthAdvance.length} locataire(s) sont en période d'avance (voir ci-dessous).`
                  : `Aucun rappel à envoyer pour ${currentMonthLabel}.`}
              </p>
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
                            <button onClick={() => markUnpaidPaid(p)}
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

          {/* ── Locataires en période d'avance (non dus ce mois) ── */}
          {currentMonthAdvance.length > 0 && (
            <div className="bg-blue-50/50 rounded-xl border border-blue-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-blue-200 flex items-center gap-2">
                <Icon name="schedule" size={18} className="text-blue-700" />
                <p className="font-bold text-blue-800 text-sm">En période d'avance — {currentMonthAdvance.length} locataire(s)</p>
                <span className="text-xs text-blue-600">(caution/avance versée — paiement mensuel à venir, non dû ce mois)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-blue-100/60 text-blue-800">
                    <tr>{['Locataire','Propriété','Loyer','Paiement à partir de'].map(h => <th key={h} className="px-4 py-2 text-xs font-bold uppercase tracking-wide">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100">
                    {currentMonthAdvance.map((a, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5 font-semibold text-on-surface">{a.tenantName}</td>
                        <td className="px-4 py-2.5 text-on-surface-variant">{a.propertyName}</td>
                        <td className="px-4 py-2.5 text-on-surface">{fmt(a.amount)}</td>
                        <td className="px-4 py-2.5 text-blue-700 font-medium">
                          {a.paymentStartDate ? new Date(a.paymentStartDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
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

      {/* ══════════════════ TAB: PÉNALITÉS ══════════════════ */}
      {tab === 'penalties' && (
        <div className="flex flex-col gap-md">
          <div className={`${isAfterDeadline ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'} border rounded-xl px-4 py-3 flex items-center gap-3`}>
            <Icon name="gavel" size={20} className={isAfterDeadline ? 'text-red-700 flex-shrink-0' : 'text-amber-700 flex-shrink-0'} />
            <div>
              <p className={`text-sm font-bold ${isAfterDeadline ? 'text-red-800' : 'text-amber-800'}`}>
                {isAfterDeadline
                  ? `Délai dépassé — ${penaltyList.length} locataire(s) n'ont pas payé avant le 10`
                  : 'Période de rappel en cours — la pénalité de 10% s\'applique après le 10 du mois'}
              </p>
              <p className={`text-xs mt-0.5 ${isAfterDeadline ? 'text-red-700' : 'text-amber-700'}`}>
                Pénalité = 10% du loyer mensuel · Rappel : les paiements sont attendus entre le 1er et le 10
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-sm">
            <div>
              <h3 className="font-bold text-on-surface text-base">Liste des pénalités — {currentMonthLabel}</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">{penaltyList.length} dossier(s) concerné(s)</p>
            </div>
            <div className="flex gap-sm flex-wrap">
              {penaltyList.length > 0 && (
                <Btn icon="picture_as_pdf" variant="secondary" onClick={handlePrintPenalties}>Exporter PDF</Btn>
              )}
              {isAfterDeadline && penaltyList.length > 0 && (
                <Btn icon="chat" onClick={sendBulkPenaltyNotifications}>Notifier tous (WhatsApp)</Btn>
              )}
            </div>
          </div>

          {penaltyList.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <Icon name="check_circle" size={40} className="text-green-600 mb-3" />
              <p className="font-semibold text-green-800">Aucune pénalité pour {currentMonthLabel}</p>
              <p className="text-sm text-green-600 mt-1">Tous les locataires ont réglé leur loyer.</p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl border border-red-200 overflow-hidden shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-red-700 text-white">
                    <tr>
                      {['Locataire','Propriété','Loyer dû','Pénalité 10%','Total à payer','Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {penaltyList.map((item, i) => (
                      <tr key={i} className="hover:bg-red-50/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-sm">{item.tenantName}</p>
                          {item.tenantPhone && <p className="text-xs text-on-surface-variant">{item.tenantPhone}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-on-surface">{item.propertyName}</td>
                        <td className="px-4 py-3.5 font-semibold text-sm">{fmt(item.rent)}</td>
                        <td className="px-4 py-3.5 font-bold text-sm text-red-700">+ {fmt(item.penalty)}</td>
                        <td className="px-4 py-3.5">
                          <span className="font-black text-sm text-red-800 bg-red-100 px-2 py-1 rounded-lg">{fmt(item.total)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-2 flex-wrap">
                            {item.tenantPhone && (() => {
                              const phone = phoneForWA(item.tenantPhone);
                              const msg = encodeURIComponent(
                                `Bonjour ${item.tenantName},\n\nUne pénalité de 10% a été appliquée pour non-paiement du loyer de ${currentMonthLabel} avant le 10.\n\n• Loyer : ${fmt(item.rent)}\n• Pénalité : ${fmt(item.penalty)}\n• Total à régler : ${fmt(item.total)}\n\nPropriété : ${item.propertyName}\n\nMerci de régulariser sans délai.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
                              );
                              return phone ? (
                                <button onClick={() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')}
                                  className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200">
                                  <Icon name="chat" size={12} /> WhatsApp
                                </button>
                              ) : null;
                            })()}
                            <button onClick={() => openPenaltyPayment(item)}
                              className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-200">
                              <Icon name="payments" size={12} /> Encaisser + 10%
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-red-50 border-t-2 border-red-200">
                      <td colSpan={3} className="px-4 py-3 text-sm font-bold text-red-800">Total</td>
                      <td className="px-4 py-3 font-bold text-sm text-red-700">{fmt(penaltyList.reduce((s, i) => s + i.penalty, 0))}</td>
                      <td className="px-4 py-3 font-black text-red-800">{fmt(penaltyList.reduce((s, i) => s + i.total, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: ARRIÉRÉS ══════════════════ */}
      {tab === 'arrears' && (
        <div className="flex flex-col gap-md">
          <div className="flex items-center justify-between flex-wrap gap-sm">
            <div>
              <h3 className="font-bold text-on-surface text-base">Arriérés de loyers</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {arrearsList.length} mois impayé(s) · Total dû : <span className="font-bold text-red-700">{fmt(arrearsTotal)}</span>
              </p>
            </div>
            <div className="flex gap-sm flex-wrap">
              {arrearsSelected.size > 0 && (
                <Btn icon="delete" variant="danger" onClick={() => {
                  if (window.confirm(`Supprimer ${arrearsSelected.size} arriéré(s) sélectionné(s) ?`)) {
                    arrearsSelected.forEach(id => dispatch({ type: 'DELETE_PAYMENT', payload: id }));
                    setArrearsSelected(new Set());
                  }
                }}>
                  Supprimer ({arrearsSelected.size})
                </Btn>
              )}
              {arrearsByTenant.length > 0 && (
                <Btn icon="picture_as_pdf" variant="secondary" onClick={handlePrintArrears}>Exporter PDF</Btn>
              )}
              <Btn icon="add_circle" onClick={() => { setArrearsAddForm({ tenantId: '', months: [], amountPerMonth: '', status: 'Impayé', propertyName: '' }); setArrearsAddModal(true); }}>
                Ajouter un arriéré
              </Btn>
            </div>
          </div>

          {arrearsByTenant.length > 0 && (
            <div className="relative">
              <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Rechercher un locataire, une propriété ou un mois…"
                value={arrearsSearch}
                onChange={e => setArrearsSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface text-sm"
              />
            </div>
          )}

          {(() => {
            const q = arrearsSearch.toLowerCase().trim();
            const shownGroups = !q ? arrearsByTenant : arrearsByTenant.filter(g =>
              (g.tenantName || '').toLowerCase().includes(q) ||
              (g.tenantPhone || '').toLowerCase().includes(q) ||
              (g.payments || []).some(p => (p.propertyName || '').toLowerCase().includes(q) || (p.month || '').toLowerCase().includes(q))
            );
            return arrearsByTenant.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <Icon name="check_circle" size={40} className="text-green-600 mb-3" />
              <p className="font-semibold text-green-800">Aucun arriéré enregistré</p>
              <p className="text-sm text-green-600 mt-1">Tous les loyers des mois précédents ont été réglés.</p>
            </div>
          ) : shownGroups.length === 0 ? (
            <div className="bg-surface-container rounded-xl p-8 text-center text-on-surface-variant">
              <Icon name="search_off" size={40} className="opacity-40 mb-3" />
              <p className="font-semibold">Aucun résultat pour « {arrearsSearch} »</p>
            </div>
          ) : (
            <div className="flex flex-col gap-md">
              {shownGroups.map(group => {
                const allGroupIds = group.payments.map(p => p.id);
                const allGroupSelected = allGroupIds.length > 0 && allGroupIds.every(id => arrearsSelected.has(id));
                const isExpanded = arrearsExpanded.has(group.tenantName);
                const toggleExpand = () => setArrearsExpanded(prev => {
                  const next = new Set(prev);
                  if (isExpanded) next.delete(group.tenantName); else next.add(group.tenantName);
                  return next;
                });
                return (
                  <div key={group.tenantName} className="bg-surface-container-lowest rounded-xl border border-amber-200 overflow-hidden shadow-card">
                    <div className="bg-amber-50 px-4 py-3 border-b border-amber-200 flex items-center gap-3">
                      <input type="checkbox" checked={allGroupSelected}
                        onChange={() => {
                          setArrearsSelected(prev => {
                            const next = new Set(prev);
                            if (allGroupSelected) allGroupIds.forEach(id => next.delete(id));
                            else allGroupIds.forEach(id => next.add(id));
                            return next;
                          });
                        }}
                        className="w-4 h-4 accent-amber-600 flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                      />
                      <button onClick={toggleExpand} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                        <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-bold text-sm flex-shrink-0">
                          {(group.tenantName[0] || '?').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-amber-900 truncate">{group.tenantName}</p>
                          <p className="text-xs text-amber-700">{group.payments.length} mois d'arriéré(s) · Cliquer pour {isExpanded ? 'masquer' : 'voir le détail'}</p>
                        </div>
                        <span className="font-black text-amber-900 bg-amber-200 px-3 py-1 rounded-lg text-sm flex-shrink-0">{fmt(group.total)}</span>
                        <Icon name={isExpanded ? 'expand_less' : 'expand_more'} size={20} className="text-amber-700 flex-shrink-0" />
                      </button>
                    </div>
                    {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead><tr className="bg-amber-50/60 border-b border-amber-100">
                          <th className="px-3 py-2.5 w-8"></th>
                          {['Mois','Propriété','Montant','Statut','Actions'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-amber-800">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody className="divide-y divide-amber-50">
                          {group.payments.map(p => {
                            const sel = arrearsSelected.has(p.id);
                            return (
                              <tr key={p.id} className={`transition-colors ${sel ? 'bg-amber-100/60' : 'hover:bg-amber-50/40'}`}>
                                <td className="px-3 py-3">
                                  <input type="checkbox" checked={sel}
                                    onChange={() => setArrearsSelected(prev => {
                                      const next = new Set(prev);
                                      if (sel) next.delete(p.id); else next.add(p.id);
                                      return next;
                                    })}
                                    className="w-4 h-4 accent-amber-600"
                                  />
                                </td>
                                <td className="px-4 py-3 text-sm font-semibold">{p.month}</td>
                                <td className="px-4 py-3 text-sm text-on-surface-variant">{p.propertyName}</td>
                                <td className="px-4 py-3 text-sm font-bold text-amber-800">{fmt(p.amount)}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                                    <Icon name={statusIcon[p.status] || 'info'} size={12} />{p.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-2 flex-wrap">
                                    <Btn small icon="check_circle" variant="green" onClick={() => markUnpaidPaid(p)}>Encaisser</Btn>
                                    {group.tenantPhone && (() => {
                                      const phone = phoneForWA(group.tenantPhone);
                                      const msg = encodeURIComponent(
                                        `Bonjour ${p.tenantName},\n\nNous vous rappelons que votre loyer de ${fmt(p.amount)} pour le mois de ${p.month} est toujours impayé.\n\nPropriété : ${p.propertyName}\n\nMerci de régulariser votre situation.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
                                      );
                                      return phone ? (
                                        <button onClick={() => window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')}
                                          className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200">
                                          <Icon name="chat" size={12} /> WhatsApp
                                        </button>
                                      ) : null;
                                    })()}
                                    {!p.isSynthetic && (
                                      <button onClick={() => {
                                        if (window.confirm(`Supprimer l'arriéré de ${p.month} pour ${group.tenantName} ?`)) {
                                          dispatch({ type: 'DELETE_PAYMENT', payload: p.id });
                                          setArrearsSelected(prev => { const next = new Set(prev); next.delete(p.id); return next; });
                                        }
                                      }} className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100">
                                        <Icon name="delete" size={12} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
          })()}
        </div>
      )}

      {/* ══════════════════ TAB: RAPPORT MENSUEL ══════════════════ */}
      {tab === 'report' && (() => {
        // Compute monthly expenses from transactions (non-positive = dépense)
        const [reportMonthName, reportYear] = selectedMonth.split(' ');
        const monthTransactions = transactions.filter(t => {
          if (!t.date) return false;
          const d = parseTxDate(t.date);
          return d && d.getFullYear() === Number(reportYear) && MONTH_NAMES[d.getMonth()] === reportMonthName;
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
            <div className="flex gap-2 flex-wrap">
              <Btn icon="picture_as_pdf" variant="secondary" onClick={handlePrintReport}>Rapport mensuel</Btn>
              <Btn icon="analytics" variant="primary" onClick={handlePrintGlobalReport}>Rapport global</Btn>
              <Btn icon="download" variant="secondary" onClick={handleExportExcel}>Export Excel</Btn>
              {isClosed(selectedMonth) ? (
                <>
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-800 text-xs font-bold rounded-xl border border-green-200">
                    <Icon name="lock" size={13} /> Mois clôturé
                  </span>
                  <Btn icon="receipt_long" variant="amber" onClick={() => handlePrintPostCloture(selectedMonth)}>Fiche post-clôture</Btn>
                  <Btn icon="lock_open" variant="secondary" onClick={() => handleReopenMonth(selectedMonth)}>Rouvrir</Btn>
                </>
              ) : (
                <Btn icon="lock" variant="green" onClick={() => setClosureModal(true)}>Clôturer le mois</Btn>
              )}
            </div>
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

          {/* ── Budget vs Réalisé ── */}
          {(() => {
            const budget = budgets.find(b => b.month === selectedMonth);
            const target = budget?.targetAmount || 0;
            const pct = target > 0 ? Math.min(100, Math.round(totalCollected / target * 100)) : 0;
            return (
              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm text-on-surface flex items-center gap-2">
                    <Icon name="track_changes" size={16} className="text-primary" />
                    Budget vs Réalisé — {selectedMonth}
                  </h4>
                  <button onClick={() => setShowBudgetEdit(b => !b)} className="text-xs text-primary hover:underline">
                    {budget ? 'Modifier objectif' : 'Définir un objectif'}
                  </button>
                </div>
                {showBudgetEdit && (
                  <div className="flex gap-2 mb-3">
                    <input type="number" value={budgetInput} onChange={e => setBudgetInput(e.target.value)}
                      placeholder="Objectif en FCFA" className="flex-1 border border-outline-variant rounded-lg px-3 py-1.5 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary" />
                    <button onClick={() => { dispatch({ type: 'SET_BUDGET', payload: { month: selectedMonth, targetAmount: Number(budgetInput) } }); setShowBudgetEdit(false); }}
                      className="px-3 py-1.5 bg-primary text-on-primary text-sm font-semibold rounded-lg">
                      Enregistrer
                    </button>
                  </div>
                )}
                {target > 0 ? (
                  <>
                    <div className="flex justify-between text-xs text-on-surface-variant mb-1.5">
                      <span>Encaissé : <strong className="text-on-surface">{fmt(totalCollected)}</strong></span>
                      <span>Objectif : <strong className="text-on-surface">{fmt(target)}</strong></span>
                    </div>
                    <div className="w-full bg-surface-container rounded-full h-3 overflow-hidden">
                      <div className={`h-3 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-primary' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span className={`font-bold ${pct >= 100 ? 'text-green-700' : pct >= 70 ? 'text-primary' : 'text-amber-700'}`}>{pct}%</span>
                      <span className="text-on-surface-variant">Reste : {fmt(Math.max(0, target - totalCollected))}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-on-surface-variant text-center py-2">Aucun objectif défini pour ce mois</p>
                )}
              </div>
            );
          })()}

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
                ...matchingTenants.map(t => {
                  const name = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
                  const alreadyPaid = paidThisMonthSet.has(String(t.id)) || paidThisMonthSet.has(name.toLowerCase());
                  return {
                    value: String(t.id),
                    label: alreadyPaid ? `${name} ✓ déjà payé` : name,
                    sub: alreadyPaid ? `Paiement enregistré pour ${payForm.month}` : '',
                  };
                }),
              ]}
              className={inputCls}
            />
            {payForm.tenantId && (() => {
              const tName = (matchingTenants.find(t => String(t.id) === payForm.tenantId)?.name || '').toLowerCase();
              const alreadyPaid = paidThisMonthSet.has(payForm.tenantId) || paidThisMonthSet.has(tName);
              return alreadyPaid ? (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <Icon name="warning" size={12} /> Ce locataire a déjà un paiement enregistré pour {payForm.month}. Vous pouvez continuer pour un paiement d'avance.
                </p>
              ) : null;
            })()}
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

          {/* Penalty toggle */}
          <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${payForm.withPenalty ? 'bg-red-50 border-red-300' : 'bg-surface-container border-outline-variant/40 hover:bg-surface-container-high'}`}>
            <input type="checkbox" checked={payForm.withPenalty}
              onChange={e => setPayForm(f => ({ ...f, withPenalty: e.target.checked }))}
              className="w-4 h-4 accent-red-600 flex-shrink-0" />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${payForm.withPenalty ? 'text-red-800' : 'text-on-surface'}`}>Appliquer la pénalité de 10%</p>
              <p className={`text-xs mt-0.5 ${payForm.withPenalty ? 'text-red-600' : 'text-on-surface-variant'}`}>Paiement effectué après le 10 du mois</p>
            </div>
            {payForm.withPenalty && payForm.amount && (
              <span className="font-bold text-sm text-red-700 flex-shrink-0">+{fmt(Math.round(parseFloat(payForm.amount) * 0.10))}</span>
            )}
          </label>

          {payForm.withPenalty && payForm.amount && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
              <div className="flex justify-between text-on-surface-variant"><span>Loyer de base</span><span className="font-semibold">{fmt(parseFloat(payForm.amount) || 0)}</span></div>
              <div className="flex justify-between text-red-700 mt-1"><span>Pénalité 10%</span><span className="font-semibold">+ {fmt(Math.round(parseFloat(payForm.amount) * 0.10))}</span></div>
              <div className="flex justify-between font-black text-red-900 text-base mt-2 pt-2 border-t border-red-200"><span>Total à encaisser</span><span>{fmt((parseFloat(payForm.amount) || 0) + Math.round(parseFloat(payForm.amount) * 0.10))}</span></div>
            </div>
          )}
        </div>
      </ModalWrap>

      {/* Hidden QR canvas → embedded in the printed receipt for authenticity check */}
      {quittancePayment && (
        <div style={{ position: 'fixed', left: -9999, top: -9999 }} aria-hidden>
          <QRCodeCanvas ref={qrReceiptRef} value={quittanceVerifyUrl(quittancePayment)} size={200} level="M" includeMargin />
        </div>
      )}

      {/* ══════════════ MODAL: Quittance ══════════════ */}
      <ModalWrap
        open={!!quittancePayment}
        onClose={() => setQuittancePayment(null)}
        title="Quittance de Loyer"
        size="xl"
        footer={
          receiptTab === 'preview' ? (
            <div className="flex gap-3 w-full justify-between items-center flex-wrap">
              <Btn variant="secondary" onClick={() => setQuittancePayment(null)}>Fermer</Btn>
              <div className="flex gap-2 flex-wrap">
                <Btn icon="draw" variant="secondary" onClick={() => setReceiptTab('sign')}>Signer</Btn>
                <Btn icon="print" variant="secondary" onClick={printReceipt}>Imprimer</Btn>
                <Btn icon="chat" variant="green" onClick={whatsappReceiptWithPDF}>WhatsApp + PDF</Btn>
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
                <Btn icon="chat" variant="green" onClick={whatsappReceiptWithPDF}>WhatsApp + PDF</Btn>
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
                    srcDoc={buildReceiptHTMLShared(quittancePayment, orgSettings, signatures)}
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
                  storageKey={`minsouah_sig_${state.currentUser?.id || 'me'}`}
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
                      const html = buildReceiptHTMLShared(quittancePayment, orgSettings, { bailleur: b, locataire: l });
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
              <Field label="Date de paiement">
                <input type="date" value={editForm.paidDate} onChange={e => setEditForm(f => ({ ...f, paidDate: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <Field label="Mode de paiement">
              <select value={editForm.method} onChange={e => setEditForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                {['Espèces','Virement','Mobile Money','Chèque','Autre'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
        )}
      </ModalWrap>

      {/* ══════════════ MODAL: Ajouter un arriéré ══════════════ */}
      <ModalWrap
        open={arrearsAddModal}
        onClose={() => setArrearsAddModal(false)}
        title="Ajouter des arriérés"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setArrearsAddModal(false)}>Annuler</Btn>
            <Btn icon="save"
              onClick={handleSaveArrear}
              disabled={!arrearsAddForm.tenantId || (arrearsAddForm.months || []).length === 0 || !arrearsAddForm.amountPerMonth}>
              Enregistrer {(arrearsAddForm.months || []).length > 1 ? `(${(arrearsAddForm.months || []).length} mois)` : 'l\'arriéré'}
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Locataire" required>
            <SearchSelect
              options={(tenants || []).map(t => ({ value: String(t.id), label: t.name || '—', sub: t.phone || '' }))}
              value={arrearsAddForm.tenantId}
              onChange={val => {
                const t = (tenants || []).find(t2 => String(t2.id) === String(val));
                const contract = t ? (contracts || []).find(c =>
                  (c.status === 'Actif' || c.status === 'Expirant') &&
                  (c.tenant === t.name || String(c.tenantId) === String(t.id))
                ) : null;
                setArrearsAddForm(f => ({
                  ...f,
                  tenantId: val,
                  months: [],
                  amountPerMonth: contract ? String(contract.rent || '') : f.amountPerMonth,
                  propertyName: contract ? (contract.propertyName || '') : f.propertyName,
                }));
              }}
              placeholder="Sélectionner un locataire…"
            />
          </Field>

          <Field label="Mois d'arriérés (plusieurs choix possibles)" required>
            {(() => {
              const pastMonths = allMonths.filter(m => {
                const [mn, yr] = m.split(' ');
                const idx = MONTH_NAMES.indexOf(mn);
                const y = parseInt(yr);
                const cy = now.getFullYear(), cm = now.getMonth();
                return y < cy || (y === cy && idx < cm);
              }).reverse();
              return (
                <div className="border border-outline-variant rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  {pastMonths.map(m => {
                    const months = arrearsAddForm.months || [];
                    const checked = months.includes(m);
                    return (
                      <label key={m} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-outline-variant/20 last:border-0 transition-colors ${checked ? 'bg-primary/8' : 'hover:bg-surface-container'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setArrearsAddForm(f => ({
                            ...f,
                            months: checked ? (f.months || []).filter(x => x !== m) : [...(f.months || []), m],
                          }))}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm font-medium">{m}</span>
                        {checked && <span className="ml-auto text-xs text-primary font-bold">✓</span>}
                      </label>
                    );
                  })}
                  {pastMonths.length === 0 && <p className="px-4 py-3 text-sm text-on-surface-variant">Aucun mois passé disponible.</p>}
                </div>
              );
            })()}
          </Field>

          <Field label="Loyer mensuel (FCFA)" required>
            <input
              type="number"
              value={arrearsAddForm.amountPerMonth}
              onChange={e => setArrearsAddForm(f => ({ ...f, amountPerMonth: e.target.value }))}
              placeholder="Ex : 130000"
              className={inputCls}
            />
          </Field>

          {(arrearsAddForm.months || []).length > 0 && arrearsAddForm.amountPerMonth && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-amber-800">
                <span className="font-semibold">{(arrearsAddForm.months || []).length} mois</span> × {fmt(Number(arrearsAddForm.amountPerMonth))}
              </div>
              <span className="font-black text-amber-900 text-base">
                = {fmt((arrearsAddForm.months || []).length * Number(arrearsAddForm.amountPerMonth))}
              </span>
            </div>
          )}

          <Field label="Statut">
            <select
              value={arrearsAddForm.status}
              onChange={e => setArrearsAddForm(f => ({ ...f, status: e.target.value }))}
              className={inputCls}
            >
              <option value="Impayé">Impayé</option>
              <option value="En retard">En retard</option>
              <option value="Payé">Payé (régularisation)</option>
            </select>
          </Field>
          {arrearsAddForm.propertyName && (
            <div className="bg-surface-container rounded-xl px-3 py-2 text-xs text-on-surface-variant">
              Propriété : <span className="font-semibold text-on-surface">{arrearsAddForm.propertyName}</span>
            </div>
          )}
        </div>
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

      {/* ── Month closure modal ── */}
      <ModalWrap
        open={closureModal}
        onClose={() => { setClosureModal(false); setClosureNote(''); }}
        title={`Clôturer ${selectedMonth}`}
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => { setClosureModal(false); setClosureNote(''); }}>Annuler</Btn>
            <button onClick={handleCloseMonth} disabled={closureLoading}
              className="px-4 py-2 text-sm font-bold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-60">
              <Icon name="lock" size={16} />
              {closureLoading ? 'En cours…' : 'Clôturer'}
            </button>
          </>
        }
      >
        {(() => {
          const monthPmtsAll = payments.filter(p => p.month === selectedMonth);
          const paidPmts   = monthPmtsAll.filter(p => p.status === 'Payé');
          const unpaidPmts = monthPmtsAll.filter(p => p.status !== 'Payé' && p.status !== 'Annulé');
          const totalColl  = paidPmts.reduce((s, p) => s + (p.amount || 0), 0);
          const totalUnp   = unpaidPmts.reduce((s, p) => s + (p.amount || 0), 0);
          const rate = (totalColl + totalUnp) > 0 ? Math.round(totalColl / (totalColl + totalUnp) * 100) : 0;
          return (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-on-surface-variant">Un snapshot sera enregistré. Les paiements reçus après cette date seront marqués <strong>post-clôture</strong>.</p>
              <div className="bg-surface-container rounded-xl p-4 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Paiements reçus</span>
                  <span className="font-bold text-green-700">{fmt(totalColl)} ({paidPmts.length})</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">Impayés restants</span>
                  <span className={`font-bold ${unpaidPmts.length > 0 ? 'text-red-700' : 'text-green-700'}`}>{fmt(totalUnp)} ({unpaidPmts.length})</span>
                </div>
                <div className="border-t border-outline-variant/20 pt-2 flex justify-between text-sm">
                  <span className="font-semibold text-on-surface">Taux de recouvrement</span>
                  <span className="font-black text-primary">{rate}%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">Note de clôture (optionnel)</label>
                <textarea
                  value={closureNote}
                  onChange={e => setClosureNote(e.target.value)}
                  rows={2}
                  placeholder="Ex: Versement effectué le 15/06/2026..."
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>
          );
        })()}
      </ModalWrap>
    </div>
  );
}
