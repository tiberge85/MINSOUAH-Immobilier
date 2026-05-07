import { useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';

const typeFilterOpts = ['Tous', 'Loyer', 'Réparations', 'Taxes'];

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

export default function Finance() {
  const { state } = useApp();
  const { transactions, revenueData } = state;
  const [chartType, setChartType] = useState('area');
  const [chartPeriod, setChartPeriod] = useState('12 Mois');
  const [typeFilter, setTypeFilter] = useState('Tous');
  const [searchTx, setSearchTx] = useState('');

  const filteredTx = transactions.filter((t) => {
    const matchType = typeFilter === 'Tous' || t.type === typeFilter;
    const matchSearch =
      t.entity.toLowerCase().includes(searchTx.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTx.toLowerCase());
    return matchType && matchSearch;
  });

  const totalRevenues = transactions.filter((t) => t.positive).reduce((s, t) => s + t.amount, 0);
  const totalDepenses = transactions.filter((t) => !t.positive).reduce((s, t) => s + Math.abs(t.amount), 0);
  const cashFlow = totalRevenues - totalDepenses;

  const kpis = [
    {
      label: 'Revenus Totaux',
      value: `${totalRevenues.toLocaleString('fr-FR')} FCFA`,
      sub: `${transactions.filter((t) => t.positive).length} transaction(s) créditrice(s)`,
      subColor: 'text-green-600',
      icon: 'trending_up',
      iconBg: 'bg-primary/10 text-primary',
    },
    {
      label: 'Dépenses',
      value: `${totalDepenses.toLocaleString('fr-FR')} FCFA`,
      sub: `${transactions.filter((t) => !t.positive).length} transaction(s) débitrice(s)`,
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

  return (
    <div className="px-margin pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

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
            <p className="text-body-sm text-on-surface-variant mt-1">Performance — Exercice Fiscal 2024</p>
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
            <Button icon="picture_as_pdf" variant="secondary" size="sm">
              Export PDF
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
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredTx.map((tx) => (
                <tr key={tx.id} className="hover:bg-surface-container-low transition-colors">
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
                </tr>
              ))}
              {filteredTx.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-xl text-on-surface-variant">Aucune transaction trouvée</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-md py-4 flex items-center justify-between bg-surface-container-low border-t border-outline-variant/20">
          <span className="text-body-sm text-on-surface-variant">
            {filteredTx.length} transaction(s) affichée(s) sur {transactions.length}
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
    </div>
  );
}
