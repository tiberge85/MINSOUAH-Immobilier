import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import Badge from '../components/ui/Badge';
import Icon from '../components/Icon';

const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const fmtK = (n) => `${(Number(n || 0) / 1000).toFixed(0)}k`;

function parsePaidDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0]), m = parseInt(parts[1]) - 1, y = parseInt(parts[2]);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return { month: m, year: y };
  }
  return null;
}

const CHART_COLORS = ['#785a00', '#006399', '#4CAF50', '#FF6B35', '#9C27B0'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-sm shadow-modal text-body-sm">
      <p className="font-label-md text-on-surface mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtK(p.value)} FCFA
        </p>
      ))}
    </div>
  );
};

function KpiCard({ label, value, sub, icon, color }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-sm ${color}`}>
        <Icon name={icon} size={18} />
      </div>
      <p className="text-on-surface-variant text-label-sm uppercase tracking-wider">{label}</p>
      <p className="font-h2 text-h2 text-on-surface font-black mt-0.5 truncate">{value}</p>
      {sub && <p className="text-label-sm text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  );
}

export default function OwnerPortal() {
  const { state } = useApp();
  const {
    owners = [],
    properties = [],
    contracts = [],
    payments = [],
    tickets = [],
    inspections = [],
  } = state;
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const owner = owners.find(o => o.id === selectedId);

  const ownerProperties = useMemo(() =>
    owner ? properties.filter(p => p.owner === owner.name) : [],
    [owner, properties]
  );

  const ownerContracts = useMemo(() =>
    ownerProperties.length
      ? contracts.filter(c => ownerProperties.some(p => p.name === c.propertyName))
      : [],
    [ownerProperties, contracts]
  );

  const ownerPayments = useMemo(() => {
    if (!ownerContracts.length && !ownerProperties.length) return [];
    const contractIds = new Set(ownerContracts.map(c => c.id));
    const propNames   = new Set(ownerProperties.map(p => p.name));
    const tenantIds   = new Set(ownerContracts.map(c => c.tenantId).filter(Boolean));
    return payments.filter(p =>
      (p.contractId  && contractIds.has(p.contractId))  ||
      (p.propertyName && propNames.has(p.propertyName)) ||
      (p.tenantId    && tenantIds.has(p.tenantId))
    );
  }, [ownerContracts, ownerProperties, payments]);

  const ownerTickets = useMemo(() =>
    ownerProperties.length
      ? tickets.filter(t => ownerProperties.some(p => p.name === t.property))
      : [],
    [ownerProperties, tickets]
  );

  const ownerInspections = useMemo(() =>
    ownerProperties.length
      ? (inspections || []).filter(i => ownerProperties.some(p => p.id === i.propertyId || p.name === i.propertyName))
      : [],
    [ownerProperties, inspections]
  );

  /* ─── Analytics data ─────────────────────────────────────────── */
  const monthlyRevData = useMemo(() => {
    const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const curYear = new Date().getFullYear();
    return MONTHS.map((mois, i) => ({
      mois,
      revenus: ownerPayments
        .filter(p => {
          if (p.status !== 'Payé') return false;
          const parsed = parsePaidDate(p.paidDate);
          return parsed && parsed.month === i && parsed.year === curYear;
        })
        .reduce((s, p) => s + (p.amount || 0), 0),
      impayés: ownerPayments
        .filter(p => {
          if (p.status === 'Payé') return false;
          const parsed = parsePaidDate(p.dueDate) || parsePaidDate(p.paidDate);
          return parsed && parsed.month === i && parsed.year === curYear;
        })
        .reduce((s, p) => s + (p.amount || 0), 0),
    }));
  }, [ownerPayments]);

  const occupancyData = useMemo(() => {
    const loué = ownerProperties.filter(p => p.status === 'Loué' || ownerContracts.some(c => c.propertyName === p.name && c.status === 'Actif')).length;
    const libre = ownerProperties.length - loué;
    return [
      { name: 'Occupés', value: loué, color: '#785a00' },
      { name: 'Libres', value: libre, color: '#d2c5ae' },
    ].filter(d => d.value > 0);
  }, [ownerProperties, ownerContracts]);

  /* ─── KPIs ─────────────────────────────────────────────────────── */
  const totalRevenue = ownerContracts.filter(c => c.status === 'Actif').reduce((s, c) => s + (c.rent || 0), 0);
  const collectedTotal = ownerPayments.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount = ownerPayments.filter(p => p.status !== 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const activeContractsCount = ownerContracts.filter(c => c.status === 'Actif').length;
  const occupancyRate = ownerProperties.length > 0
    ? Math.round((activeContractsCount / ownerProperties.length) * 100)
    : 0;
  const openTickets = ownerTickets.filter(t => t.status !== 'Résolu').length;

  /* ─── Owner selector ─────────────────────────────────────────── */
  if (!selectedId) {
    return (
      <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-5xl mx-auto">
        <div className="flex items-center gap-md mb-lg">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container border border-outline-variant text-on-surface-variant transition-colors"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div>
            <h1 className="font-h2 text-h2 text-on-surface font-bold">Portail Propriétaires</h1>
            <p className="text-body-sm text-on-surface-variant">Tableau de bord analytique par propriétaire</p>
          </div>
        </div>

        {owners.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <Icon name="manage_accounts" size={48} className="opacity-30 mb-sm" />
            <p className="font-bold">Aucun propriétaire enregistré</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {owners.map(o => {
              const ownedProps = properties.filter(p => p.owner === o.name);
              const ownedContracts = contracts.filter(c => ownedProps.some(p => p.name === c.propertyName) && c.status === 'Actif');
              const rev = ownedContracts.reduce((s, c) => s + (c.rent || 0), 0);
              const pending = payments.filter(p =>
                ownedContracts.some(c => c.id === p.contractId) && p.status !== 'Payé'
              ).length;
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 hover:border-primary/40 hover:shadow-modal transition-all text-left group"
                >
                  <div className="flex items-center gap-md mb-md">
                    {o.avatar
                      ? <img src={o.avatar} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                      : <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${o.color || 'bg-primary-container text-on-primary-container'}`}>{o.initials || o.name?.[0]}</div>
                    }
                    <div className="min-w-0">
                      <h3 className="font-label-md text-label-md text-on-surface font-bold truncate">{o.name}</h3>
                      <p className="text-body-sm text-on-surface-variant">{ownedProps.length} bien(s) — {ownedContracts.length} contrat(s) actif(s)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-md">
                    <div className="bg-primary/5 rounded-lg p-2 text-center">
                      <p className="font-black text-primary">{fmtK(rev)}</p>
                      <p className="text-label-sm text-on-surface-variant">FCFA/mois</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${pending > 0 ? 'bg-error/5' : 'bg-green-50'}`}>
                      <p className={`font-black ${pending > 0 ? 'text-error' : 'text-green-700'}`}>{pending}</p>
                      <p className="text-label-sm text-on-surface-variant">impayé(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-sm border-t border-outline-variant/20">
                    <span className="text-label-sm text-on-surface-variant">{o.email || '—'}</span>
                    <Badge label={o.status || 'Actif'} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ─── Owner dashboard ─────────────────────────────────────────── */
  const TABS = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: 'dashboard' },
    { id: 'properties', label: 'Biens', icon: 'apartment' },
    { id: 'finance', label: 'Finances', icon: 'trending_up' },
    { id: 'maintenance', label: 'Maintenance', icon: 'engineering' },
    { id: 'edl', label: 'États des lieux', icon: 'home_work' },
  ];

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-6xl mx-auto flex flex-col gap-gutter">
      {/* Header */}
      <div className="flex items-center gap-md flex-wrap">
        <button
          onClick={() => setSelectedId(null)}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container border border-outline-variant text-on-surface-variant transition-colors"
        >
          <Icon name="arrow_back" size={18} />
        </button>
        {owner.avatar
          ? <img src={owner.avatar} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          : <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${owner.color || 'bg-primary-container text-on-primary-container'}`}>{owner.initials || owner.name?.[0]}</div>
        }
        <div className="flex-1 min-w-0">
          <h1 className="font-h2 text-h2 text-on-surface font-bold truncate">{owner.name}</h1>
          <p className="text-body-sm text-on-surface-variant">{ownerProperties.length} bien(s) — Taux d'occupation {occupancyRate}%</p>
        </div>
        <Badge label={owner.status || 'Actif'} className="ml-auto" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-md">
        <KpiCard label="Biens" value={ownerProperties.length} icon="apartment" color="bg-primary/10 text-primary" />
        <KpiCard label="Occupation" value={`${occupancyRate}%`} sub={`${activeContractsCount} loués`} icon="group" color="bg-tertiary/10 text-tertiary" />
        <KpiCard label="Revenu/mois" value={fmtK(totalRevenue) + 'k'} icon="trending_up" color="bg-green-100 text-green-700" />
        <KpiCard label="Total encaissé" value={fmtK(collectedTotal) + 'k'} icon="check_circle" color="bg-primary/10 text-primary" />
        <KpiCard label="Impayés" value={fmt(pendingAmount)} icon="warning" color={pendingAmount > 0 ? 'bg-error/10 text-error' : 'bg-green-100 text-green-700'} />
        <KpiCard label="Tickets ouverts" value={openTickets} icon="engineering" color={openTickets > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-container rounded-xl p-1 w-full overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap py-2 px-4 rounded-lg text-label-sm font-bold transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-surface-container-lowest shadow-sm text-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Icon name={tab.icon} size={16} filled={activeTab === tab.id} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          {/* Monthly revenue bar chart */}
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <h3 className="font-h3 text-h3 text-on-surface mb-1">Revenus Mensuels</h3>
            <p className="text-body-sm text-on-surface-variant mb-lg">Encaissements sur 12 mois</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenus" name="Revenus" fill="#785a00" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="impayés" name="Impayés" fill="#ba1a1a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-lg mt-sm pt-sm border-t border-outline-variant/20">
              <div className="flex items-center gap-xs">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-label-sm text-on-surface-variant">Encaissé</span>
              </div>
              <div className="flex items-center gap-xs">
                <div className="w-3 h-3 rounded-full bg-error" />
                <span className="text-label-sm text-on-surface-variant">Impayés</span>
              </div>
            </div>
          </div>

          {/* Occupancy pie chart */}
          <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex flex-col">
            <h3 className="font-h3 text-h3 text-on-surface mb-1">Taux d'Occupation</h3>
            <p className="text-body-sm text-on-surface-variant mb-sm">{ownerProperties.length} biens au total</p>
            <div className="flex-1 flex items-center justify-center min-h-[180px]">
              {ownerProperties.length === 0 ? (
                <div className="text-center text-on-surface-variant">
                  <Icon name="apartment" size={40} className="opacity-20 mb-2" />
                  <p className="text-body-sm">Aucun bien</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={occupancyData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {occupancyData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend
                      formatter={(value) => <span className="text-label-sm text-on-surface">{value}</span>}
                    />
                    <Tooltip formatter={(v) => [`${v} bien(s)`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="mt-sm pt-sm border-t border-outline-variant/20 text-center">
              <p className="font-black text-h1 text-primary">{occupancyRate}%</p>
              <p className="text-label-sm text-on-surface-variant">taux d'occupation</p>
            </div>
          </div>

          {/* Impayés alert */}
          {ownerPayments.filter(p => p.status !== 'Payé').length > 0 && (
            <div className="lg:col-span-3 bg-error/5 border border-error/20 rounded-xl p-md">
              <h3 className="font-h3 text-h3 text-on-surface mb-md flex items-center gap-2">
                <Icon name="warning" className="text-error" />
                Loyers Impayés
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-label-sm text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/20">
                      <th className="pb-2 pr-4">Propriété</th>
                      <th className="pb-2 pr-4">Locataire</th>
                      <th className="pb-2 pr-4">Mois</th>
                      <th className="pb-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownerPayments.filter(p => p.status !== 'Payé').map(p => (
                      <tr key={p.id} className="border-b border-outline-variant/10 last:border-0">
                        <td className="py-2 pr-4 text-body-sm text-on-surface">{p.propertyName || '—'}</td>
                        <td className="py-2 pr-4 text-body-sm text-on-surface">{p.tenantName || '—'}</td>
                        <td className="py-2 pr-4 text-body-sm text-on-surface-variant">{p.month}</td>
                        <td className="py-2 text-right font-bold text-error">{fmt(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PROPERTIES ───────────────────────────────────────────── */}
      {activeTab === 'properties' && (
        ownerProperties.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <Icon name="apartment" size={48} className="opacity-30 mb-sm" />
            <p className="font-bold">Aucun bien enregistré pour ce propriétaire</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
            {ownerProperties.map(prop => {
              const propContract = ownerContracts.find(c => c.propertyName === prop.name && c.status === 'Actif');
              const propTickets = ownerTickets.filter(t => t.property === prop.name && t.status !== 'Résolu').length;
              const propPayments = ownerPayments.filter(p => propContract && p.contractId === propContract.id);
              const lastPayment = propPayments.find(p => p.status === 'Payé');
              return (
                <div key={prop.id} className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-card overflow-hidden">
                  {prop.image ? (
                    <img src={prop.image} alt={prop.name} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-surface-container flex items-center justify-center">
                      <Icon name={prop.isBuilding ? 'domain' : 'apartment'} size={48} className="text-primary/30" />
                    </div>
                  )}
                  <div className="p-md">
                    <div className="flex items-start justify-between mb-sm">
                      <div>
                        <h4 className="font-bold text-on-surface">{prop.name}</h4>
                        <p className="text-body-sm text-on-surface-variant">{prop.address}</p>
                      </div>
                      <Badge label={prop.status || 'Libre'} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-sm">
                      <div className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                        <Icon name="straighten" size={14} />{prop.surface} m²
                      </div>
                      <div className="flex items-center gap-1 text-body-sm text-primary font-bold">
                        <Icon name="payments" size={14} />{fmtK(prop.rent)}k/mois
                      </div>
                      {propTickets > 0 && (
                        <div className="flex items-center gap-1 text-body-sm text-error font-medium">
                          <Icon name="engineering" size={14} />{propTickets} ticket(s)
                        </div>
                      )}
                      {lastPayment && (
                        <div className="flex items-center gap-1 text-body-sm text-green-700">
                          <Icon name="check_circle" size={14} />Payé {lastPayment.paidDate}
                        </div>
                      )}
                    </div>
                    {propContract && (
                      <div className="pt-sm border-t border-outline-variant/20 text-body-sm text-on-surface-variant">
                        Locataire : <span className="text-on-surface font-medium">{propContract.tenant}</span>
                        {propContract.endDate !== '—' && (
                          <span> — Bail jusqu'au {propContract.endDate}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── FINANCE ──────────────────────────────────────────────── */}
      {activeTab === 'finance' && (
        <div className="flex flex-col gap-gutter">
          {/* Cashflow line chart */}
          <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <h3 className="font-h3 text-h3 text-on-surface mb-1">Cashflow cumulatif</h3>
            <p className="text-body-sm text-on-surface-variant mb-lg">Revenus encaissés sur l'année</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyRevData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={36} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="revenus" name="Revenus" stroke="#785a00" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Payments table */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="px-md py-md border-b border-outline-variant/20 flex items-center justify-between">
              <h3 className="font-h3 text-h3 text-on-surface">Tous les Paiements</h3>
              <div className="flex gap-2">
                <span className="text-label-sm text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                  {ownerPayments.filter(p => p.status === 'Payé').length} payés
                </span>
                <span className="text-label-sm text-error bg-error/10 px-2 py-0.5 rounded-full">
                  {ownerPayments.filter(p => p.status !== 'Payé').length} impayés
                </span>
              </div>
            </div>
            {ownerPayments.length === 0 ? (
              <div className="text-center py-10 text-on-surface-variant">
                <Icon name="payments" size={40} className="opacity-30 mb-sm" />
                <p>Aucun paiement lié à ces biens</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-secondary text-on-primary">
                    <tr>
                      <th className="px-md py-3 text-label-sm uppercase tracking-wider">Propriété</th>
                      <th className="px-md py-3 text-label-sm uppercase tracking-wider">Locataire</th>
                      <th className="px-md py-3 text-label-sm uppercase tracking-wider">Mois</th>
                      <th className="px-md py-3 text-label-sm uppercase tracking-wider text-right">Montant</th>
                      <th className="px-md py-3 text-label-sm uppercase tracking-wider">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {ownerPayments.map(p => (
                      <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-md py-3 text-body-sm text-on-surface">{p.propertyName || '—'}</td>
                        <td className="px-md py-3 text-body-sm text-on-surface">{p.tenantName || '—'}</td>
                        <td className="px-md py-3 text-body-sm text-on-surface-variant">{p.month}</td>
                        <td className={`px-md py-3 text-right font-bold ${p.status === 'Payé' ? 'text-green-700' : 'text-error'}`}>
                          {fmt(p.amount)}
                        </td>
                        <td className="px-md py-3">
                          <span className={`inline-flex items-center gap-1 px-xs py-0.5 rounded-full text-label-sm ${
                            p.status === 'Payé' ? 'bg-green-100 text-green-700' :
                            p.status === 'En retard' ? 'bg-amber-100 text-amber-700' : 'bg-error-container text-error'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MAINTENANCE ──────────────────────────────────────────── */}
      {activeTab === 'maintenance' && (
        <div className="flex flex-col gap-gutter">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            {[
              { label: 'Total tickets', value: ownerTickets.length, color: 'bg-primary/10 text-primary' },
              { label: 'En attente', value: ownerTickets.filter(t => t.status === 'En attente').length, color: 'bg-amber-100 text-amber-700' },
              { label: 'En cours', value: ownerTickets.filter(t => t.status === 'En cours').length, color: 'bg-tertiary/10 text-tertiary' },
              { label: 'Résolus', value: ownerTickets.filter(t => t.status === 'Résolu').length, color: 'bg-green-100 text-green-700' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-md text-center ${s.color.split(' ')[0]} border border-current/10`}>
                <p className={`font-black text-h2 ${s.color.split(' ')[1]}`}>{s.value}</p>
                <p className="text-label-sm text-on-surface-variant">{s.label}</p>
              </div>
            ))}
          </div>

          {ownerTickets.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant">
              <Icon name="engineering" size={48} className="opacity-30 mb-sm" />
              <p className="font-bold">Aucun ticket pour ces biens</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ownerTickets.map(t => (
                <div key={t.id} className={`bg-surface-container-lowest rounded-xl border p-md ${
                  t.priority === 'Urgent' ? 'border-error/30 bg-error/5' : 'border-outline-variant/20'
                }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge label={t.priority} />
                      <Badge label={t.status} />
                      <span className="text-label-sm text-on-surface-variant font-mono">{t.id}</span>
                    </div>
                    {t.estimatedCost > 0 && (
                      <span className="text-label-sm text-error font-bold flex-shrink-0">{fmt(t.estimatedCost)}</span>
                    )}
                  </div>
                  <p className="font-bold text-on-surface">{t.title}</p>
                  <p className="text-body-sm text-on-surface-variant mt-1">{t.description}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-label-sm text-on-surface-variant">
                    <span className="flex items-center gap-1">
                      <Icon name="apartment" size={13} />{t.property}{t.unit ? ` — ${t.unit}` : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="calendar_today" size={13} />Signalé le {t.reportedAt}
                    </span>
                    {t.assignedTo && (
                      <span className="flex items-center gap-1">
                        <Icon name="person" size={13} />{t.assignedTo}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ÉTATS DES LIEUX ──────────────────────────────────────── */}
      {activeTab === 'edl' && (
        <div className="flex flex-col gap-gutter">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-md">
            {[
              { label: 'Total', value: ownerInspections.length, color: 'bg-primary/10 text-primary' },
              { label: 'Entrées', value: ownerInspections.filter(i => i.type === 'ENTRY').length, color: 'bg-tertiary/10 text-tertiary' },
              { label: 'Sorties', value: ownerInspections.filter(i => i.type === 'EXIT').length, color: 'bg-error/10 text-error' },
              { label: 'Complétés', value: ownerInspections.filter(i => i.status === 'COMPLETED').length, color: 'bg-green-100 text-green-700' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-md text-center ${s.color.split(' ')[0]} border border-current/10`}>
                <p className={`font-black text-h2 ${s.color.split(' ')[1]}`}>{s.value}</p>
                <p className="text-label-sm text-on-surface-variant">{s.label}</p>
              </div>
            ))}
          </div>

          {ownerInspections.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/20">
              <Icon name="home_work" size={40} className="opacity-30 mb-2" />
              <p className="font-bold">Aucun état des lieux pour vos biens</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {ownerInspections.map(insp => {
                const STATUS_LABELS = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', PENDING_SIGNATURE: 'Att. signature', COMPLETED: 'Complété' };
                const STATUS_CLS = { DRAFT: 'bg-slate-100 text-slate-700', IN_PROGRESS: 'bg-blue-100 text-blue-800', PENDING_SIGNATURE: 'bg-amber-100 text-amber-800', COMPLETED: 'bg-green-100 text-green-800' };
                const totalDmg = (insp.damages || []).reduce((s, d) => s + (d.cost || 0), 0);

                const dlPDF = () => {
                  const condLabel = { NEUF: 'Neuf', BON: 'Bon', USAGE: 'Usé', MAUVAIS: 'Mauvais', HS: 'Hors service' };
                  const sevLabel = { MINOR: 'Mineur', MODERATE: 'Modéré', MAJOR: 'Majeur' };
                  const catLabel = { ENTREE: 'Entrée / Hall', SALON: 'Salon / Séjour', CUISINE: 'Cuisine', CHAMBRE: 'Chambre(s)', BAIN: 'Salle de bain / WC', EXTERIEUR: 'Extérieur / Garage', AUTRE: 'Autre' };
                  const grouped = (insp.items || []).reduce((acc, item) => { if (!acc[item.category]) acc[item.category] = []; acc[item.category].push(item); return acc; }, {});
                  const totalCost = (insp.damages || []).reduce((s, d) => s + (d.cost || 0), 0);
                  const inventaireHTML = Object.entries(grouped).map(([cat, items]) =>
                    `<h3 style="color:#555;font-size:1em;margin:16px 0 4px">${catLabel[cat] || cat}</h3>
                    <table><tr><th>Élément</th><th>État</th><th>Observations</th></tr>
                    ${items.map(i => `<tr><td>${i.label}</td><td>${condLabel[i.condition] || i.condition}</td><td style="color:#666">${i.notes || '—'}</td></tr>`).join('')}</table>`
                  ).join('');
                  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>État des lieux ${insp.ref}</title>
                    <style>body{font-family:Arial;padding:32px;max-width:800px;margin:auto;font-size:14px}h1{color:#785a00;border-bottom:3px solid #785a00;padding-bottom:8px}h2{color:#444;font-size:1em;text-transform:uppercase;margin:20px 0 6px;border-left:3px solid #785a00;padding-left:8px}table{width:100%;border-collapse:collapse;margin:6px 0}th{background:#f8f4ed;padding:6px 10px;text-align:left;border:1px solid #ddd;font-size:0.85em}td{padding:6px 10px;border:1px solid #ddd;vertical-align:top}.sig-box{display:inline-block;border:1px solid #ddd;border-radius:8px;padding:12px;width:46%;margin-right:2%}@media print{body{padding:16px}}</style></head>
                    <body><h1>ÉTAT DES LIEUX ${insp.type === 'ENTRY' ? "D'ENTRÉE" : 'DE SORTIE'} — ${insp.ref}</h1>
                    <h2>Informations générales</h2>
                    <table><tr><th>Propriété</th><td>${insp.propertyName || '—'}${insp.unitRef ? ' — ' + insp.unitRef : ''}</td><th>Locataire</th><td>${insp.tenantName || '—'}</td></tr>
                    <tr><th>Gestionnaire</th><td>${insp.managerName || '—'}</td><th>Date</th><td>${insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString('fr-FR') : '—'}</td></tr></table>
                    <h2>Inventaire</h2>${(insp.items || []).length ? inventaireHTML : '<p style="color:#999">Aucun élément</p>'}
                    ${(insp.damages || []).length ? `<h2>Dommages</h2><table><tr><th>Élément</th><th>Description</th><th>Gravité</th><th>Coût</th></tr>${(insp.damages || []).map(d => `<tr><td>${d.itemLabel || '—'}</td><td>${d.description}</td><td>${sevLabel[d.severity] || d.severity}</td><td>${d.cost > 0 ? d.cost.toLocaleString('fr-CI') + ' FCFA' : '—'}</td></tr>`).join('')}<tr style="font-weight:bold;background:#fef9ee"><td colspan="3">Total</td><td style="color:#dc2626">${totalCost > 0 ? totalCost.toLocaleString('fr-CI') + ' FCFA' : '—'}</td></tr></table>` : ''}
                    <h2>Signatures</h2>
                    <div class="sig-box"><p><strong>Gestionnaire</strong> — ${insp.managerName || '—'}</p>${insp.managerSignature ? `<img src="${insp.managerSignature.data}" style="max-height:60px"><p style="font-size:0.8em;color:#999">Signé le ${new Date(insp.managerSignature.signedAt).toLocaleDateString('fr-FR')}</p>` : '<p style="color:#bbb">Non signé</p>'}</div>
                    <div class="sig-box"><p><strong>Locataire</strong> — ${insp.tenantName || '—'}</p>${insp.tenantSignature ? `<img src="${insp.tenantSignature.data}" style="max-height:60px"><p style="font-size:0.8em;color:#999">Signé le ${new Date(insp.tenantSignature.signedAt).toLocaleDateString('fr-FR')}</p>` : '<p style="color:#bbb">Non signé</p>'}</div>
                    <p style="margin-top:40px;color:#999;font-size:0.8em;border-top:1px solid #eee;padding-top:10px">Document généré le ${new Date().toLocaleDateString('fr-FR')} — Minsouah Immobilier</p>
                    </body></html>`;
                  const blob = new Blob([html], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const w = window.open(url, '_blank');
                  if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
                };

                return (
                  <div key={insp.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-md flex items-start gap-md">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${insp.type === 'ENTRY' ? 'bg-tertiary/10' : 'bg-error/10'}`}>
                      <Icon name={insp.type === 'ENTRY' ? 'login' : 'logout'} size={22} className={insp.type === 'ENTRY' ? 'text-tertiary' : 'text-error'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-on-surface">{insp.ref}</span>
                        <span className={`text-label-sm font-bold px-2.5 py-0.5 rounded-full ${STATUS_CLS[insp.status] || 'bg-gray-100 text-gray-700'}`}>{STATUS_LABELS[insp.status] || insp.status}</span>
                        <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full ${insp.type === 'ENTRY' ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'}`}>{insp.type === 'ENTRY' ? 'Entrée' : 'Sortie'}</span>
                      </div>
                      <p className="text-body-sm text-on-surface-variant truncate">{insp.propertyName} {insp.unitRef ? `• ${insp.unitRef}` : ''} — {insp.tenantName}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-label-sm text-on-surface-variant">
                        <span className="flex items-center gap-1"><Icon name="calendar_today" size={13} />{insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString('fr-FR') : '—'}</span>
                        <span className="flex items-center gap-1"><Icon name="checklist" size={13} />{(insp.items || []).length} éléments</span>
                        {totalDmg > 0 && <span className="flex items-center gap-1 text-error font-bold"><Icon name="warning" size={13} />{totalDmg.toLocaleString('fr-CI')} FCFA dommages</span>}
                        {insp.managerSignature && insp.tenantSignature && <span className="flex items-center gap-1 text-green-700"><Icon name="verified" size={13} />Signé</span>}
                      </div>
                    </div>
                    <button
                      onClick={dlPDF}
                      className="flex-shrink-0 flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-label-sm font-bold px-3 py-2 rounded-xl transition-colors"
                    >
                      <Icon name="picture_as_pdf" size={16} />
                      PDF
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
