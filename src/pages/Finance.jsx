import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { can } from '../lib/permissions';

const typeFilterOpts = ['Tous', 'Loyer', 'Réparations', 'Taxes', 'Entretien', 'Charges', 'Autre'];
const expenseTypes = ['Réparations', 'Taxes', 'Entretien', 'Charges', 'Autre'];

function isoToFr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-sm shadow-modal text-body-sm">
      <p className="font-label-md text-on-surface mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name === 'revenus' ? 'Revenus' : 'Dépenses'}: {(p.value / 1000).toFixed(0)}k FCFA
        </p>
      ))}
    </div>
  );
};

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

function parsePaidDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return { month: m, year: y };
  }
  return null;
}

export default function Finance() {
  const { state, dispatch } = useApp();
  const canCreate = can(state.currentUser, 'finance', 'create');
  const canEdit   = can(state.currentUser, 'finance', 'edit');
  const canDelete = can(state.currentUser, 'finance', 'delete');
  const { transactions = [], payments = [] } = state;
  const [chartType, setChartType] = useState('area');
  const [chartPeriod, setChartPeriod] = useState('12 Mois');
  const [typeFilter, setTypeFilter] = useState('Tous');
  const [searchTx, setSearchTx] = useState('');
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ date: '', entity: '', description: '', amount: '', type: 'Réparations' });
  const [deleteTxTarget, setDeleteTxTarget] = useState(null);

  const currentYear = new Date().getFullYear();

  // Generate real revenue data from paid payments grouped by month
  const revenueData = useMemo(() => {
    return MONTHS_SHORT.map((mois, idx) => {
      const revenus = payments
        .filter(p => {
          if (p.status !== 'Payé') return false;
          const parsed = parsePaidDate(p.paidDate);
          return parsed && parsed.month === idx && parsed.year === currentYear;
        })
        .reduce((s, p) => s + (p.amount || 0), 0);
      const depenses = transactions
        .filter(t => {
          if (t.positive) return false;
          const parsed = parsePaidDate(t.date);
          return parsed && parsed.month === idx && parsed.year === currentYear;
        })
        .reduce((s, t) => s + Math.abs(t.amount || 0), 0);
      return { mois, revenus, depenses };
    });
  }, [payments, transactions, currentYear]);

  // Use manual transactions if any, else derive from paid payments
  const effectiveTx = useMemo(() => {
    if (transactions.length > 0) return transactions;
    return payments
      .filter(p => p.status === 'Payé')
      .map(p => ({
        id: p.id,
        date: p.paidDate || '—',
        entity: p.tenantName || '—',
        description: `Loyer ${p.month}${p.propertyName ? ' — ' + p.propertyName : ''}`,
        amount: p.amount || 0,
        positive: true,
        type: 'Loyer',
        status: 'Confirmé',
      }))
      .sort((a, b) => {
        const da = parsePaidDate(a.date), db = parsePaidDate(b.date);
        if (!da || !db) return 0;
        return (db.year * 12 + db.month) - (da.year * 12 + da.month);
      });
  }, [transactions, payments]);

  const filteredTx = effectiveTx.filter((t) => {
    const matchType = typeFilter === 'Tous' || t.type === typeFilter;
    const q = searchTx.toLowerCase();
    const matchSearch = (t.entity || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const totalRevenues = payments.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const totalDepenses = transactions.filter(t => !t.positive).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
  const cashFlow = totalRevenues - totalDepenses;

  const kpis = [
    {
      label: 'Revenus Totaux',
      value: `${totalRevenues.toLocaleString('fr-FR')} FCFA`,
      sub: `${payments.filter(p => p.status === 'Payé').length} paiement(s) encaissé(s)`,
      subColor: 'text-green-600',
      icon: 'trending_up',
      iconBg: 'bg-primary/10 text-primary',
    },
    {
      label: 'Dépenses',
      value: `${totalDepenses.toLocaleString('fr-FR')} FCFA`,
      sub: `${payments.filter(p => p.status !== 'Payé').length} paiement(s) en attente`,
      subColor: 'text-error',
      icon: 'payments',
      iconBg: 'bg-error/10 text-error',
    },
    {
      label: 'Cash Flow Net',
      value: `${cashFlow.toLocaleString('fr-FR')} FCFA`,
      sub: cashFlow >= 0 ? 'Solde positif' : 'Solde négatif',
      subColor: 'text-green-600',
      icon: 'account_balance',
      highlight: true,
    },
  ];

  const handleExportPDF = () => {
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const totalRev = filteredTx.filter(t => t.positive).reduce((s, t) => s + t.amount, 0);
    const totalDep = filteredTx.filter(t => !t.positive).reduce((s, t) => s + Math.abs(t.amount), 0);
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport Financier ${currentYear}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1c1b19;background:#fff;padding:40px}
  h1{font-size:22px;font-weight:900;color:#785a00;margin-bottom:4px}
  .sub{font-size:12px;color:#817662;margin-bottom:20px}
  .kpis{display:flex;gap:14px;margin-bottom:20px;flex-wrap:wrap}
  .kpi{flex:1;min-width:140px;border:1px solid #e3d9cc;border-radius:10px;padding:14px}
  .kpi-l{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#817662;margin-bottom:4px}
  .kpi-v{font-size:20px;font-weight:900;color:#1c1b19}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#785a00;color:#fff;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px}
  td{padding:8px 12px;border-bottom:1px solid #f0e8de;vertical-align:top}
  .pos{color:#166534;font-weight:700}.neg{color:#ba1a1a;font-weight:700}
  .footer{margin-top:20px;font-size:10px;color:#b0a090;text-align:center}
  @media print{body{padding:20px}}
</style></head><body>
<h1>Rapport Financier — ${currentYear}</h1>
<p class="sub">Généré le ${today} — ${filteredTx.length} transaction(s)${typeFilter !== 'Tous' ? ' — Filtre : ' + typeFilter : ''}</p>
<div class="kpis">
  <div class="kpi"><div class="kpi-l">Revenus</div><div class="kpi-v">${totalRev.toLocaleString('fr-FR')} FCFA</div></div>
  <div class="kpi"><div class="kpi-l">Dépenses</div><div class="kpi-v">${totalDep.toLocaleString('fr-FR')} FCFA</div></div>
  <div class="kpi"><div class="kpi-l">Cash Flow</div><div class="kpi-v" style="color:${totalRev - totalDep >= 0 ? '#166534' : '#ba1a1a'}">${(totalRev - totalDep).toLocaleString('fr-FR')} FCFA</div></div>
</div>
<table>
  <thead><tr><th>Date</th><th>Entité</th><th>Description</th><th>Type</th><th>Statut</th><th style="text-align:right">Montant</th></tr></thead>
  <tbody>
    ${filteredTx.map(tx => `<tr>
      <td>${tx.date}</td><td>${tx.entity}</td><td>${tx.description}</td><td>${tx.type}</td><td>${tx.status}</td>
      <td style="text-align:right" class="${tx.positive ? 'pos' : 'neg'}">${tx.positive ? '+' : ''}${tx.amount.toLocaleString('fr-FR')} FCFA</td>
    </tr>`).join('')}
  </tbody>
</table>
<p class="footer">Minsouah — Gestion Immobilière — Document généré automatiquement</p>
<script>window.onload=()=>window.print();</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleAddExpense = () => {
    if (!expenseForm.description.trim() || !expenseForm.amount) return;
    dispatch({
      type: 'ADD_TRANSACTION',
      payload: {
        date: isoToFr(expenseForm.date) || new Date().toLocaleDateString('fr-FR'),
        entity: expenseForm.entity.trim() || 'Interne',
        description: expenseForm.description.trim(),
        amount: Math.abs(Number(expenseForm.amount)),
        positive: false,
        type: expenseForm.type,
        status: 'Confirmé',
      },
    });
    setExpenseModal(false);
    setExpenseForm({ date: '', entity: '', description: '', amount: '', type: 'Réparations' });
  };

  const handleDeleteTx = () => {
    dispatch({ type: 'DELETE_TRANSACTION', payload: deleteTxTarget.id });
    setDeleteTxTarget(null);
  };

  const handleExportExcel = () => {
    const data = filteredTx.map(t => ({
      'Date': t.date || '', 'Description': t.description || t.label || '',
      'Entité': t.entity || '', 'Montant (FCFA)': t.amount || 0,
      'Type': t.positive ? 'Revenu' : 'Dépense',
      'Propriété': t.propertyName || t.property || '',
      'Catégorie': t.type || '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Transactions');
    XLSX.writeFile(wb, 'Finances_Minsouah.xlsx');
  };

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* KPI cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`p-md rounded-xl shadow-card border border-outline-variant/20 ${
              kpi.highlight ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest'
            }`}
          >
            <div className="flex justify-between items-start mb-sm">
              <span className={`text-label-md font-label-md uppercase tracking-wider ${kpi.highlight ? 'text-primary-fixed' : 'text-on-surface-variant'}`}>
                {kpi.label}
              </span>
              <div className={`p-xs rounded-lg ${kpi.highlight ? 'bg-white/20 text-white' : kpi.iconBg}`}>
                <Icon name={kpi.icon} size={20} />
              </div>
            </div>
            <div className="flex items-end gap-xs">
              <h3 className={`font-display text-[28px] font-bold ${kpi.highlight ? 'text-white' : 'text-on-surface'}`}>
                {kpi.value}
              </h3>
            </div>
            <p className={`text-label-sm font-label-sm mt-xs ${kpi.highlight ? 'text-primary-fixed/80' : kpi.subColor}`}>
              {kpi.sub}
            </p>
          </div>
        ))}
      </section>

      {/* Revenue trend chart */}
      <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
        <div className="flex flex-wrap justify-between items-start gap-md mb-lg">
          <div>
            <h3 className="font-h3 text-h3 text-on-surface">Tendances des Revenus Mensuels</h3>
            <p className="text-body-sm text-on-surface-variant mt-1">Performance — Exercice Fiscal {currentYear}</p>
          </div>
          <div className="flex flex-wrap gap-sm">
            {/* Chart type toggles */}
            <div className="flex rounded-lg overflow-hidden border border-outline-variant">
              <button
                onClick={() => setChartType('area')}
                className={`px-sm py-xs text-label-sm transition-colors ${chartType === 'area' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                <Icon name="area_chart" size={16} />
              </button>
              <button
                onClick={() => setChartType('bar')}
                className={`px-sm py-xs text-label-sm transition-colors ${chartType === 'bar' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                <Icon name="bar_chart" size={16} />
              </button>
            </div>
            {/* Period toggles */}
            {['6 Mois', '12 Mois'].map((p) => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className={`px-sm py-xs border border-outline-variant rounded-lg text-label-sm transition-colors ${chartPeriod === p ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'area' ? (
              <AreaChart data={chartPeriod === '6 Mois' ? revenueData.slice(-6) : revenueData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRev2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#785a00" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#785a00" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDep2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ba1a1a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ba1a1a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={42} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenus" stroke="#785a00" strokeWidth={2.5} fill="url(#gradRev2)" dot={false} activeDot={{ r: 4, fill: '#785a00' }} />
                <Area type="monotone" dataKey="depenses" stroke="#ba1a1a" strokeWidth={2} fill="url(#gradDep2)" dot={false} activeDot={{ r: 4, fill: '#ba1a1a' }} />
              </AreaChart>
            ) : (
              <BarChart data={chartPeriod === '6 Mois' ? revenueData.slice(-6) : revenueData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={42} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={(v) => v === 'revenus' ? 'Revenus' : 'Dépenses'} />
                <Bar dataKey="revenus" fill="#785a00" fillOpacity={0.8} radius={[4, 4, 0, 0]} />
                <Bar dataKey="depenses" fill="#ba1a1a" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Chart legend */}
        <div className="flex gap-lg mt-sm pt-sm border-t border-outline-variant/20">
          <div className="flex items-center gap-xs">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-label-sm text-on-surface-variant">Revenus</span>
          </div>
          <div className="flex items-center gap-xs">
            <div className="w-3 h-3 rounded-full bg-error" />
            <span className="text-label-sm text-on-surface-variant">Dépenses</span>
          </div>
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        {/* Table header */}
        <div className="p-md border-b border-outline-variant/20 flex flex-wrap justify-between items-center gap-md">
          <h3 className="font-h3 text-h3 text-on-surface">Transactions Récentes</h3>
          <div className="flex flex-wrap gap-sm items-center">
            {/* Type filter */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar">
              {typeFilterOpts.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTypeFilter(opt)}
                  className={`px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${
                    typeFilter === opt
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchTx}
                onChange={(e) => setSearchTx(e.target.value)}
                className="pl-9 pr-md py-xs bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:outline-none focus:border-primary w-44"
              />
            </div>
            {canCreate && (
              <Button icon="add_circle" size="sm" onClick={() => setExpenseModal(true)}>
                Dépense
              </Button>
            )}
            <Button icon="picture_as_pdf" variant="secondary" size="sm" onClick={handleExportPDF}>
              Export PDF
            </Button>
            <Button icon="download" variant="secondary" size="sm" onClick={handleExportExcel}>
              Export Excel
            </Button>
          </div>
        </div>

        {/* Table body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary text-on-primary">
              <tr>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Date</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Entité / Propriété</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Type</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Statut</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider text-right">Montant</th>
                <th className="px-md py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredTx.map((tx) => {
                const isManual = transactions.some(t => t.id === tx.id);
                return (
                <tr key={tx.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="px-md py-4 text-body-sm text-on-surface">{tx.date}</td>
                  <td className="px-md py-4">
                    <div className="flex flex-col">
                      <span className="text-label-md font-label-md text-on-surface">{tx.entity}</span>
                      <span className="text-body-sm text-outline">{tx.description}</span>
                    </div>
                  </td>
                  <td className="px-md py-4">
                    <Badge label={tx.type} variant="type" />
                  </td>
                  <td className="px-md py-4">
                    <div className="flex items-center gap-xs">
                      <div className={`w-2 h-2 rounded-full ${tx.status === 'En attente' ? 'bg-amber-500' : 'bg-green-500'}`} />
                      <span className={`text-label-sm font-label-sm ${tx.status === 'En attente' ? 'text-amber-700' : 'text-green-700'}`}>
                        {tx.status}
                      </span>
                    </div>
                  </td>
                  <td className={`px-md py-4 text-right font-label-md text-label-md ${tx.positive ? 'text-green-700' : 'text-error'}`}>
                    {tx.positive ? '+' : ''}{tx.amount.toLocaleString('fr-FR')} FCFA
                  </td>
                  <td className="px-md py-4">
                    {isManual && canDelete && (
                      <button
                        onClick={() => setDeleteTxTarget(tx)}
                        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full flex items-center justify-center text-error hover:bg-error/10 transition-all"
                        title="Supprimer"
                      >
                        <Icon name="delete" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
              {filteredTx.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-xl text-on-surface-variant">Aucune transaction trouvée</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-md py-4 flex items-center justify-between bg-surface-container-low border-t border-outline-variant/20">
          <span className="text-body-sm text-on-surface-variant">
            {filteredTx.length} transaction(s) affichée(s) sur {effectiveTx.length}
          </span>
          <div className="flex gap-2">
            <button disabled className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded-lg opacity-40">
              <Icon name="chevron_left" size={16} />
            </button>
            <button className="w-8 h-8 flex items-center justify-center bg-primary text-on-primary rounded-lg text-label-sm">1</button>
            <button className="w-8 h-8 flex items-center justify-center border border-outline-variant rounded-lg hover:bg-surface-container text-on-surface-variant">
              <Icon name="chevron_right" size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Delete transaction confirmation */}
      {deleteTxTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-modal w-full max-w-sm p-lg flex flex-col gap-md">
            <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto">
              <Icon name="warning" size={28} className="text-error" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-on-surface text-base mb-1">Supprimer la transaction ?</h3>
              <p className="text-sm text-on-surface-variant">
                <strong className="text-on-surface">{deleteTxTarget.description}</strong><br />
                {Math.abs(deleteTxTarget.amount).toLocaleString('fr-FR')} FCFA — {deleteTxTarget.date}
              </p>
              <p className="text-xs text-on-surface-variant mt-2">Cette action est irréversible.</p>
            </div>
            <div className="flex gap-sm">
              <Button variant="ghost" onClick={() => setDeleteTxTarget(null)}>Annuler</Button>
              <Button icon="delete" onClick={handleDeleteTx}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Expense modal */}
      {expenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-modal w-full max-w-md p-lg flex flex-col gap-md">
            <div className="flex items-center justify-between">
              <h2 className="font-h2 text-h2 text-on-surface">Enregistrer une dépense</h2>
              <button onClick={() => setExpenseModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant">
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-sm">
              <label className="text-label-sm font-label-sm text-on-surface-variant">Date</label>
              <input
                type="date"
                value={expenseForm.date}
                onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary"
              />
              <label className="text-label-sm font-label-sm text-on-surface-variant">Bénéficiaire / Entité</label>
              <input
                type="text"
                placeholder="Ex : Entreprise Koné, Mairie..."
                value={expenseForm.entity}
                onChange={e => setExpenseForm(f => ({ ...f, entity: e.target.value }))}
                className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary"
              />
              <label className="text-label-sm font-label-sm text-on-surface-variant">Libellé *</label>
              <input
                type="text"
                placeholder="Description de la dépense..."
                value={expenseForm.description}
                onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary"
              />
              <label className="text-label-sm font-label-sm text-on-surface-variant">Catégorie</label>
              <select
                value={expenseForm.type}
                onChange={e => setExpenseForm(f => ({ ...f, type: e.target.value }))}
                className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary"
              >
                {expenseTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="text-label-sm font-label-sm text-on-surface-variant">Montant (FCFA) *</label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={expenseForm.amount}
                onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex gap-sm justify-end pt-sm border-t border-outline-variant/20">
              <Button variant="ghost" onClick={() => setExpenseModal(false)}>Annuler</Button>
              <Button icon="remove_circle" onClick={handleAddExpense}>Enregistrer la dépense</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
