import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { can } from '../lib/permissions';
import { buildingOf } from '../lib/commissions';

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const fmt = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;

// Parse a French "dd mmm. yyyy" / "dd/mm/yyyy" / ISO date
function parseAnyDate(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const d = new Date(str); return isNaN(d) ? null : d; }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(str)) { const [d, m, y] = str.split('/'); return new Date(+y, +m - 1, +d); }
  const m = String(str).match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (m) {
    const FR = { jan: 0, fév: 1, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5, juil: 6, aoû: 7, aou: 7, sep: 8, oct: 9, nov: 10, déc: 11, dec: 11 };
    const key = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3);
    const idx = FR[key] ?? FR[m[2].toLowerCase().slice(0, 3)];
    if (idx != null) return new Date(+m[3], idx, +m[1]);
  }
  return null;
}

export default function RevenusMinsouah() {
  const { state } = useApp();
  const { orgSettings, organizations = [], owners = [] } = state;
  const myOrgId = state.currentUser?.orgId || null;
  const currentUser = state.currentUser;

  // Org-scoped, only cashed payments carrying a frozen commission
  const commPayments = useMemo(() => {
    const src = myOrgId ? (state.payments || []).filter(p => p.orgId === myOrgId) : (state.payments || []);
    return src.filter(p => p.status === 'Payé' && p.commissionAmount != null);
  }, [state.payments, myOrgId]);

  const bordereaux = useMemo(() => {
    const src = myOrgId ? (state.bordereaux || []).filter(b => b.orgId === myOrgId) : (state.bordereaux || []);
    return src.filter(b => b.type === 'PROPRIETAIRE' && b.status === 'Validé');
  }, [state.bordereaux, myOrgId]);

  const commDate = (p) => (p.commissionFrozenAt ? new Date(p.commissionFrozenAt) : parseAnyDate(p.paidDate));

  /* ── KPIs par période ── */
  const kpis = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (now.getDay() + 6) % 7;
    const startWeek = new Date(startToday); startWeek.setDate(startToday.getDate() - dow);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startYear = new Date(now.getFullYear(), 0, 1);
    const sumSince = (start) => commPayments.filter(p => { const d = commDate(p); return d && !isNaN(d) && d >= start; }).reduce((s, p) => s + (p.commissionAmount || 0), 0);
    return {
      jour: sumSince(startToday), semaine: sumSince(startWeek),
      mois: sumSince(startMonth), annee: sumSince(startYear),
      total: commPayments.reduce((s, p) => s + (p.commissionAmount || 0), 0),
    };
  }, [commPayments]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Évolution mensuelle (12 derniers mois) ── */
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, Commissions: 0 });
    }
    const idx = Object.fromEntries(buckets.map((b, i) => [b.key, i]));
    commPayments.forEach(p => { const d = commDate(p); if (!d || isNaN(d)) return; const k = `${d.getFullYear()}-${d.getMonth()}`; if (idx[k] != null) buckets[idx[k]].Commissions += p.commissionAmount || 0; });
    return buckets;
  }, [commPayments]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Évolution annuelle ── */
  const yearly = useMemo(() => {
    const map = {};
    commPayments.forEach(p => { const d = commDate(p); if (!d || isNaN(d)) return; const y = d.getFullYear(); map[y] = (map[y] || 0) + (p.commissionAmount || 0); });
    return Object.entries(map).map(([label, v]) => ({ label, Commissions: v })).sort((a, b) => a.label.localeCompare(b.label));
  }, [commPayments]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Répartitions ── */
  const byOwner = useMemo(() => {
    const g = {};
    commPayments.forEach(p => { const key = p.ownerName || (p.ownerId != null ? `#${p.ownerId}` : '—'); if (!g[key]) g[key] = { name: key, commission: 0, brut: 0, n: 0 }; g[key].commission += p.commissionAmount || 0; g[key].brut += p.amount || 0; g[key].n++; });
    return Object.values(g).sort((a, b) => b.commission - a.commission);
  }, [commPayments]);

  const byBuilding = useMemo(() => {
    const g = {};
    commPayments.forEach(p => { const key = buildingOf(p.propertyName) || '—'; if (!g[key]) g[key] = { name: key, commission: 0, brut: 0, n: 0 }; g[key].commission += p.commissionAmount || 0; g[key].brut += p.amount || 0; g[key].n++; });
    return Object.values(g).sort((a, b) => b.commission - a.commission);
  }, [commPayments]);

  const orgName = (organizations.find(o => o.id === myOrgId)?.name) || orgSettings?.companyName || 'Organisation';

  /* ════════════ EXPORTS ════════════ */
  const detailRows = () => commPayments.map(p => {
    const d = commDate(p);
    return {
      Date: d && !isNaN(d) ? d.toLocaleDateString('fr-FR') : (p.paidDate || ''),
      Locataire: p.tenantName || '', Immeuble: buildingOf(p.propertyName), Propriété: p.propertyName || '',
      Propriétaire: p.ownerName || '', 'Montant brut': p.amount || 0, 'Taux (%)': p.commissionRate ?? '',
      Commission: p.commissionAmount || 0, 'Net propriétaire': p.montantNet ?? '',
      'Mode': p.method || '', 'Référence': p.reference || p.id,
    };
  });

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows()), 'Commissions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byOwner.map(o => ({ Propriétaire: o.name, 'Nb loyers': o.n, 'Brut': o.brut, 'Commission': o.commission }))), 'Par propriétaire');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byBuilding.map(o => ({ Immeuble: o.name, 'Nb loyers': o.n, 'Brut': o.brut, 'Commission': o.commission }))), 'Par immeuble');
    XLSX.writeFile(wb, `commissions_minsouah_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const exportCSV = () => {
    const rows = detailRows(); if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `commissions_minsouah_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const exportPDF = () => {
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = detailRows();
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport des commissions</title>
    <style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:11px;color:#1c1b19}
    h1{color:#6d3b07;font-size:18px;margin:0}.sub{color:#6b7280;font-size:11px;margin:4px 0 14px}
    .kpis{display:flex;gap:10px;margin-bottom:14px}.kpi{flex:1;border:1px solid #e3d9cc;border-radius:8px;padding:8px 10px}
    .kpi .l{font-size:9px;color:#6b7280;text-transform:uppercase}.kpi .v{font-size:15px;font-weight:800;color:#6d3b07}
    table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{border:1px solid #e5e7eb;padding:4px 6px;text-align:left}
    th{background:#6d3b07;color:#fff;font-size:9px;text-transform:uppercase}td.n{text-align:right}
    h2{font-size:13px;color:#6d3b07;margin:14px 0 6px}</style></head><body>
    <h1>Rapport des commissions — ${esc(orgName)}</h1>
    <div class="sub">${esc(orgSettings?.companyName || 'Minsouah Immobilier')} · Généré le ${new Date().toLocaleDateString('fr-FR')}</div>
    <div class="kpis">
      <div class="kpi"><div class="l">Aujourd'hui</div><div class="v">${fmt(kpis.jour)}</div></div>
      <div class="kpi"><div class="l">Ce mois</div><div class="v">${fmt(kpis.mois)}</div></div>
      <div class="kpi"><div class="l">Cette année</div><div class="v">${fmt(kpis.annee)}</div></div>
      <div class="kpi"><div class="l">Total</div><div class="v">${fmt(kpis.total)}</div></div>
    </div>
    <h2>Détail des commissions (${rows.length})</h2>
    <table><thead><tr><th>Date</th><th>Locataire</th><th>Immeuble</th><th>Propriétaire</th><th>Brut</th><th>Taux</th><th>Commission</th><th>Net proprio</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${esc(r.Date)}</td><td>${esc(r.Locataire)}</td><td>${esc(r.Immeuble)}</td><td>${esc(r.Propriétaire)}</td><td class="n">${fmt(r['Montant brut'])}</td><td class="n">${esc(r['Taux (%)'])}%</td><td class="n">${fmt(r.Commission)}</td><td class="n">${fmt(r['Net propriétaire'])}</td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#999">Aucune commission</td></tr>'}</tbody></table>
    <h2>Par propriétaire</h2>
    <table><thead><tr><th>Propriétaire</th><th>Nb loyers</th><th>Brut</th><th>Commission</th></tr></thead>
    <tbody>${byOwner.map(o => `<tr><td>${esc(o.name)}</td><td class="n">${o.n}</td><td class="n">${fmt(o.brut)}</td><td class="n">${fmt(o.commission)}</td></tr>`).join('')}</tbody></table>
    <script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
    const w = window.open('', '_blank', 'width=1000,height=800'); if (w) { w.document.write(html); w.document.close(); }
  };

  if (!can(currentUser, 'revenus', 'view')) {
    return <div className="p-8 text-center text-on-surface-variant"><Icon name="lock" size={40} className="opacity-40 mb-2" /><p>Accès non autorisé.</p></div>;
  }

  const KPI = ({ label, value, icon, cls }) => (
    <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${cls}`}><Icon name={icon} size={20} /></div>
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="text-xl font-black text-on-surface mt-0.5">{fmt(value)}</p>
    </div>
  );

  return (
    <div className="p-3 sm:p-margin flex flex-col gap-md">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-h2 text-h2 font-black text-on-surface flex items-center gap-2"><Icon name="savings" /> Revenus Minsouah</h1>
          <p className="text-sm text-on-surface-variant">Commissions de gestion — {orgName}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportPDF} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-surface-container"><Icon name="picture_as_pdf" size={16} /> PDF</button>
          <button onClick={exportExcel} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-surface-container"><Icon name="table_view" size={16} /> Excel</button>
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-surface-container"><Icon name="download" size={16} /> CSV</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Aujourd'hui" value={kpis.jour} icon="today" cls="text-primary bg-primary/10" />
        <KPI label="Cette semaine" value={kpis.semaine} icon="date_range" cls="text-blue-700 bg-blue-100" />
        <KPI label="Ce mois" value={kpis.mois} icon="calendar_month" cls="text-amber-700 bg-amber-100" />
        <KPI label="Cette année" value={kpis.annee} icon="event" cls="text-green-700 bg-green-100" />
      </div>

      {/* Évolution mensuelle */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
        <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2"><Icon name="bar_chart" size={18} /> Évolution mensuelle des commissions</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="label" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Bar dataKey="Commissions" fill="#6d3b07" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid lg:grid-cols-2 gap-md">
        {/* Top propriétaires */}
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
          <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2"><Icon name="emoji_events" size={18} /> Top propriétaires</h3>
          {byOwner.length === 0 ? <p className="text-sm text-on-surface-variant py-4 text-center">Aucune commission.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-on-surface-variant"><tr>{['Propriétaire', 'Brut', 'Commission'].map(h => <th key={h} className="px-2 py-1.5 text-xs font-bold uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-outline-variant/20">
                {byOwner.slice(0, 8).map(o => (
                  <tr key={o.name}><td className="px-2 py-2 font-semibold">{o.name}</td><td className="px-2 py-2 text-on-surface-variant">{fmt(o.brut)}</td><td className="px-2 py-2 font-bold text-primary">{fmt(o.commission)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Top immeubles */}
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
          <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2"><Icon name="apartment" size={18} /> Top immeubles</h3>
          {byBuilding.length === 0 ? <p className="text-sm text-on-surface-variant py-4 text-center">Aucune commission.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-on-surface-variant"><tr>{['Immeuble', 'Brut', 'Commission'].map(h => <th key={h} className="px-2 py-1.5 text-xs font-bold uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-outline-variant/20">
                {byBuilding.slice(0, 8).map(o => (
                  <tr key={o.name}><td className="px-2 py-2 font-semibold">{o.name}</td><td className="px-2 py-2 text-on-surface-variant">{fmt(o.brut)}</td><td className="px-2 py-2 font-bold text-primary">{fmt(o.commission)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Évolution annuelle + total */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
        <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2"><Icon name="stacked_line_chart" size={18} /> Évolution annuelle</h3>
        {yearly.length === 0 ? <p className="text-sm text-on-surface-variant py-4 text-center">Aucune donnée.</p> : (
          <div className="flex flex-wrap gap-3">
            {yearly.map(y => (
              <div key={y.label} className="flex-1 min-w-[120px] bg-surface-container-low rounded-xl p-3 text-center">
                <p className="text-xs text-on-surface-variant">{y.label}</p>
                <p className="text-lg font-black text-primary mt-0.5">{fmt(y.Commissions)}</p>
              </div>
            ))}
            <div className="flex-1 min-w-[120px] bg-primary/10 rounded-xl p-3 text-center">
              <p className="text-xs text-primary font-semibold">TOTAL</p>
              <p className="text-lg font-black text-primary mt-0.5">{fmt(kpis.total)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
