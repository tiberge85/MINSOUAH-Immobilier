import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';

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

export default function Dashboard() {
  const navigate = useNavigate();
  const { state } = useApp();
  const { revenueData, alerts, contracts, tickets, properties } = state;
  const [chartPeriod, setChartPeriod] = useState('Mensuel');
  const recentContracts = contracts.slice(0, 4);

  const activeContracts = contracts.filter((c) => c.status === 'Actif').length;
  const occupancyRate = properties.length > 0
    ? Math.round((activeContracts / properties.length) * 100)
    : 0;
  const monthlyRevenue = contracts
    .filter((c) => c.status === 'Actif')
    .reduce((sum, c) => sum + (c.rent || 0), 0);
  const pendingTickets = tickets.filter((t) => t.status === 'En attente').length;
  const urgentTickets = tickets.filter((t) => t.priority === 'Urgent').length;

  const kpiCards = [
    {
      label: 'Total Propriétés',
      value: properties.length.toString(),
      sub: `${activeContracts} contrats actifs`,
      subIcon: 'trending_up',
      subColor: 'text-green-600',
      icon: 'apartment',
      iconBg: 'bg-primary/10 text-primary',
    },
    {
      label: "Taux d'Occupation",
      value: `${occupancyRate}%`,
      sub: 'Basé sur les contrats actifs',
      subIcon: 'trending_up',
      subColor: 'text-green-600',
      icon: 'group',
      iconBg: 'bg-tertiary/10 text-tertiary',
    },
    {
      label: 'Revenu Mensuel',
      value: `${(monthlyRevenue / 1000).toFixed(0)}k FCFA`,
      sub: 'Contrats actifs cumulés',
      subIcon: 'trending_up',
      subColor: 'text-green-600',
      icon: 'payments',
      iconBg: 'bg-primary/10 text-primary',
    },
    {
      label: 'Requêtes En Attente',
      value: pendingTickets.toString(),
      sub: `${urgentTickets} urgente(s)`,
      subIcon: 'warning',
      subColor: 'text-error',
      icon: 'assignment_late',
      iconBg: 'bg-error/10 text-error',
    },
  ];

  return (
    <div className="px-margin pt-gutter pb-xl flex flex-col gap-gutter max-w-7xl mx-auto">

      {/* Quick actions */}
      <div className="flex flex-wrap gap-sm">
        <Button icon="add_home" onClick={() => navigate('/assets')}>
          Nouveau Bien
        </Button>
        <Button icon="note_add" variant="secondary" onClick={() => navigate('/rental')}>
          Nouveau Contrat
        </Button>
        <Button icon="engineering" variant="secondary" onClick={() => navigate('/maintenance')}>
          Ticket Maintenance
        </Button>
      </div>

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-start justify-between"
          >
            <div>
              <p className="text-on-surface-variant text-label-sm font-label-sm uppercase tracking-wider mb-base">
                {card.label}
              </p>
              <h3 className="font-h1 text-h1 text-on-surface font-bold">{card.value}</h3>
              <p className={`text-label-sm font-label-sm mt-2 flex items-center gap-1 ${card.subColor}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{card.subIcon}</span>
                {card.sub}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${card.iconBg}`}>
              <span className="material-symbols-outlined">{card.icon}</span>
            </div>
          </div>
        ))}
      </section>

      {/* Chart + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
        {/* Revenue chart */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex flex-col">
          <div className="flex flex-wrap justify-between items-center mb-lg gap-sm">
            <div>
              <h3 className="font-h3 text-h3 text-on-surface">Évolution des Revenus</h3>
              <p className="text-body-sm text-on-surface-variant">Performance Exercice 2024</p>
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

          <div className="flex-1 min-h-[240px]">
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
                <XAxis
                  dataKey="mois"
                  tick={{ fill: '#817662', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#817662', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  width={42}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="revenus"
                  stroke="#785a00"
                  strokeWidth={2.5}
                  fill="url(#gradRevenu)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#785a00' }}
                />
                <Area
                  type="monotone"
                  dataKey="depenses"
                  stroke="#006399"
                  strokeWidth={2}
                  fill="url(#gradDepense)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#006399' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
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

        {/* Urgent alerts */}
        <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex flex-col">
          <h3 className="font-h3 text-h3 text-on-surface mb-lg flex items-center gap-2">
            <Icon name="campaign" className="text-error" />
            Alertes Urgentes
          </h3>
          <div className="flex flex-col gap-sm overflow-y-auto custom-scrollbar flex-1">
            {alerts.map((alert) => (
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
            ))}
          </div>
          <Button variant="ghost" className="mt-md w-full justify-center text-primary" onClick={() => navigate('/maintenance')}>
            Voir tout
          </Button>
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
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary text-on-primary">
              <tr>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Propriété</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Locataire</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider text-right">Loyer</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {recentContracts.map((c) => (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                  <td className="px-md py-4">
                    <div className="flex items-center gap-sm">
                      <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center">
                        <Icon name={c.propertyIcon} className="text-primary" size={18} />
                      </div>
                      <div>
                        <p className="text-label-md font-label-md text-on-surface">{c.propertyName}</p>
                        <p className="text-body-sm text-on-surface-variant">{c.propertyType}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-md py-4 text-body-md text-on-surface">{c.tenant}</td>
                  <td className="px-md py-4 text-label-md font-label-md text-right text-primary">
                    {c.rent.toLocaleString('fr-FR')} FCFA/mois
                  </td>
                  <td className="px-md py-4">
                    <Badge label={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maintenance preview */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        <div className="px-md py-md flex items-center justify-between border-b border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface">Tickets Urgents</h3>
          <Button variant="ghost" className="text-primary" onClick={() => navigate('/maintenance')}>
            Voir tout <Icon name="chevron_right" size={18} />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md p-md">
          {tickets.filter((t) => t.priority === 'Urgent').map((ticket) => (
            <div
              key={ticket.id}
              className="border-l-4 border-error bg-error-container/10 rounded-xl p-md flex flex-col gap-xs hover:bg-error-container/20 transition-colors cursor-pointer"
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
    </div>
  );
}
