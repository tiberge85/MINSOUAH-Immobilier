import { useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { loadXLSX } from '../lib/lazyXlsx';
import { computeMonthMetrics, MM_MONTH_NAMES } from '../lib/monthMetrics';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';

/* ────────────────────────────────────────────────────────────────────────────
   RAPPORT D'EXERCICE (Assemblée Générale) — toutes agences.  [Phase 2]

   Règle comptable appliquée (cahier des charges) : on NE confond PAS les loyers
   encaissés POUR LES PROPRIÉTAIRES avec le chiffre d'affaires de Minsouah.
     • CA Minsouah            = commissions acquises (sur loyers encaissés).
     • Charges Minsouah       = dépenses de fonctionnement (transactions < 0).
     • Résultat Minsouah      = commissions − charges.
     • Fonds propriétaires    = loyers collectés pour leur compte (séparés),
                                reversés (bordereaux PROPRIETAIRE validés) et
                                en attente de reversement.
   Les données sont lues directement par agence (getDocs par orgId). Une agence
   non lisible (règle pas encore déployée) est ignorée avec un avertissement.
   ──────────────────────────────────────────────────────────────────────────── */

const fCFA = (n) => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
const fNum = (n) => Number(n || 0).toLocaleString('fr-FR');

function parseAnyDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

const inYear = (v, year) => { const d = parseAnyDate(v); return !!d && d.getFullYear() === year; };
const unitCount = (p) => (p?.isBuilding ? (Array.isArray(p.units) ? p.units.length : 0) || 1 : 1);
const doneStatus = (s) => /resolu|résolu|clotur|clôtur|termin|fait|réalis|realis|ferm/i.test(String(s || ''));

/* Bilan annuel d'UNE agence à partir de ses données brutes. */
function computeAgencyYear({ year, payments, transactions, contracts, tenants, properties, owners, bordereaux, tickets }) {
  const months = MM_MONTH_NAMES.map((name, i) => ({ name, idx: i, label: `${name} ${year}` }));

  const monthly = months.map((mo) => {
    const mm = computeMonthMetrics({ payments, contracts, tenants, monthLabel: mo.label });
    const monthPaid = (payments || []).filter(p =>
      p.status === 'Payé' && !p.avanceVerseeProprio &&
      (p.month || '').toString().toLowerCase().trim() === mo.label.toLowerCase());
    const commission = monthPaid.reduce((s, p) => s + (Number(p.commissionAmount) || 0), 0);
    const charges = (transactions || []).filter(t => !t.positive && parseAnyDate(t.date) &&
      parseAnyDate(t.date).getFullYear() === year && parseAnyDate(t.date).getMonth() === mo.idx)
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const reverse = (bordereaux || []).filter(b => b.type === 'PROPRIETAIRE' && b.status === 'Validé' &&
      inYear(b.createdAt || b.date, year) && parseAnyDate(b.createdAt || b.date).getMonth() === mo.idx)
      .reduce((s, b) => s + (Number(b.totalNet) || 0), 0);
    return {
      mois: mo.name, label: mo.label,
      collecte: mm.collected, impaye: mm.pending, recouvrement: mm.recoveryRate,
      commission, charges, resultat: commission - charges, reverse,
    };
  });

  const sum = (f) => monthly.reduce((s, m) => s + (Number(f(m)) || 0), 0);

  // Minsouah (CA = commissions)
  const caCommission = sum(m => m.commission);
  const chargesMinsouah = sum(m => m.charges);
  const minsouah = { ca: caCommission, charges: chargesMinsouah, resultat: caCommission - chargesMinsouah };

  // Recouvrement / loyers (fonds propriétaires collectés)
  const collecte = sum(m => m.collecte);
  const impaye = sum(m => m.impaye);
  const recovery = {
    collecte, impaye,
    taux: (collecte + impaye) > 0 ? Math.round((collecte / (collecte + impaye)) * 100) : (collecte > 0 ? 100 : 0),
  };

  // Fonds propriétaires : collectés (loyers) − commission = net dû ; reversés via bordereaux.
  const reversed = (bordereaux || []).filter(b => b.type === 'PROPRIETAIRE' && b.status === 'Validé' && inYear(b.createdAt || b.date, year))
    .reduce((s, b) => s + (Number(b.totalNet) || 0), 0);
  const pending = (bordereaux || []).filter(b => b.type === 'PROPRIETAIRE' && b.status === 'En attente de validation' && inYear(b.createdAt || b.date, year))
    .reduce((s, b) => s + (Number(b.totalNet) || 0), 0);
  const ownersFunds = {
    collected: collecte,
    netDu: Math.max(0, collecte - caCommission), // net théorique dû aux propriétaires
    reversed, pending,
  };

  // Patrimoine
  const totalUnits = (properties || []).reduce((s, p) => s + unitCount(p), 0);
  const activeContracts = (contracts || []).filter(c => c.status === 'Actif' || c.status === 'Expirant');
  const resilieContracts = (contracts || []).filter(c => c.status === 'Résilié');
  const newContracts = (contracts || []).filter(c => inYear(c.createdAt || c.since || c.startDate, year));
  const occupied = activeContracts.length;
  const patrimoine = {
    properties: (properties || []).length, units: totalUnits,
    occupied, vacant: Math.max(0, totalUnits - occupied),
    occupancy: totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0,
    activeContracts: activeContracts.length, resilieContracts: resilieContracts.length,
    newContracts: newContracts.length,
    owners: (owners || []).length, tenants: (tenants || []).length,
  };

  // Maintenance (tickets de l'exercice ; coût = montant devis)
  const yearTickets = (tickets || []).filter(t => !(t.createdAt || t.date) || inYear(t.createdAt || t.date, year));
  const maintenance = {
    total: yearTickets.length,
    done: yearTickets.filter(t => doneStatus(t.status)).length,
    pending: yearTickets.filter(t => !doneStatus(t.status)).length,
    cost: yearTickets.reduce((s, t) => s + (Number(t.devisAmount) || 0), 0),
  };

  // Cautions
  const cautionHeld = (tenants || []).filter(t => !t.cautionRefunded).reduce((s, t) => s + (Number(t.cautionAmount) || 0), 0);
  const cautionRefundedYear = (tenants || []).filter(t => t.cautionRefunded && inYear(t.cautionRefundDate, year))
    .reduce((s, t) => s + (Number(t.cautionRestitue != null ? t.cautionRestitue : t.cautionAmount) || 0), 0);
  const cautions = { held: cautionHeld, refundedYear: cautionRefundedYear };

  return { monthly, minsouah, recovery, ownersFunds, patrimoine, maintenance, cautions };
}

function consolidate(agenciesData) {
  const monthly = MM_MONTH_NAMES.map((name, i) => {
    const acc = { mois: name, collecte: 0, impaye: 0, commission: 0, charges: 0, resultat: 0, reverse: 0 };
    agenciesData.forEach(a => {
      const m = a.data.monthly[i];
      acc.collecte += m.collecte; acc.impaye += m.impaye; acc.commission += m.commission;
      acc.charges += m.charges; acc.resultat += m.resultat; acc.reverse += m.reverse;
    });
    acc.recouvrement = (acc.collecte + acc.impaye) > 0 ? Math.round((acc.collecte / (acc.collecte + acc.impaye)) * 100) : 0;
    return acc;
  });
  const add = (grp, keys) => keys.reduce((o, k) => { o[k] = agenciesData.reduce((s, a) => s + a.data[grp][k], 0); return o; }, {});
  const minsouah = add('minsouah', ['ca', 'charges', 'resultat']);
  const ownersFunds = add('ownersFunds', ['collected', 'netDu', 'reversed', 'pending']);
  const recovery = add('recovery', ['collecte', 'impaye']);
  recovery.taux = (recovery.collecte + recovery.impaye) > 0 ? Math.round((recovery.collecte / (recovery.collecte + recovery.impaye)) * 100) : 0;
  const patrimoine = add('patrimoine', ['properties', 'units', 'occupied', 'vacant', 'activeContracts', 'resilieContracts', 'newContracts', 'owners', 'tenants']);
  patrimoine.occupancy = patrimoine.units > 0 ? Math.round((patrimoine.occupied / patrimoine.units) * 100) : 0;
  const maintenance = add('maintenance', ['total', 'done', 'pending', 'cost']);
  const cautions = add('cautions', ['held', 'refundedYear']);
  return { monthly, minsouah, recovery, ownersFunds, patrimoine, maintenance, cautions };
}

/* Objectifs N+1 — fondés sur le CA (commissions), pas sur les loyers. */
function buildObjectives(nextYear, c) {
  const out = [];
  out.push(`Chiffre d'affaires ${nextYear} (commissions) : viser ${fCFA(Math.round(c.minsouah.ca * 1.1))} (+10% vs ${fCFA(c.minsouah.ca)}).`);
  if (c.recovery.taux < 95) out.push(`Recouvrement : passer de ${c.recovery.taux}% à ≥ 95% (réduire ${fCFA(c.recovery.impaye)} d'impayés).`);
  else out.push(`Maintenir le taux de recouvrement (${c.recovery.taux}%) par des relances anticipées.`);
  if (c.ownersFunds.pending > 0) out.push(`Accélérer les reversements : ${fCFA(c.ownersFunds.pending)} en attente de validation — réduire les délais.`);
  if (c.patrimoine.vacant > 0) out.push(`Réduire la vacance : ${c.patrimoine.vacant} unité(s) vacante(s) sur ${c.patrimoine.units} (occupation ${c.patrimoine.occupancy}%) — objectif ≥ 90%.`);
  else out.push(`Maintenir le plein emploi du parc (${c.patrimoine.occupancy}%) et développer le portefeuille.`);
  if (c.minsouah.ca > 0) out.push(`Maîtriser les charges : ${fCFA(c.minsouah.charges)} (${Math.round((c.minsouah.charges / c.minsouah.ca) * 100)}% du CA) — viser une baisse de ce ratio.`);
  if (c.patrimoine.resilieContracts > 0) out.push(`Fidéliser : ${c.patrimoine.resilieContracts} mandat(s) résilié(s) — renforcer le suivi locataire/propriétaire.`);
  out.push(`Développement commercial : +${Math.max(3, Math.round(c.patrimoine.properties * 0.15))} biens sous gestion et nouveaux mandats.`);
  return out;
}

export default function AnnualReport() {
  const { state } = useApp();
  const user = state.currentUser;
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const myOrgIds = useMemo(() => {
    const ids = user?.orgIds?.length ? user.orgIds : [user?.orgId].filter(Boolean);
    return [...new Set(ids)];
  }, [user]);

  const agencies = useMemo(() => {
    const orgs = state.organizations || [];
    return myOrgIds.map(id => ({ id, name: orgs.find(o => o.id === id)?.name || id }));
  }, [myOrgIds, state.organizations]);

  const years = useMemo(() => { const y = now.getFullYear(); return [y + 1, y, y - 1, y - 2, y - 3]; }, [now]);

  async function fetchOrgCollection(colName, orgId) {
    const snap = await getDocs(query(collection(db, 'workspaces', WS, colName), where('orgId', '==', orgId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function generate() {
    setBusy(true); setError(''); setResult(null); setProgress('');
    try {
      const agenciesData = []; const skipped = [];
      for (const ag of agencies) {
        setProgress(`Lecture des données — ${ag.name}…`);
        try {
          const [payments, transactions, contracts, tenants, properties, owners, bordereaux, tickets] = await Promise.all([
            fetchOrgCollection('payments', ag.id),
            fetchOrgCollection('transactions', ag.id),
            fetchOrgCollection('contracts', ag.id),
            fetchOrgCollection('tenants', ag.id),
            fetchOrgCollection('properties', ag.id),
            fetchOrgCollection('owners', ag.id),
            fetchOrgCollection('bordereaux', ag.id),
            fetchOrgCollection('tickets', ag.id),
          ]);
          const data = computeAgencyYear({ year, payments, transactions, contracts, tenants, properties, owners, bordereaux, tickets });
          agenciesData.push({ id: ag.id, name: ag.name, data });
        } catch (e) {
          console.warn('[AnnualReport] agence ignorée', ag.name, e?.code || e?.message);
          skipped.push(ag.name);
        }
      }
      if (!agenciesData.length) {
        setError("Aucune donnée d'agence lisible. Vérifiez que la règle multi-agences est déployée."); setBusy(false); return;
      }
      setResult({ year, agencies: agenciesData, consolidated: consolidate(agenciesData), skipped });
      setProgress('');
    } catch (e) { setError(e?.message || 'Erreur lors de la génération.'); }
    finally { setBusy(false); }
  }

  async function exportExcel() {
    if (!result) return;
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const c = result.consolidated;
    const synth = [
      [`RAPPORT D'EXERCICE ${result.year} — TOUTES AGENCES`], [],
      ['— RÉSULTAT MINSOUAH —', ''],
      ['Chiffre d\'affaires (commissions)', c.minsouah.ca],
      ['Charges de fonctionnement', c.minsouah.charges],
      ['Résultat Minsouah (commissions − charges)', c.minsouah.resultat], [],
      ['— FONDS PROPRIÉTAIRES (hors résultat Minsouah) —', ''],
      ['Loyers collectés pour les propriétaires', c.ownersFunds.collected],
      ['Net dû aux propriétaires (collecté − commission)', c.ownersFunds.netDu],
      ['Reversé (bordereaux validés)', c.ownersFunds.reversed],
      ['En attente de reversement', c.ownersFunds.pending], [],
      ['— RECOUVREMENT —', ''],
      ['Loyers encaissés', c.recovery.collecte],
      ['Impayés', c.recovery.impaye],
      ['Taux de recouvrement (%)', c.recovery.taux], [],
      ['— PATRIMOINE & ACTIVITÉ —', ''],
      ['Biens gérés', c.patrimoine.properties], ['Unités', c.patrimoine.units],
      ['Taux d\'occupation (%)', c.patrimoine.occupancy], ['Unités vacantes', c.patrimoine.vacant],
      ['Mandats actifs', c.patrimoine.activeContracts], ['Mandats résiliés', c.patrimoine.resilieContracts],
      ['Nouveaux contrats', c.patrimoine.newContracts],
      ['Propriétaires', c.patrimoine.owners], ['Locataires', c.patrimoine.tenants], [],
      ['— MAINTENANCE —', ''],
      ['Demandes', c.maintenance.total], ['Réalisées', c.maintenance.done], ['En attente', c.maintenance.pending],
      ['Coût (devis)', c.maintenance.cost], [],
      ['— CAUTIONS —', ''],
      ['Cautions détenues', c.cautions.held], [`Cautions restituées (${result.year})`, c.cautions.refundedYear],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synth), 'Synthèse');

    const header = ['Mois', 'Loyers encaissés', 'Impayés', 'Recouv.%', 'Commission (CA)', 'Charges', 'Résultat Minsouah', 'Reversé proprio'];
    const rowsOf = (monthly) => monthly.map(m => [m.mois, m.collecte, m.impaye, m.recouvrement, m.commission, m.charges, m.resultat, m.reverse]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rowsOf(c.monthly)]), 'Mensuel consolidé');
    result.agencies.forEach(a => {
      const safe = (a.name || 'Agence').replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Agence';
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rowsOf(a.data.monthly)]), safe);
    });
    XLSX.writeFile(wb, `Rapport_exercice_${result.year}_toutes_agences.xlsx`);
  }

  function exportPDF() {
    if (!result) return;
    const html = buildReportHTML(result, state.orgSettings || {});
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (win) { win.document.write(html); win.document.close(); } else alert('Autorisez les pop-ups pour le PDF.');
  }

  return (
    <div className="flex flex-col gap-md">
      <div>
        <h2 className="font-bold text-on-surface text-lg flex items-center gap-2">
          <Icon name="assessment" size={22} className="text-primary" /> Rapport d'exercice (AG)
        </h2>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Bilan d'activité détaillé sur l'année civile, pour toutes vos agences — séparation stricte CA Minsouah / fonds propriétaires. Export PDF et Excel.
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md flex flex-wrap items-end gap-md">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Année d'exercice</label>
          <select value={year} onChange={e => { setYear(Number(e.target.value)); setResult(null); }}
            className="border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs text-on-surface-variant">Agences incluses</p>
          <p className="text-sm font-semibold text-on-surface">{agencies.map(a => a.name).join(', ') || '—'}</p>
        </div>
        <button onClick={generate} disabled={busy || !agencies.length}
          className="inline-flex items-center gap-2 bg-primary text-on-primary font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-primary/90 disabled:opacity-50">
          {busy ? <><Icon name="progress_activity" size={18} className="animate-spin" /> Génération…</>
                : <><Icon name="query_stats" size={18} /> Générer le rapport</>}
        </button>
      </div>

      {progress && <p className="text-sm text-on-surface-variant flex items-center gap-2"><Icon name="progress_activity" size={16} className="animate-spin" /> {progress}</p>}
      {error && <div className="bg-error/10 border border-error/20 text-error rounded-xl px-4 py-3 text-sm">{error}</div>}

      {result && (
        <div className="flex flex-col gap-md">
          {result.skipped?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
              Agence(s) non lue(s) (accès refusé) : {result.skipped.join(', ')}. Déconnectez-vous/reconnectez-vous une fois si besoin.
            </div>
          )}
          <div className="flex gap-sm flex-wrap">
            <button onClick={exportPDF} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="picture_as_pdf" size={18} /> Exporter PDF</button>
            <button onClick={exportExcel} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="table_view" size={18} /> Exporter Excel</button>
          </div>
          <AgencyCard title={`Consolidé — toutes agences (${result.year})`} d={result.consolidated} highlight />
          {result.agencies.map(a => <AgencyCard key={a.id} title={a.name} d={a.data} />)}
        </div>
      )}
    </div>
  );
}

function Block({ title, color, items }) {
  return (
    <div>
      <div className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${color}`}>{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-outline-variant/20">
        {items.map(k => (
          <div key={k.label} className="bg-surface-container-lowest p-3">
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">{k.label}</p>
            <p className={`font-bold mt-0.5 text-sm ${k.cls || 'text-on-surface'}`}>{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgencyCard({ title, d, highlight }) {
  return (
    <div className={`rounded-xl shadow-card border overflow-hidden ${highlight ? 'border-primary/40' : 'border-outline-variant/20'}`}>
      <div className="px-md py-2.5 bg-secondary text-on-primary font-bold text-sm">{title}</div>
      <Block title="Résultat Minsouah" color="bg-amber-100 text-amber-800" items={[
        { label: 'CA (commissions)', value: fCFA(d.minsouah.ca), cls: 'text-amber-700' },
        { label: 'Charges', value: fCFA(d.minsouah.charges), cls: 'text-red-700' },
        { label: 'Résultat Minsouah', value: fCFA(d.minsouah.resultat), cls: d.minsouah.resultat >= 0 ? 'text-green-700' : 'text-red-700' },
        { label: 'Recouvrement', value: d.recovery.taux + '%', cls: 'text-primary' },
      ]} />
      <Block title="Fonds propriétaires (hors résultat Minsouah)" color="bg-blue-100 text-blue-800" items={[
        { label: 'Loyers collectés', value: fCFA(d.ownersFunds.collected), cls: 'text-green-700' },
        { label: 'Net dû proprios', value: fCFA(d.ownersFunds.netDu) },
        { label: 'Reversé (validé)', value: fCFA(d.ownersFunds.reversed), cls: 'text-green-700' },
        { label: 'En attente reversement', value: fCFA(d.ownersFunds.pending), cls: 'text-amber-700' },
      ]} />
      <Block title="Patrimoine & activité" color="bg-surface-container-high text-on-surface" items={[
        { label: 'Occupation', value: d.patrimoine.occupancy + '%', cls: 'text-blue-700' },
        { label: 'Biens / Unités', value: `${d.patrimoine.properties} / ${d.patrimoine.units}` },
        { label: 'Mandats actifs', value: fNum(d.patrimoine.activeContracts) },
        { label: 'Mandats résiliés', value: fNum(d.patrimoine.resilieContracts) },
        { label: 'Nouveaux contrats', value: fNum(d.patrimoine.newContracts) },
        { label: 'Propriétaires', value: fNum(d.patrimoine.owners) },
        { label: 'Locataires', value: fNum(d.patrimoine.tenants) },
        { label: 'Impayés', value: fCFA(d.recovery.impaye), cls: 'text-red-700' },
        { label: 'Maintenance (demandes)', value: `${d.maintenance.total} (${d.maintenance.done} faites)` },
        { label: 'Coût maintenance', value: fCFA(d.maintenance.cost) },
        { label: 'Cautions détenues', value: fCFA(d.cautions.held) },
        { label: 'Cautions restituées', value: fCFA(d.cautions.refundedYear) },
      ]} />
    </div>
  );
}

/* ── HTML imprimable ── */
function buildReportHTML(result, org) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const logo = org.logo || ''; const company = org.companyName || 'Minsouah';
  const c = result.consolidated; const nextYear = result.year + 1;
  const objectives = buildObjectives(nextYear, c);

  const monthTable = (monthly) => `
    <table><thead><tr>
      <th>Mois</th><th class="r">Loyers encaissés</th><th class="r">Impayés</th><th class="c">Recouv.</th>
      <th class="r">Commission (CA)</th><th class="r">Charges</th><th class="r">Résultat Minsouah</th><th class="r">Reversé proprio</th>
    </tr></thead><tbody>
      ${monthly.map(m => `<tr>
        <td>${m.mois}</td>
        <td class="r" style="color:#15803d">${fNum(m.collecte)}</td>
        <td class="r" style="color:#b91c1c">${fNum(m.impaye)}</td>
        <td class="c">${m.recouvrement}%</td>
        <td class="r" style="color:#b45309">${fNum(m.commission)}</td>
        <td class="r" style="color:#b91c1c">${fNum(m.charges)}</td>
        <td class="r" style="color:${m.resultat >= 0 ? '#15803d' : '#b91c1c'}">${fNum(m.resultat)}</td>
        <td class="r" style="color:#0369a1">${fNum(m.reverse)}</td>
      </tr>`).join('')}
    </tbody></table>`;

  const kpi = (l, v, color) => `<div class="k"><div class="l">${l}</div><div class="v" style="color:${color}">${v}</div></div>`;

  const agencySection = (a) => `
    <h2 class="ag">Agence : ${a.name}</h2>
    <div class="kgrid">
      ${kpi('CA (commissions)', fCFA(a.data.minsouah.ca), '#b45309')}
      ${kpi('Charges', fCFA(a.data.minsouah.charges), '#b91c1c')}
      ${kpi('Résultat Minsouah', fCFA(a.data.minsouah.resultat), a.data.minsouah.resultat >= 0 ? '#15803d' : '#b91c1c')}
      ${kpi('Loyers collectés (proprios)', fCFA(a.data.ownersFunds.collected), '#15803d')}
      ${kpi('Reversé', fCFA(a.data.ownersFunds.reversed), '#0369a1')}
      ${kpi('En attente reversement', fCFA(a.data.ownersFunds.pending), '#b45309')}
      ${kpi('Occupation', a.data.patrimoine.occupancy + '%', '#0369a1')}
      ${kpi('Recouvrement', a.data.recovery.taux + '%', '#785a00')}
    </div>
    ${monthTable(a.data.monthly)}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Rapport d'exercice ${result.year}</title>
  <style>
    *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#222;margin:0;padding:28px;font-size:12px}
    .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #785a00;padding-bottom:12px;margin-bottom:16px}
    .head img{height:54px} .head h1{margin:0;font-size:20px;color:#785a00} .head p{margin:2px 0 0;color:#777;font-size:11px}
    h2{font-size:15px;color:#785a00;margin:22px 0 8px;border-left:4px solid #785a00;padding-left:8px}
    h2.ag{color:#0f766e;border-left-color:#0f766e;margin-top:26px}
    .note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;font-size:11px;color:#1e40af;margin:8px 0}
    .kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 4px}
    .k{border:1px solid #eee;border-radius:8px;padding:8px 10px;background:#fafafa}
    .k .l{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#999} .k .v{font-size:15px;font-weight:800;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}
    th,td{border:1px solid #e5e5e5;padding:5px 7px} th{background:#785a00;color:#fff;text-align:left;font-size:10px;text-transform:uppercase}
    td.r,th.r{text-align:right} td.c,th.c{text-align:center} tbody tr:nth-child(even){background:#faf8f2}
    .pat{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
    .pat-i{border:1px solid #eee;border-radius:6px;padding:6px 8px;display:flex;justify-content:space-between;background:#f7fafc}
    .pat-i span{color:#777;font-size:10px} .pat-i b{font-size:12px}
    .obj{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 16px;margin-top:10px} .obj li{margin:5px 0}
    .foot{margin-top:26px;border-top:1px solid #ddd;padding-top:8px;color:#999;font-size:10px;display:flex;justify-content:space-between}
    @media print{body{padding:0}}
  </style></head><body>
    <div class="head">${logo ? `<img src="${logo}"/>` : ''}<div>
      <h1>Rapport d'exercice ${result.year}</h1>
      <p>${company} — Bilan d'activité consolidé · Toutes agences · Édité le ${today}</p>
    </div></div>

    <h2>Résultat de Minsouah ${result.year}</h2>
    <div class="note">Le chiffre d'affaires de Minsouah correspond aux <b>commissions acquises</b> — et non aux loyers encaissés pour le compte des propriétaires, qui sont présentés séparément.</div>
    <div class="kgrid">
      ${kpi('CA — commissions', fCFA(c.minsouah.ca), '#b45309')}
      ${kpi('Charges de fonctionnement', fCFA(c.minsouah.charges), '#b91c1c')}
      ${kpi('Résultat Minsouah', fCFA(c.minsouah.resultat), c.minsouah.resultat >= 0 ? '#15803d' : '#b91c1c')}
      ${kpi('Taux de recouvrement', c.recovery.taux + '%', '#785a00')}
    </div>

    <h2>Fonds des propriétaires (hors résultat Minsouah)</h2>
    <div class="kgrid">
      ${kpi('Loyers collectés', fCFA(c.ownersFunds.collected), '#15803d')}
      ${kpi('Net dû aux propriétaires', fCFA(c.ownersFunds.netDu), '#0f766e')}
      ${kpi('Reversé (validé)', fCFA(c.ownersFunds.reversed), '#0369a1')}
      ${kpi('En attente de reversement', fCFA(c.ownersFunds.pending), '#b45309')}
    </div>

    <h2>Évolution mensuelle — consolidé</h2>
    ${monthTable(c.monthly)}

    <h2>Patrimoine & activité — consolidé</h2>
    <div class="pat">
      <div class="pat-i"><span>Biens gérés</span><b>${fNum(c.patrimoine.properties)}</b></div>
      <div class="pat-i"><span>Unités</span><b>${fNum(c.patrimoine.units)}</b></div>
      <div class="pat-i"><span>Occupation</span><b>${c.patrimoine.occupancy}%</b></div>
      <div class="pat-i"><span>Unités vacantes</span><b>${fNum(c.patrimoine.vacant)}</b></div>
      <div class="pat-i"><span>Mandats actifs</span><b>${fNum(c.patrimoine.activeContracts)}</b></div>
      <div class="pat-i"><span>Mandats résiliés</span><b>${fNum(c.patrimoine.resilieContracts)}</b></div>
      <div class="pat-i"><span>Nouveaux contrats</span><b>${fNum(c.patrimoine.newContracts)}</b></div>
      <div class="pat-i"><span>Propriétaires</span><b>${fNum(c.patrimoine.owners)}</b></div>
      <div class="pat-i"><span>Locataires</span><b>${fNum(c.patrimoine.tenants)}</b></div>
      <div class="pat-i"><span>Impayés</span><b>${fNum(c.recovery.impaye)}</b></div>
      <div class="pat-i"><span>Maintenance (demandes)</span><b>${fNum(c.maintenance.total)} (${fNum(c.maintenance.done)} faites)</b></div>
      <div class="pat-i"><span>Coût maintenance</span><b>${fNum(c.maintenance.cost)}</b></div>
      <div class="pat-i"><span>Cautions détenues</span><b>${fNum(c.cautions.held)}</b></div>
      <div class="pat-i"><span>Cautions restituées</span><b>${fNum(c.cautions.refundedYear)}</b></div>
    </div>

    ${result.agencies.length > 1 ? '<h2>Détail par agence</h2>' + result.agencies.map(agencySection).join('') : ''}

    <h2>Perspectives & objectifs ${nextYear}</h2>
    <div class="obj"><ul>${objectives.map(o => `<li>${o}</li>`).join('')}</ul>
      <p style="font-size:10px;color:#777;margin:8px 0 0">Suggestions générées à partir des chiffres de l'exercice ${result.year}. À valider et ajuster en assemblée.</p>
    </div>

    <div class="foot"><span>${company} — Document confidentiel (AG ${result.year})</span><span>${today}</span></div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
}
