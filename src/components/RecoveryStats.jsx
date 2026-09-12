import { useState, useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import Icon from './Icon';
import { recoverySeries, monthTenantBreakdown, lastNMonths, monthLabelNow } from '../lib/monthMetrics';

const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const fmtN = (n) => Number(n || 0).toLocaleString('fr-CI');

const STATUS_BADGE = {
  'Payé':     'bg-green-100 text-green-700',
  'Impayé':   'bg-error/10 text-error',
  'En avance':'bg-blue-100 text-blue-700',
};

/**
 * Statistiques de recouvrement : comparaison des taux entre les mois, montants
 * attendu/encaissé/impayés, analyse automatique et détail par locataire/bien.
 * Réutilisable : Tableau de bord (données de l'org) et Portail propriétaire
 * (données du propriétaire). Les chiffres proviennent du helper monthMetrics,
 * donc cohérents avec la page Paiements.
 */
export default function RecoveryStats({ payments = [], contracts = [], tenants = [], months = 12 }) {
  const series = useMemo(
    () => recoverySeries({ payments, contracts, tenants, months }),
    [payments, contracts, tenants, months]
  );

  const monthOpts = useMemo(() => lastNMonths(months).map(m => m.label).reverse(), [months]);
  const [selMonth, setSelMonth] = useState(monthLabelNow());

  const breakdown = useMemo(
    () => monthTenantBreakdown({ payments, contracts, tenants, monthLabel: selMonth }),
    [payments, contracts, tenants, selMonth]
  );

  /* ── Analyse automatique ──────────────────────────────────────────── */
  const insight = useMemo(() => {
    const valid = series.filter(s => s.attendu > 0);
    if (valid.length === 0) return null;
    const cur = series[series.length - 1];
    const prev = series[series.length - 2];
    const delta = prev ? cur.recouvrement - prev.recouvrement : 0;
    const best = valid.reduce((a, b) => (b.recouvrement > a.recouvrement ? b : a));
    const worst = valid.reduce((a, b) => (b.recouvrement < a.recouvrement ? b : a));
    const avg = Math.round(valid.reduce((s, x) => s + x.recouvrement, 0) / valid.length);
    // Tendance : moyenne des 3 derniers mois vs 3 précédents
    const last3 = valid.slice(-3);
    const prev3 = valid.slice(-6, -3);
    const avg3 = last3.length ? last3.reduce((s, x) => s + x.recouvrement, 0) / last3.length : 0;
    const avgP3 = prev3.length ? prev3.reduce((s, x) => s + x.recouvrement, 0) / prev3.length : avg3;
    const trend = avg3 - avgP3;
    return { cur, prev, delta, best, worst, avg, trend };
  }, [series]);

  const sentences = useMemo(() => {
    if (!insight) return [];
    const { cur, prev, delta, best, worst, avg, trend } = insight;
    const out = [];
    out.push(`Ce mois-ci (${cur.label}), le taux de recouvrement est de ${cur.recouvrement} %, soit ${fmt(cur.encaisse)} encaissés sur ${fmt(cur.attendu)} attendus.`);
    if (prev) {
      if (delta > 0) out.push(`C'est ${delta} points de mieux que le mois précédent (${prev.recouvrement} %) — la situation s'améliore.`);
      else if (delta < 0) out.push(`C'est ${Math.abs(delta)} points de moins que le mois précédent (${prev.recouvrement} %) — attention, le recouvrement recule.`);
      else out.push(`C'est stable par rapport au mois précédent (${prev.recouvrement} %).`);
    }
    out.push(`Sur la période, la moyenne est de ${avg} %. Meilleur mois : ${best.label} (${best.recouvrement} %). Mois le plus faible : ${worst.label} (${worst.recouvrement} %).`);
    if (trend > 3) out.push(`Tendance générale à la hausse sur les 3 derniers mois.`);
    else if (trend < -3) out.push(`Tendance générale à la baisse sur les 3 derniers mois : il serait utile de relancer les impayés.`);
    else out.push(`Tendance globalement stable sur les 3 derniers mois.`);
    if (cur.impaye > 0) out.push(`Impayés restants ce mois : ${fmt(cur.impaye)}.`);
    return out;
  }, [insight]);

  const trendColor = !insight ? 'text-on-surface' : insight.trend > 3 ? 'text-green-600' : insight.trend < -3 ? 'text-error' : 'text-amber-600';
  const trendIcon = !insight ? 'trending_flat' : insight.trend > 3 ? 'trending_up' : insight.trend < -3 ? 'trending_down' : 'trending_flat';

  const brk = useMemo(() => {
    const paid = breakdown.filter(b => b.status === 'Payé');
    const unpaid = breakdown.filter(b => b.status === 'Impayé');
    const collected = paid.reduce((s, b) => s + b.collected, 0);
    return { paid, unpaid, collected, total: breakdown.length };
  }, [breakdown]);

  if (series.length === 0) {
    return <div className="text-center py-10 text-on-surface-variant text-sm">Aucune donnée de recouvrement.</div>;
  }

  return (
    <div className="flex flex-col gap-gutter">
      {/* KPIs comparatifs */}
      {insight && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-surface-container-lowest rounded-xl p-md border border-outline-variant/20">
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">Ce mois</p>
            <p className={`text-h2 font-black ${insight.cur.recouvrement >= 80 ? 'text-green-600' : insight.cur.recouvrement >= 50 ? 'text-amber-600' : 'text-error'}`}>{insight.cur.recouvrement}%</p>
            <p className="text-label-sm text-on-surface-variant">{fmt(insight.cur.encaisse)}</p>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-md border border-outline-variant/20">
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">vs mois préc.</p>
            <p className={`text-h2 font-black ${insight.delta > 0 ? 'text-green-600' : insight.delta < 0 ? 'text-error' : 'text-on-surface'}`}>
              {insight.delta > 0 ? '+' : ''}{insight.delta} pts
            </p>
            <p className="text-label-sm text-on-surface-variant">{insight.prev ? `${insight.prev.recouvrement}% le mois dernier` : '—'}</p>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-md border border-outline-variant/20">
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">Meilleur mois</p>
            <p className="text-h2 font-black text-green-600">{insight.best.recouvrement}%</p>
            <p className="text-label-sm text-on-surface-variant">{insight.best.label}</p>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-md border border-outline-variant/20">
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">Mois le plus faible</p>
            <p className="text-h2 font-black text-error">{insight.worst.recouvrement}%</p>
            <p className="text-label-sm text-on-surface-variant">{insight.worst.label}</p>
          </div>
        </div>
      )}

      {/* Analyse automatique */}
      {sentences.length > 0 && (
        <div className="bg-primary-container/20 rounded-xl p-md border border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface mb-2 flex items-center gap-2">
            <Icon name={trendIcon} className={trendColor} /> Analyse du recouvrement
          </h3>
          <ul className="flex flex-col gap-1.5">
            {sentences.map((s, i) => (
              <li key={i} className="text-body-sm text-on-surface flex items-start gap-2">
                <Icon name="chevron_right" size={16} className="text-primary mt-0.5 flex-shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Courbe du taux de recouvrement */}
      <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
        <h3 className="font-h3 text-h3 text-on-surface mb-1">Taux de recouvrement par mois</h3>
        <p className="text-body-sm text-on-surface-variant mb-sm">{months} derniers mois · en %</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRecouv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#785a00" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#785a00" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} width={32} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => [`${v}%`, 'Recouvrement']} labelFormatter={(l, p) => p?.[0]?.payload?.label || l} />
              <ReferenceLine y={80} stroke="#4CAF50" strokeDasharray="5 4" label={{ value: 'Objectif 80%', position: 'right', fill: '#4CAF50', fontSize: 10 }} />
              <Area type="monotone" dataKey="recouvrement" name="Recouvrement" stroke="#785a00" strokeWidth={2.5} fill="url(#gradRecouv)" dot={{ r: 3, fill: '#785a00' }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Montants attendu / encaissé / impayés */}
      <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
        <h3 className="font-h3 text-h3 text-on-surface mb-1">Attendu · Encaissé · Impayés</h3>
        <p className="text-body-sm text-on-surface-variant mb-sm">{months} derniers mois · en FCFA</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v, n) => [fmt(v), n]} labelFormatter={(l, p) => p?.[0]?.payload?.label || l} />
              <Legend />
              <Bar dataKey="attendu" name="Attendu" fill="#d2c5ae" radius={[3, 3, 0, 0]} />
              <Bar dataKey="encaisse" name="Encaissé" fill="#785a00" radius={[3, 3, 0, 0]} />
              <Bar dataKey="impaye" name="Impayés" fill="#ba1a1a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Détail par locataire / bien */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        <div className="p-md border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-sm">
          <div>
            <h3 className="font-h3 text-h3 text-on-surface">Détail par locataire / bien</h3>
            <p className="text-body-sm text-on-surface-variant">
              {brk.paid.length} payé(s) · {brk.unpaid.length} impayé(s) · {fmt(brk.collected)} encaissés
            </p>
          </div>
          <select value={selMonth} onChange={(e) => setSelMonth(e.target.value)}
            className="px-sm py-xs bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:outline-none focus:border-primary">
            {monthOpts.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary text-on-primary sticky top-0">
              <tr>
                <th className="px-md py-3 text-label-sm uppercase tracking-wider">Locataire</th>
                <th className="px-md py-3 text-label-sm uppercase tracking-wider">Bien</th>
                <th className="px-md py-3 text-label-sm uppercase tracking-wider text-right">Loyer</th>
                <th className="px-md py-3 text-label-sm uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {breakdown.map((b, i) => (
                <tr key={i} className="hover:bg-surface-container-low">
                  <td className="px-md py-3 text-body-sm text-on-surface">{b.tenant}</td>
                  <td className="px-md py-3 text-body-sm text-on-surface-variant">{b.property}</td>
                  <td className="px-md py-3 text-right text-label-md font-label-md text-on-surface">{fmtN(b.rent)}</td>
                  <td className="px-md py-3">
                    <span className={`text-label-sm px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[b.status] || ''}`}>{b.status}</span>
                  </td>
                </tr>
              ))}
              {breakdown.length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-on-surface-variant text-sm">Aucun contrat actif ce mois.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
