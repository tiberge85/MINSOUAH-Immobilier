import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';

const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const fmtK = (n) => `${(Number(n || 0) / 1000).toFixed(0)}k`;

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-sm shadow-modal text-body-sm">
      <p className="font-label-md text-on-surface mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtK(p.value)}k FCFA
        </p>
      ))}
    </div>
  );
};

function KpiCard({ label, value, sub, subIcon, subColor, icon, iconBg }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-start justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-on-surface-variant text-label-sm font-label-sm uppercase tracking-wider mb-base truncate">
          {label}
        </p>
        <h3 className="font-h1 text-h1 text-on-surface font-bold truncate">{value}</h3>
        <p className={`text-label-sm font-label-sm mt-2 flex items-center gap-1 ${subColor}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{subIcon}</span>
          {sub}
        </p>
      </div>
      <div className={`p-3 rounded-lg flex-shrink-0 ml-2 ${iconBg}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
    </div>
  );
}

// Parse a payment's date into { month (0-11), year }
function paymentMonth(p) {
  // Try ISO createdAt first (most reliable for new data)
  if (p.createdAt) {
    try { const d = new Date(p.createdAt); if (!isNaN(d.getTime())) return { m: d.getMonth(), y: d.getFullYear() }; } catch {}
  }
  // dueDate "dd/mm/yyyy"
  if (p.dueDate) {
    const pts = String(p.dueDate).split('/');
    if (pts.length === 3) {
      const m = parseInt(pts[1], 10) - 1; const y = parseInt(pts[2], 10);
      if (!isNaN(m) && !isNaN(y)) return { m, y };
    }
  }
  // month string: "Janvier 2025", "Jan 2025", "01/2025"
  if (p.month) {
    const s = String(p.month).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const MONTHS = ['jan', 'fev', 'mar', 'avr', 'mai', 'jun', 'jul', 'aou', 'sep', 'oct', 'nov', 'dec'];
    for (let i = 0; i < MONTHS.length; i++) {
      if (s.includes(MONTHS[i])) {
        const yr = s.match(/\d{4}/); return { m: i, y: yr ? parseInt(yr[0], 10) : new Date().getFullYear() };
      }
    }
    // "01/2025" format
    const slash = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (slash) return { m: parseInt(slash[1], 10) - 1, y: parseInt(slash[2], 10) };
  }
  return null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { state } = useApp();
  const {
    contracts = [],
    tickets = [],
    properties = [],
    tenants = [],
    owners = [],
    payments = [],
  } = state;

  // Compute monthly revenue chart data from real payments
  const revenueData = useMemo(() => {
    const LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const year = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    return LABELS.map((mois, idx) => {
      if (idx > currentMonth) return null; // don't show future months
      const month = payments.filter((p) => { const pm = paymentMonth(p); return pm && pm.m === idx && pm.y === year; });
      const revenus = month.filter((p) => p.status === 'Payé').reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const attendu  = month.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const impayés  = month.filter((p) => p.status !== 'Payé').reduce((s, p) => s + (Number(p.amount) || 0), 0);
      return { mois, revenus, attendu, depenses: impayés };
    }).filter(Boolean);
  }, [payments]);

  // Auto-generate alerts from live data (replaces static state.alerts)
  const alerts = [
    ...payments
      .filter(p => p.status === 'Impayé' || p.status === 'En retard')
      .slice(0, 4)
      .map(p => ({
        id: `pay-${p.id}`,
        message: `Loyer impayé — ${p.tenantName || p.tenant} (${p.month})`,
        time: p.month || '',
        icon: 'payments',
        color: 'bg-error/10 text-error',
      })),
    ...contracts
      .filter(c => {
        if (c.status !== 'Actif' || !c.endDate || c.endDate === '—') return false;
        try {
          const [d, m, y] = c.endDate.split('/');
          const diff = (new Date(y, m - 1, d) - Date.now()) / 86400000;
          return diff >= 0 && diff <= 30;
        } catch { return false; }
      })
      .slice(0, 3)
      .map(c => ({
        id: `cont-${c.id}`,
        message: `Contrat expirant bientôt — ${c.tenant}`,
        time: `Expire le ${c.endDate}`,
        icon: 'contract',
        color: 'bg-amber-100 text-amber-700',
      })),
    ...tickets
      .filter(t => t.priority === 'Urgent' && t.status !== 'Fermé' && t.status !== 'Résolu')
      .slice(0, 3)
      .map(t => ({
        id: `tick-${t.id}`,
        message: `Ticket urgent — ${t.title}`,
        time: t.reportedAt || '',
        icon: 'engineering',
        color: 'bg-error/10 text-error',
      })),
  ];
  const [chartPeriod, setChartPeriod] = useState('Mensuel');

  const activeContracts = contracts.filter((c) => c.status === 'Actif').length;
  const expiringSoon = contracts.filter(c => {
    if (c.status !== 'Actif' || !c.endDate || c.endDate === '—') return false;
    try {
      const [d, m, y] = c.endDate.split('/');
      const end = new Date(y, m - 1, d);
      const diff = (end - Date.now()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 60;
    } catch { return false; }
  }).length;

  const occupancyRate = properties.length > 0
    ? Math.round((activeContracts / properties.length) * 100)
    : 0;
  const monthlyRevenue = contracts.filter((c) => c.status === 'Actif').reduce((sum, c) => sum + (c.rent || 0), 0);

  const paidPayments = payments.filter(p => p.status === 'Payé');
  const unpaidPayments = payments.filter(p => p.status !== 'Payé');
  const unpaidAmount = unpaidPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCollected = paidPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const recoveryRate = payments.length > 0
    ? Math.round((paidPayments.length / payments.length) * 100)
    : 100;

  const pendingTickets = tickets.filter((t) => t.status === 'En attente').length;
  const urgentTickets = tickets.filter((t) => t.priority === 'Urgent').length;

  const kpiCards = [
    {
      label: 'Total Propriétés',
      value: properties.length,
      sub: `${activeContracts} contrats actifs`,
      subIcon: 'apartment', subColor: 'text-primary',
      icon: 'apartment', iconBg: 'bg-primary/10 text-primary',
    },
    {
      label: 'Locataires',
      value: tenants.length,
      sub: `${tenants.filter(t => t.status === 'Actif' || !t.status).length} actifs`,
      subIcon: 'person', subColor: 'text-tertiary',
      icon: 'group', iconBg: 'bg-tertiary/10 text-tertiary',
    },
    {
      label: 'Propriétaires',
      value: owners.length,
      sub: `${owners.filter(o => o.status === 'Actif' || !o.status).length} actifs`,
      subIcon: 'manage_accounts', subColor: 'text-tertiary',
      icon: 'manage_accounts', iconBg: 'bg-tertiary/10 text-tertiary',
    },
    {
      label: "Taux d'Occupation",
      value: `${occupancyRate}%`,
      sub: `${expiringSoon} bail(s) expirent ≤60j`,
      subIcon: expiringSoon > 0 ? 'warning' : 'trending_up',
      subColor: expiringSoon > 0 ? 'text-amber-600' : 'text-green-600',
      icon: 'donut_large', iconBg: 'bg-primary/10 text-primary',
    },
    {
      label: 'Revenu Mensuel',
      value: `${fmtK(monthlyRevenue)}k FCFA`,
      sub: 'Contrats actifs cumulés',
      subIcon: 'trending_up', subColor: 'text-green-600',
      icon: 'payments', iconBg: 'bg-green-100 text-green-700',
    },
    {
      label: 'Total Encaissé',
      value: `${fmtK(totalCollected)}k FCFA`,
      sub: `Taux recouvrement ${recoveryRate}%`,
      subIcon: recoveryRate >= 80 ? 'check_circle' : 'warning',
      subColor: recoveryRate >= 80 ? 'text-green-600' : 'text-amber-600',
      icon: 'account_balance_wallet', iconBg: 'bg-green-100 text-green-700',
    },
    {
      label: 'Impayés',
      value: `${fmtK(unpaidAmount)}k FCFA`,
      sub: `${unpaidPayments.length} paiement(s) en retard`,
      subIcon: unpaidAmount > 0 ? 'error' : 'check_circle',
      subColor: unpaidAmount > 0 ? 'text-error' : 'text-green-600',
      icon: 'warning', iconBg: unpaidAmount > 0 ? 'bg-error/10 text-error' : 'bg-green-100 text-green-700',
    },
    {
      label: 'Tickets Maintenance',
      value: pendingTickets,
      sub: `${urgentTickets} urgente(s)`,
      subIcon: urgentTickets > 0 ? 'emergency' : 'check_circle',
      subColor: urgentTickets > 0 ? 'text-error' : 'text-green-600',
      icon: 'engineering', iconBg: 'bg-error/10 text-error',
    },
  ];

  /* Occupancy pie */
  const occupancyPie = [
    { name: 'Occupés', value: activeContracts, color: '#785a00' },
    { name: 'Libres', value: Math.max(0, properties.length - activeContracts), color: '#d2c5ae' },
  ].filter(d => d.value > 0);

  /* Payment recovery pie */
  const recoveryPie = [
    { name: 'Payés', value: paidPayments.length, color: '#4CAF50' },
    { name: 'Impayés', value: unpaidPayments.length, color: '#ba1a1a' },
  ].filter(d => d.value > 0);

  const recentContracts = contracts.slice(0, 5);

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl flex flex-col gap-gutter max-w-7xl mx-auto">

      {/* Quick actions */}
      <div className="flex flex-wrap gap-sm">
        <Button icon="add_home" onClick={() => navigate('/assets')}>
          Nouveau Bien
        </Button>
        <Button icon="note_add" variant="secondary" onClick={() => navigate('/rental')}>
          Nouveau Contrat
        </Button>
        <Button icon="payments" variant="secondary" onClick={() => navigate('/payments')}>
          Enregistrer Paiement
        </Button>
        <Button icon="engineering" variant="secondary" onClick={() => navigate('/maintenance')}>
          Ticket Maintenance
        </Button>
      </div>

      {/* KPI cards — 4 per row */}
      <section className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </section>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        {/* Revenue area chart */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex flex-col">
          <div className="flex flex-wrap justify-between items-center mb-lg gap-sm">
            <div>
              <h3 className="font-h3 text-h3 text-on-surface">Évolution des Revenus</h3>
              <p className="text-body-sm text-on-surface-variant">Performance financière {new Date().getFullYear()}</p>
            </div>
            <div className="flex gap-2">
              {['7 Jours', 'Mensuel', 'Annuel'].map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`px-3 py-1 text-label-sm rounded-full transition-colors ${
                    chartPeriod === p
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRevenu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#785a00" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#785a00" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDepense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#006399" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#006399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={42} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="revenus" name="revenus" stroke="#785a00" strokeWidth={2.5} fill="url(#gradRevenu)" dot={false} activeDot={{ r: 4, fill: '#785a00' }} />
                <Area type="monotone" dataKey="depenses" name="dépenses" stroke="#006399" strokeWidth={2} fill="url(#gradDepense)" dot={false} activeDot={{ r: 4, fill: '#006399' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-lg mt-sm pt-sm border-t border-outline-variant/20">
            <div className="flex items-center gap-xs">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-label-sm text-on-surface-variant">Revenus</span>
            </div>
            <div className="flex items-center gap-xs">
              <div className="w-3 h-3 rounded-full bg-tertiary" />
              <span className="text-label-sm text-on-surface-variant">Dépenses</span>
            </div>
          </div>
        </div>

        {/* Alerts panel */}
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex flex-col">
          <h3 className="font-h3 text-h3 text-on-surface mb-lg flex items-center gap-2">
            <Icon name="campaign" className="text-error" />
            Alertes Urgentes
          </h3>
          <div className="flex flex-col gap-sm overflow-y-auto custom-scrollbar flex-1">
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <Icon name="check_circle" size={32} className="opacity-30 mb-2 text-green-600" />
                <p className="text-body-sm">Aucune alerte urgente</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-sm p-sm rounded-xl bg-surface-container border border-outline-variant/20 hover:bg-surface-container-high transition-colors cursor-pointer"
                >
                  <div className={`p-2 rounded-lg flex-shrink-0 ${alert.color}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{alert.icon}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm text-on-surface font-medium leading-snug">{alert.message}</p>
                    <p className="text-label-sm text-on-surface-variant mt-0.5">{alert.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <Button variant="ghost" className="mt-md w-full justify-center text-primary" onClick={() => navigate('/maintenance')}>
            Voir tout
          </Button>
        </div>
      </div>

      {/* Pie charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
        {/* Occupancy pie */}
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface mb-1">Taux d'Occupation</h3>
          <p className="text-body-sm text-on-surface-variant mb-sm">{properties.length} biens au total</p>
          {properties.length === 0 ? (
            <div className="text-center py-10 text-on-surface-variant">
              <Icon name="apartment" size={40} className="opacity-30 mb-2" />
              <p>Aucun bien enregistré</p>
            </div>
          ) : (
            <div className="flex items-center gap-md">
              <div className="h-36 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={occupancyPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {occupancyPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} bien(s)`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3">
                {occupancyPie.map(e => (
                  <div key={e.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.color }} />
                    <div>
                      <p className="text-label-md font-bold text-on-surface">{e.value}</p>
                      <p className="text-label-sm text-on-surface-variant">{e.name}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-1 pt-2 border-t border-outline-variant/20">
                  <p className="font-black text-h2 text-primary">{occupancyRate}%</p>
                  <p className="text-label-sm text-on-surface-variant">occupation</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recovery pie */}
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface mb-1">Recouvrement des Loyers</h3>
          <p className="text-body-sm text-on-surface-variant mb-sm">{payments.length} paiements au total</p>
          {payments.length === 0 ? (
            <div className="text-center py-10 text-on-surface-variant">
              <Icon name="payments" size={40} className="opacity-30 mb-2" />
              <p>Aucun paiement enregistré</p>
            </div>
          ) : (
            <div className="flex items-center gap-md">
              <div className="h-36 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={recoveryPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                      {recoveryPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} paiement(s)`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-3">
                {recoveryPie.map(e => (
                  <div key={e.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.color }} />
                    <div>
                      <p className="text-label-md font-bold text-on-surface">{e.value}</p>
                      <p className="text-label-sm text-on-surface-variant">{e.name}</p>
                    </div>
                  </div>
                ))}
                <div className="mt-1 pt-2 border-t border-outline-variant/20">
                  <p className={`font-black text-h2 ${recoveryRate >= 80 ? 'text-green-600' : 'text-error'}`}>{recoveryRate}%</p>
                  <p className="text-label-sm text-on-surface-variant">recouvrement</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent contracts */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        <div className="px-md py-md flex items-center justify-between border-b border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface">Contrats Récents</h3>
          <Button variant="ghost" className="text-primary" onClick={() => navigate('/rental')}>
            Voir tout <Icon name="chevron_right" size={18} />
          </Button>
        </div>
        {recentContracts.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant">
            <Icon name="contract" size={40} className="opacity-30 mb-2" />
            <p>Aucun contrat</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-secondary text-on-primary">
                <tr>
                  <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Propriété</th>
                  <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Locataire</th>
                  <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider text-right">Loyer</th>
                  <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Fin</th>
                  <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {recentContracts.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-md py-4">
                      <div className="flex items-center gap-sm">
                        <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0">
                          <Icon name={c.propertyIcon || 'apartment'} className="text-primary" size={18} />
                        </div>
                        <div>
                          <p className="text-label-md font-label-md text-on-surface">{c.propertyName}</p>
                          <p className="text-body-sm text-on-surface-variant">{c.propertyType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-md py-4 text-body-md text-on-surface">{c.tenant}</td>
                    <td className="px-md py-4 text-label-md font-label-md text-right text-primary">
                      {(c.rent || 0).toLocaleString('fr-CI')} FCFA/mois
                    </td>
                    <td className="px-md py-4 text-body-sm text-on-surface-variant">{c.endDate || '—'}</td>
                    <td className="px-md py-4">
                      <Badge label={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Urgent tickets */}
      {tickets.filter((t) => t.priority === 'Urgent').length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
          <div className="px-md py-md flex items-center justify-between border-b border-outline-variant/20">
            <h3 className="font-h3 text-h3 text-on-surface flex items-center gap-2">
              <Icon name="emergency" className="text-error" />
              Tickets Urgents
            </h3>
            <Button variant="ghost" className="text-primary" onClick={() => navigate('/maintenance')}>
              Voir tout <Icon name="chevron_right" size={18} />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md p-md">
            {tickets.filter((t) => t.priority === 'Urgent').slice(0, 3).map((ticket) => (
              <div
                key={ticket.id}
                className="border-l-4 border-error bg-error-container/10 rounded-xl p-md flex flex-col gap-xs hover:bg-error-container/20 transition-colors cursor-pointer"
                onClick={() => navigate('/maintenance')}
              >
                <div className="flex justify-between items-start">
                  <Badge label={ticket.priority} />
                  <span className="text-label-sm text-on-surface-variant">{ticket.id}</span>
                </div>
                <h4 className="font-h3 text-h3 text-on-surface">{ticket.title}</h4>
                <p className="text-body-sm text-on-surface-variant line-clamp-2">{ticket.description}</p>
                <div className="flex items-center gap-xs text-on-surface-variant text-body-sm mt-1">
                  <Icon name="apartment" size={16} />
                  <span>{ticket.property}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
