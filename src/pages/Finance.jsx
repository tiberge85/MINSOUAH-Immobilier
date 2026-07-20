import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../componimport { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { can } from '../lib/permissions';

const typeFilterOpts = ['Tous', 'Loyer', 'Réparations', 'Taxes', 'Entretien', 'Charges', 'Autre'];
const expenseTypes = ['Travaux', 'Réparations', 'Eau', 'Électricité', 'Taxes', 'Entretien', 'Charges', 'Autre'];

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const fmt = (n) => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';

function isoToFr(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/* Analyse robuste d'une date : ISO (yyyy-mm-dd) OU jj/mm/aaaa OU objet Date. */
function parseAnyDate(str) {
  if (!str) return null;
  if (str instanceof Date) return isNaN(str.getTime()) ? null : str;
  const s = String(str).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/* Date du 1er du mois correspondant à un libellé « Août 2026 ». */
function monthLabelToDate(label) {
  if (!label) return null;
  const [mn, yr] = String(label).split(' ');
  const i = MONTHS_FR.indexOf(mn);
  return i >= 0 && yr ? new Date(parseInt(yr), i, 1) : null;
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

/* ── Carte statistique compacte ──────────────────────────────────────────── */
function StatCard({ label, value, icon, tone = 'neutral', sub }) {
  const tones = {
    neutral:  'bg-surface-container-lowest text-on-surface',
    green:    'bg-green-50 text-green-800 border-green-200',
    red:      'bg-red-50 text-red-800 border-red-200',
    blue:     'bg-blue-50 text-blue-800 border-blue-200',
    amber:    'bg-amber-50 text-amber-800 border-amber-200',
    primary:  'bg-primary text-on-primary',
  };
  const iconTones = {
    neutral: 'bg-primary/10 text-primary',
    green:   'bg-green-100 text-green-700',
    red:     'bg-red-100 text-red-700',
    blue:    'bg-blue-100 text-blue-700',
    amber:   'bg-amber-100 text-amber-700',
    primary: 'bg-white/20 text-white',
  };
  return (
    <div className={`p-md rounded-xl shadow-card border border-outline-variant/20 flex flex-col gap-1 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] uppercase tracking-wider font-semibold ${tone === 'primary' ? 'text-white/80' : 'opacity-70'}`}>{label}</span>
        {icon && <span className={`p-1.5 rounded-lg ${iconTones[tone]}`}><Icon name={icon} size={16} /></span>}
      </div>
      <span className="text-[20px] font-bold leading-tight">{value}</span>
      {sub && <span className={`text-[11px] ${tone === 'primary' ? 'text-white/70' : 'opacity-60'}`}>{sub}</span>}
    </div>
  );
}

const TABS = [
  { id: 'dashboard',   label: 'Tableau de bord',      icon: 'dashboard' },
  { id: 'bordereaux',  label: 'Bordereaux',            icon: 'receipt_long' },
  { id: 'caisse',      label: 'Versement Comptabilité', icon: 'point_of_sale' },
  { id: 'reversement', label: 'Reversement Propriétaire', icon: 'real_estate_agent' },
];

const PIE_COLORS = ['#785a00', '#0f766e', '#b45309', '#0369a1', '#7c3aed', '#65a30d', '#9ca3af'];

export default function Finance() {
  const { state, dispatch } = useApp();
  const canCreate = can(state.currentUser, 'finance', 'create');
  const canDelete = can(state.currentUser, 'finance', 'delete');
  // Isolation stricte par organisation.
  const myOrgId = state.currentUser?.orgId || null;
  const scope = (arr) => (myOrgId ? (arr || []).filter(x => x.orgId === myOrgId) : (arr || []));
  const transactions = useMemo(() => scope(state.transactions), [state.transactions, myOrgId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const payments     = useMemo(() => scope(state.payments),     [state.payments, myOrgId]);         // eslint-disable-line react-hooks/exhaustive-deps
  const tenants      = useMemo(() => scope(state.tenants),      [state.tenants, myOrgId]);          // eslint-disable-line react-hooks/exhaustive-deps

  const [activeTab, setActiveTab] = useState('dashboard');
  const [chartType, setChartType] = useState('area');
  const [chartPeriod, setChartPeriod] = useState('12 Mois');
  const [typeFilter, setTypeFilter] = useState('Tous');
  const [searchTx, setSearchTx] = useState('');
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ date: '', entity: '', description: '', amount: '', type: 'Réparations' });
  const [deleteTxTarget, setDeleteTxTarget] = useState(null);

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curMonthStart = new Date(curYear, curMonth, 1);
  const curMonthLabel = `${MONTHS_FR[curMonth]} ${curYear}`;
  const sameMonth = (d) => !!d && d.getMonth() === curMonth && d.getFullYear() === curYear;
  const isToday = (d) => !!d && d.toDateString() === now.toDateString();

  /* ─────────────────────────────────────────────────────────────────────────
     TABLEAU DE BORD — tout est calculé automatiquement à partir des paiements
     encaissés, des fiches locataires (cautions/avances) et des transactions
     (dépenses & recettes). Aucune saisie manuelle des montants.
     ───────────────────────────────────────────────────────────────────────── */
  const dash = useMemo(() => {
    const paid = payments.filter(p => p.status === 'Payé');

    // Encaissements du mois (par date de règlement)
    let encLoyerMois = 0, encArrieres = 0, encAvanceRent = 0, encToday = 0;
    let commissionMois = 0, heldEncaisse = 0, dejaReverse = 0;

    paid.forEach(p => {
      const pd = parseAnyDate(p.paidDate);
      const amt = Number(p.amount) || 0;
      const rm = monthLabelToDate(p.month);
      if (isToday(pd)) encToday += amt;
      if (!sameMonth(pd)) return;

      if (p.avanceVerseeProprio) {
        // Déjà reversé au propriétaire ce mois → sort de la trésorerie « à reverser ».
        dejaReverse += amt;
      } else {
        heldEncaisse += amt;
      }
      commissionMois += Number(p.commissionAmount) || 0;

      if (rm && rm.getTime() < curMonthStart.getTime()) encArrieres += amt;
      else if (rm && rm.getTime() > curMonthStart.getTime()) encAvanceRent += amt;
      else encLoyerMois += amt;
    });

    // Cautions & mois d'avance des NOUVEAUX locataires entrés ce mois
    let encCautions = 0, encAvanceDepot = 0;
    tenants.forEach(t => {
      const entry = parseAnyDate(t.since);
      if (!sameMonth(entry)) return;
      if (!t.cautionRefunded) encCautions += Number(t.cautionAmount) || 0;
      encAvanceDepot += Number(t.advanceAmount) || 0;
    });
    const encAvance = encAvanceRent + encAvanceDepot; // « Mois d'avance encaissés »

    // Recettes diverses & charges refacturées (transactions positives du mois)
    const posTx = transactions.filter(t => t.positive && sameMonth(parseAnyDate(t.date)));
    const encChargesRecues = posTx.filter(t => /charge/i.test(t.type || '')).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const encAutres = posTx.filter(t => !/charge/i.test(t.type || '')).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

    // Décaissements du mois (transactions négatives), classés en une seule catégorie
    const negTx = transactions.filter(t => !t.positive && sameMonth(parseAnyDate(t.date)));
    const dec = { travaux: 0, reparations: 0, eau: 0, electricite: 0, autres: 0 };
    negTx.forEach(t => {
      const amt = Math.abs(Number(t.amount) || 0);
      const s = `${t.type || ''} ${t.description || ''}`.toLowerCase();
      if (/répar|repar/.test(s)) dec.reparations += amt;
      else if (/travaux|entretien|rénov|renov|chantier/.test(s)) dec.travaux += amt;
      else if (/\beau\b|sodeci|facture d.?eau/.test(s)) dec.eau += amt;
      else if (/électr|electr|\bcie\b|courant|energie|énergie/.test(s)) dec.electricite += amt;
      else dec.autres += amt;
    });
    const totalDepenses = dec.travaux + dec.reparations + dec.eau + dec.electricite + dec.autres;

    const totalEncaisse = encLoyerMois + encArrieres + encAvance + encCautions + encChargesRecues + encAutres;
    const soldeDispo = totalEncaisse - totalDepenses;

    // Montant à reverser aux propriétaires = encaissements détenus (hors déjà versé)
    //  − commission MINSOUAH − charges (dépenses) du mois.
    const aReverser = Math.max(0, heldEncaisse + encCautions - commissionMois - totalDepenses);
    const resteReverser = Math.max(0, aReverser - dejaReverse);

    return {
      encLoyerMois, encArrieres, encAvance, encToday, encCautions,
      encChargesRecues, encAutres, commissionMois,
      dec, totalDepenses, totalEncaisse, soldeDispo,
      aReverser, dejaReverse, resteReverser,
    };
  }, [payments, tenants, transactions]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Répartition des encaissements du mois (camembert)
  const encaissePie = useMemo(() => ([
    { name: 'Loyers du mois', value: dash.encLoyerMois },
    { name: 'Arriérés', value: dash.encArrieres },
    { name: "Mois d'avance", value: dash.encAvance },
    { name: 'Cautions', value: dash.encCautions },
    { name: 'Charges', value: dash.encChargesRecues },
    { name: 'Autres recettes', value: dash.encAutres },
  ].filter(d => d.value > 0)), [dash]);

  // Courbe mensuelle (12 mois de l'exercice)
  const revenueData = useMemo(() => {
    return MONTHS_SHORT.map((mois, idx) => {
      const revenus = payments
        .filter(p => p.status === 'Payé')
        .filter(p => { const d = parseAnyDate(p.paidDate); return d && d.getMonth() === idx && d.getFullYear() === curYear; })
        .reduce((s, p) => s + (p.amount || 0), 0);
      const depenses = transactions
        .filter(t => !t.positive)
        .filter(t => { const d = parseAnyDate(t.date); return d && d.getMonth() === idx && d.getFullYear() === curYear; })
        .reduce((s, t) => s + Math.abs(t.amount || 0), 0);
      return { mois, revenus, depenses };
    });
  }, [payments, transactions, curYear]);

  // Comparatif annuel (4 derniers exercices)
  const annualData = useMemo(() => {
    const years = [curYear - 3, curYear - 2, curYear - 1, curYear];
    return years.map(y => {
      const revenus = payments
        .filter(p => p.status === 'Payé')
        .filter(p => { const d = parseAnyDate(p.paidDate); return d && d.getFullYear() === y; })
        .reduce((s, p) => s + (p.amount || 0), 0);
      const depenses = transactions
        .filter(t => !t.positive)
        .filter(t => { const d = parseAnyDate(t.date); return d && d.getFullYear() === y; })
        .reduce((s, t) => s + Math.abs(t.amount || 0), 0);
      return { mois: String(y), revenus, depenses };
    });
  }, [payments, transactions, curYear]);

  /* ── Transactions (dérivées des paiements si aucune saisie manuelle) ──────── */
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
        const da = parseAnyDate(a.date), db = parseAnyDate(b.date);
        if (!da || !db) return 0;
        return db.getTime() - da.getTime();
      });
  }, [transactions, payments]);

  const filteredTx = effectiveTx.filter((t) => {
    const matchType = typeFilter === 'Tous' || t.type === typeFilter;
    const q = searchTx.toLowerCase();
    const matchSearch = (t.entity || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const handleExportPDF = () => {
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const totalRev = filteredTx.filter(t => t.positive).reduce((s, t) => s + t.amount, 0);
    const totalDep = filteredTx.filter(t => !t.positive).reduce((s, t) => s + Math.abs(t.amount), 0);
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport Financier ${curYear}</title>
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
<h1>Rapport Financier — ${curYear}</h1>
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

      {/* ── Barre d'onglets ─────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-outline-variant/30">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
              activeTab === t.id
                ? 'text-primary border-primary'
                : 'text-on-surface-variant border-transparent hover:text-on-surface'
            }`}
          >
            <Icon name={t.icon} size={18} />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <div className="flex flex-col gap-gutter">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-h3 font-h3 text-on-surface">Tableau de bord financier</h2>
              <p className="text-body-sm text-on-surface-variant">Temps réel — {curMonthLabel}</p>
            </div>
          </div>

          {/* Encaissements */}
          <section>
            <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-2">
              <Icon name="south_west" size={16} className="text-green-600" /> Encaissements
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Loyers aujourd'hui" value={fmt(dash.encToday)} icon="today" tone="green" />
              <StatCard label="Loyers du mois" value={fmt(dash.encLoyerMois)} icon="payments" tone="green" />
              <StatCard label="Arriérés encaissés" value={fmt(dash.encArrieres)} icon="history" tone="amber" />
              <StatCard label="Cautions encaissées" value={fmt(dash.encCautions)} icon="savings" tone="blue" />
              <StatCard label="Mois d'avance encaissés" value={fmt(dash.encAvance)} icon="event_available" tone="blue" />
              <StatCard label="Charges encaissées" value={fmt(dash.encChargesRecues)} icon="receipt" tone="neutral" />
              <StatCard label="Autres recettes" value={fmt(dash.encAutres)} icon="add_circle" tone="neutral" />
            </div>
          </section>

          {/* Décaissements */}
          <section>
            <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-2">
              <Icon name="north_east" size={16} className="text-red-600" /> Décaissements
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="Travaux" value={fmt(dash.dec.travaux)} icon="construction" tone="red" />
              <StatCard label="Réparations" value={fmt(dash.dec.reparations)} icon="build" tone="red" />
              <StatCard label="Eau" value={fmt(dash.dec.eau)} icon="water_drop" tone="red" />
              <StatCard label="Électricité" value={fmt(dash.dec.electricite)} icon="bolt" tone="red" />
              <StatCard label="Commission MINSOUAH" value={fmt(dash.commissionMois)} icon="percent" tone="primary" />
              <StatCard label="Autres dépenses" value={fmt(dash.dec.autres)} icon="remove_circle" tone="red" />
            </div>
          </section>

          {/* Situation financière */}
          <section>
            <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-2">
              <Icon name="account_balance" size={16} className="text-primary" /> Situation financière
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Total encaissé" value={fmt(dash.totalEncaisse)} icon="account_balance_wallet" tone="green" />
              <StatCard label="Total des dépenses" value={fmt(dash.totalDepenses)} icon="money_off" tone="red" />
              <StatCard label="Solde disponible" value={fmt(dash.soldeDispo)} icon="savings" tone="primary" />
              <StatCard label="À reverser aux propriétaires" value={fmt(dash.aReverser)} icon="real_estate_agent" tone="amber" />
              <StatCard label="Déjà reversé" value={fmt(dash.dejaReverse)} icon="task_alt" tone="green" />
              <StatCard label="Reste à reverser" value={fmt(dash.resteReverser)} icon="pending_actions" tone="blue" />
            </div>
          </section>

          {/* Graphiques */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
            {/* Courbe mensuelle */}
            <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
              <div className="flex flex-wrap justify-between items-start gap-md mb-lg">
                <div>
                  <h3 className="font-h3 text-h3 text-on-surface">Revenus & dépenses mensuels</h3>
                  <p className="text-body-sm text-on-surface-variant mt-1">Exercice {curYear}</p>
                </div>
                <div className="flex flex-wrap gap-sm">
                  <div className="flex rounded-lg overflow-hidden border border-outline-variant">
                    <button onClick={() => setChartType('area')} className={`px-sm py-xs ${chartType === 'area' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}><Icon name="area_chart" size={16} /></button>
                    <button onClick={() => setChartType('bar')} className={`px-sm py-xs ${chartType === 'bar' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}><Icon name="bar_chart" size={16} /></button>
                  </div>
                  {['6 Mois', '12 Mois'].map((p) => (
                    <button key={p} onClick={() => setChartPeriod(p)} className={`px-sm py-xs border border-outline-variant rounded-lg text-label-sm ${chartPeriod === p ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant'}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'area' ? (
                    <AreaChart data={chartPeriod === '6 Mois' ? revenueData.slice(-6) : revenueData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradRev2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#785a00" stopOpacity={0.2} /><stop offset="95%" stopColor="#785a00" stopOpacity={0} /></linearGradient>
                        <linearGradient id="gradDep2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ba1a1a" stopOpacity={0.15} /><stop offset="95%" stopColor="#ba1a1a" stopOpacity={0} /></linearGradient>
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
            </div>

            {/* Répartition des encaissements */}
            <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
              <h3 className="font-h3 text-h3 text-on-surface mb-1">Répartition des encaissements</h3>
              <p className="text-body-sm text-on-surface-variant mb-2">{curMonthLabel}</p>
              <div className="h-64">
                {encaissePie.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-on-surface-variant text-sm">Aucun encaissement ce mois</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={encaissePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2}>
                        {encaissePie.map((e, i) => <Cell key={e.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="flex flex-col gap-1 mt-2">
                {encaissePie.map((e, i) => (
                  <div key={e.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{e.name}</span>
                    <span className="font-semibold">{fmt(e.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Comparatif annuel */}
          <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <h3 className="font-h3 text-h3 text-on-surface mb-1">Comparatif annuel</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Revenus vs dépenses — 4 derniers exercices</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={annualData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} width={42} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => v === 'revenus' ? 'Revenus' : 'Dépenses'} />
                  <Bar dataKey="revenus" fill="#785a00" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="depenses" fill="#ba1a1a" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Transactions */}
          <div id="finance-transactions" className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden scroll-mt-24">
            <div className="p-md border-b border-outline-variant/20 flex flex-wrap justify-between items-center gap-md">
              <h3 className="font-h3 text-h3 text-on-surface">Transactions récentes</h3>
              <div className="flex flex-wrap gap-sm items-center">
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                  {typeFilterOpts.map((opt) => (
                    <button key={opt} onClick={() => setTypeFilter(opt)} className={`px-sm py-xs rounded-full text-label-sm whitespace-nowrap ${typeFilter === opt ? 'bg-primary text-on-primary' : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant'}`}>{opt}</button>
                  ))}
                </div>
                <div className="relative">
                  <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
                  <input type="text" placeholder="Rechercher..." value={searchTx} onChange={(e) => setSearchTx(e.target.value)} className="pl-9 pr-md py-xs bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:outline-none focus:border-primary w-44" />
                </div>
                {canCreate && <Button icon="add_circle" size="sm" onClick={() => setExpenseModal(true)}>Dépense</Button>}
                <Button icon="picture_as_pdf" variant="secondary" size="sm" onClick={handleExportPDF}>PDF</Button>
                <Button icon="download" variant="secondary" size="sm" onClick={handleExportExcel}>Excel</Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary text-on-primary">
                  <tr>
                    <th className="px-md py-3 text-label-sm uppercase tracking-wider">Date</th>
                    <th className="px-md py-3 text-label-sm uppercase tracking-wider">Entité / Propriété</th>
                    <th className="px-md py-3 text-label-sm uppercase tracking-wider">Type</th>
                    <th className="px-md py-3 text-label-sm uppercase tracking-wider">Statut</th>
                    <th className="px-md py-3 text-label-sm uppercase tracking-wider text-right">Montant</th>
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
                          <span className="text-label-md text-on-surface">{tx.entity}</span>
                          <span className="text-body-sm text-outline">{tx.description}</span>
                        </div>
                      </td>
                      <td className="px-md py-4"><Badge label={tx.type} variant="type" /></td>
                      <td className="px-md py-4">
                        <div className="flex items-center gap-xs">
                          <div className={`w-2 h-2 rounded-full ${tx.status === 'En attente' ? 'bg-amber-500' : 'bg-green-500'}`} />
                          <span className={`text-label-sm ${tx.status === 'En attente' ? 'text-amber-700' : 'text-green-700'}`}>{tx.status}</span>
                        </div>
                      </td>
                      <td className={`px-md py-4 text-right font-label-md ${tx.positive ? 'text-green-700' : 'text-error'}`}>{tx.positive ? '+' : ''}{tx.amount.toLocaleString('fr-FR')} FCFA</td>
                      <td className="px-md py-4">
                        {isManual && canDelete && (
                          <button onClick={() => setDeleteTxTarget(tx)} className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-full flex items-center justify-center text-error hover:bg-error/10 transition-all" title="Supprimer"><Icon name="delete" size={14} /></button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {filteredTx.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-xl text-on-surface-variant">Aucune transaction trouvée</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-md py-3 bg-surface-container-low border-t border-outline-variant/20 text-body-sm text-on-surface-variant">
              {filteredTx.length} transaction(s) affichée(s) sur {effectiveTx.length}
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'dashboard' && (
        <div className="bg-surface-container-lowest rounded-xl p-xl shadow-card border border-outline-variant/20 flex flex-col items-center text-center gap-3 mt-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name={TABS.find(t => t.id === activeTab)?.icon || 'build'} size={30} className="text-primary" />
          </div>
          <h3 className="text-h3 font-h3 text-on-surface">{TABS.find(t => t.id === activeTab)?.label}</h3>
          {activeTab === 'bordereaux' && (
            <p className="text-body-sm text-on-surface-variant max-w-lg">
              Bordereau mensuel détaillé par propriétaire : appartement, locataire, loyer, arriérés, avances, cautions, charges puis déductions (commission, travaux, eau, électricité, gardiennage, taxes…) et <strong>NET À REVERSER</strong> automatique, avec états Brouillon → Vérifié → Validé → Reversé.
            </p>
          )}
          {activeTab === 'caisse' && (
            <p className="text-body-sm text-on-surface-variant max-w-lg">
              Registre des sommes réellement encaissées (date, référence, locataire, appartement, nature, mode de paiement, utilisateur) avec <strong>rapprochement de caisse</strong> automatique : totaux Espèces / Mobile Money / Virement / Chèque et validation de la caisse du jour par le comptable.
            </p>
          )}
          {activeTab === 'reversement' && (
            <p className="text-body-sm text-on-surface-variant max-w-lg">
              Suivi de tous les reversements propriétaires (période, total encaissé, déductions, net reversé, mode, référence bancaire, statut À préparer → Validé → Payé) avec génération automatique du reçu, du bordereau PDF, et envoi e-mail / WhatsApp.
            </p>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            <Icon name="engineering" size={14} /> En cours de construction — livré à la prochaine étape
          </span>
        </div>
      )}

      {/* Suppression transaction */}
      {deleteTxTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-modal w-full max-w-sm p-lg flex flex-col gap-md">
            <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto"><Icon name="warning" size={28} className="text-error" /></div>
            <div className="text-center">
              <h3 className="font-bold text-on-surface text-base mb-1">Supprimer la transaction ?</h3>
              <p className="text-sm text-on-surface-variant"><strong className="text-on-surface">{deleteTxTarget.description}</strong><br />{Math.abs(deleteTxTarget.amount).toLocaleString('fr-FR')} FCFA — {deleteTxTarget.date}</p>
              <p className="text-xs text-on-surface-variant mt-2">Cette action est irréversible.</p>
            </div>
            <div className="flex gap-sm">
              <Button variant="ghost" onClick={() => setDeleteTxTarget(null)}>Annuler</Button>
              <Button icon="delete" onClick={handleDeleteTx}>Supprimer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modale dépense */}
      {expenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-md">
          <div className="bg-surface-container-lowest rounded-2xl shadow-modal w-full max-w-md p-lg flex flex-col gap-md">
            <div className="flex items-center justify-between">
              <h2 className="font-h2 text-h2 text-on-surface">Enregistrer une dépense</h2>
              <button onClick={() => setExpenseModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant"><Icon name="close" size={20} /></button>
            </div>
            <div className="flex flex-col gap-sm">
              <label className="text-label-sm text-on-surface-variant">Date</label>
              <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary" />
              <label className="text-label-sm text-on-surface-variant">Bénéficiaire / Entité</label>
              <input type="text" placeholder="Ex : Entreprise Koné, SODECI, CIE..." value={expenseForm.entity} onChange={e => setExpenseForm(f => ({ ...f, entity: e.target.value }))} className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary" />
              <label className="text-label-sm text-on-surface-variant">Libellé *</label>
              <input type="text" placeholder="Description de la dépense..." value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary" />
              <label className="text-label-sm text-on-surface-variant">Catégorie</label>
              <select value={expenseForm.type} onChange={e => setExpenseForm(f => ({ ...f, type: e.target.value }))} className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary">
                {expenseTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label className="text-label-sm text-on-surface-variant">Montant (FCFA) *</label>
              <input type="number" min="0" placeholder="0" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} className="border border-outline-variant rounded-lg px-md py-xs bg-surface-container-low text-body-sm focus:outline-none focus:border-primary" />
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
ents/ui/Button';
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
  // Strict org isolation for financial reports — only the active org's rows
  const myOrgId = state.currentUser?.orgId || null;
  const transactions = useMemo(() => (myOrgId ? (state.transactions || []).filter(t => t.orgId === myOrgId) : (state.transactions || [])), [state.transactions, myOrgId]);
  const payments = useMemo(() => (myOrgId ? (state.payments || []).filter(p => p.orgId === myOrgId) : (state.payments || [])), [state.payments, myOrgId]);
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
            onClick={() => document.getElementById('finance-transactions')?.scrollIntoView({ behavior: 'smooth' })}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('finance-transactions')?.scrollIntoView({ behavior: 'smooth' }); } }}
            className={`p-md rounded-xl shadow-card border border-outline-variant/20 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
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
      <div id="finance-transactions" className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden scroll-mt-24">
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
