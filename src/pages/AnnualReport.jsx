import { useState, useMemo, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { loadXLSX } from '../lib/lazyXlsx';
import { loadPptx } from '../lib/lazyPptx';
import { computeMonthMetrics, MM_MONTH_NAMES } from '../lib/monthMetrics';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatFCFA } from '../lib/format';

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

// Sections qualitatives du rapport complet (saisies par le gérant, par agence+exercice).
const COMMENT_FIELDS = [
  { key: 'motGerant', label: 'Mot du gérant', ph: "Message d'introduction du gérant pour l'assemblée…" },
  { key: 'presentation', label: "Présentation de l'agence", ph: 'Présentation générale, faits marquants de l’exercice…' },
  { key: 'rappelObjectifs', label: "Rappel des objectifs de l'exercice", ph: 'Objectifs fixés en début d’exercice…' },
  { key: 'difficultes', label: 'Difficultés rencontrées', ph: 'Une difficulté par ligne (financière, technique, juridique…)' },
  { key: 'evaluation', label: 'Évaluation globale des performances', ph: 'Analyse : financier, commercial, opérationnel, gouvernance…' },
  { key: 'recommandations', label: 'Recommandations du gérant', ph: 'Mesures correctives proposées…' },
  { key: 'planAction', label: "Plan d'action — année suivante", ph: 'Un objectif par ligne (intitulé, cible, échéance…)' },
  { key: 'conclusion', label: 'Conclusion', ph: 'Conclusion générale du rapport…' },
];
const EMPTY_COMMENTS = Object.fromEntries(COMMENT_FIELDS.map(f => [f.key, '']));

// Trame de la présentation d'Assemblée Générale (15 diapositives).
const SLIDES = [
  { n: 1, t: 'Page de couverture' }, { n: 2, t: 'Mot du gérant' }, { n: 3, t: 'Présentation de Minsouah' },
  { n: 4, t: 'Portefeuille immobilier' }, { n: 5, t: 'Résultats financiers' }, { n: 6, t: 'Gestion locative' },
  { n: 7, t: 'Situation des propriétaires' }, { n: 8, t: 'Recouvrement des loyers' }, { n: 9, t: 'Reversements propriétaires' },
  { n: 10, t: 'Maintenance et travaux' }, { n: 11, t: 'Développement commercial' }, { n: 12, t: 'Difficultés et risques' },
  { n: 13, t: 'Évaluation des performances' }, { n: 14, t: 'Plan stratégique N+1' }, { n: 15, t: 'Recommandations et décisions' },
];
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textToHTML = (s) => esc(s).split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('') || '<p style="color:#aaa">—</p>';
const textToList = (s) => { const items = esc(s).split('\n').map(l => l.trim()).filter(Boolean); return items.length ? '<ul>' + items.map(l => `<li>${l}</li>`).join('') + '</ul>' : '<p style="color:#aaa">—</p>'; };

// Comparaison exercice N vs N-1.
const hasPrevData = (p) => !!p && (p.minsouah.ca + p.recovery.collecte + p.patrimoine.properties + p.ownersFunds.reversed) > 0;
function cmpRows(d, p) {
  const pctDelta = (n, o) => o > 0 ? Math.round(((n - o) / o) * 100) : (n > 0 ? null : 0); // null = non calculable
  const defs = [
    { label: 'CA (commissions)', n: d.minsouah.ca, o: p.minsouah.ca, t: 'fcfa' },
    { label: 'Résultat Minsouah', n: d.minsouah.resultat, o: p.minsouah.resultat, t: 'fcfa' },
    { label: 'Charges', n: d.minsouah.charges, o: p.minsouah.charges, t: 'fcfa' },
    { label: 'Loyers encaissés', n: d.recovery.collecte, o: p.recovery.collecte, t: 'fcfa' },
    { label: 'Impayés', n: d.recovery.impaye, o: p.recovery.impaye, t: 'fcfa' },
    { label: 'Reversé propriétaires', n: d.ownersFunds.reversed, o: p.ownersFunds.reversed, t: 'fcfa' },
    { label: 'Biens gérés', n: d.patrimoine.properties, o: p.patrimoine.properties, t: 'num' },
    { label: 'Mandats actifs', n: d.patrimoine.activeContracts, o: p.patrimoine.activeContracts, t: 'num' },
    { label: 'Taux de recouvrement', n: d.recovery.taux, o: p.recovery.taux, t: 'pct' },
    { label: "Taux d'occupation", n: d.patrimoine.occupancy, o: p.patrimoine.occupancy, t: 'pct' },
  ];
  return defs.map(r => ({ ...r, delta: r.n - r.o, pct: r.t === 'pct' ? (r.n - r.o) : pctDelta(r.n, r.o) }));
}
const cmpVal = (v, t) => t === 'pct' ? v + '%' : (t === 'num' ? fNum(v) : fCFA(v));
const cmpDelta = (r) => (r.delta >= 0 ? '+' : '') + (r.t === 'pct' ? r.delta + ' pts' : (r.t === 'num' ? fNum(r.delta) : fCFA(r.delta)));
const cmpEvol = (r) => r.t === 'pct' ? ((r.pct >= 0 ? '+' : '') + r.pct + ' pts') : (r.pct === null ? 'n/d' : (r.pct >= 0 ? '+' : '') + r.pct + '%');
function compTableHTML(d, p, year) {
  const rows = cmpRows(d, p);
  return `<table><thead><tr><th>Indicateur</th><th class="r">${year}</th><th class="r">${year - 1}</th><th class="r">Écart</th><th class="r">Évolution</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r.label}</td><td class="r">${cmpVal(r.n, r.t)}</td><td class="r" style="color:#777">${cmpVal(r.o, r.t)}</td>
      <td class="r">${cmpDelta(r)}</td><td class="r" style="color:${r.pct === null ? '#777' : (r.pct >= 0 ? '#15803d' : '#b91c1c')};font-weight:700">${cmpEvol(r)}</td></tr>`).join('')}</tbody></table>`;
}

/* Bilan annuel d'UNE agence à partir de ses données brutes. */
function computeAgencyYear({ year, payments, transactions, contracts, tenants, properties, owners, bordereaux, tickets, prospects }) {
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

  // Commercial (prospection) — prospects créés dans l'exercice.
  const converti = (p) => /converti|gagn|sign/i.test(String(p.status || ''));
  const yearProspects = (prospects || []).filter(p => !(p.createdAt || p.date) || inYear(p.createdAt || p.date, year));
  const nP = yearProspects.length;
  const commercial = {
    prospects: nP,
    proprio: yearProspects.filter(p => /propri/i.test(String(p.type || ''))).length,
    locataire: yearProspects.filter(p => /locat/i.test(String(p.type || ''))).length,
    visites: yearProspects.reduce((s, p) => s + (Number(p.nbVisites) || 0), 0),
    mandats: yearProspects.filter(converti).length,
    conversion: nP > 0 ? Math.round((yearProspects.filter(converti).length / nP) * 100) : 0,
  };

  return { monthly, minsouah, recovery, ownersFunds, patrimoine, maintenance, cautions, commercial };
}

function consolidate(agenciesData, key = 'data') {
  const monthly = MM_MONTH_NAMES.map((name, i) => {
    const acc = { mois: name, collecte: 0, impaye: 0, commission: 0, charges: 0, resultat: 0, reverse: 0 };
    agenciesData.forEach(a => {
      const m = a[key].monthly[i];
      acc.collecte += m.collecte; acc.impaye += m.impaye; acc.commission += m.commission;
      acc.charges += m.charges; acc.resultat += m.resultat; acc.reverse += m.reverse;
    });
    acc.recouvrement = (acc.collecte + acc.impaye) > 0 ? Math.round((acc.collecte / (acc.collecte + acc.impaye)) * 100) : 0;
    return acc;
  });
  const add = (grp, keys) => keys.reduce((o, k) => { o[k] = agenciesData.reduce((s, a) => s + a[key][grp][k], 0); return o; }, {});
  const minsouah = add('minsouah', ['ca', 'charges', 'resultat']);
  const ownersFunds = add('ownersFunds', ['collected', 'netDu', 'reversed', 'pending']);
  const recovery = add('recovery', ['collecte', 'impaye']);
  recovery.taux = (recovery.collecte + recovery.impaye) > 0 ? Math.round((recovery.collecte / (recovery.collecte + recovery.impaye)) * 100) : 0;
  const patrimoine = add('patrimoine', ['properties', 'units', 'occupied', 'vacant', 'activeContracts', 'resilieContracts', 'newContracts', 'owners', 'tenants']);
  patrimoine.occupancy = patrimoine.units > 0 ? Math.round((patrimoine.occupied / patrimoine.units) * 100) : 0;
  const maintenance = add('maintenance', ['total', 'done', 'pending', 'cost']);
  const cautions = add('cautions', ['held', 'refundedYear']);
  const commercial = add('commercial', ['prospects', 'proprio', 'locataire', 'visites', 'mandats']);
  commercial.conversion = commercial.prospects > 0 ? Math.round((commercial.mandats / commercial.prospects) * 100) : 0;
  return { monthly, minsouah, recovery, ownersFunds, patrimoine, maintenance, cautions, commercial };
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
  const [scope, setScope] = useState(''); // '' = 1re agence ; 'ALL' = consolidé ; sinon un id d'agence
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [comments, setComments] = useState(EMPTY_COMMENTS);
  const [cmtSaving, setCmtSaving] = useState(false);
  const [cmtMsg, setCmtMsg] = useState('');
  const [slides, setSlides] = useState(SLIDES.map(s => s.n)); // diapositives sélectionnées
  const [showSlideSel, setShowSlideSel] = useState(false);
  const [status, setStatus] = useState('Brouillon');
  const [history, setHistory] = useState([]);

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
          const [payments, transactions, contracts, tenants, properties, owners, bordereaux, tickets, prospects] = await Promise.all([
            fetchOrgCollection('payments', ag.id),
            fetchOrgCollection('transactions', ag.id),
            fetchOrgCollection('contracts', ag.id),
            fetchOrgCollection('tenants', ag.id),
            fetchOrgCollection('properties', ag.id),
            fetchOrgCollection('owners', ag.id),
            fetchOrgCollection('bordereaux', ag.id),
            fetchOrgCollection('tickets', ag.id),
            fetchOrgCollection('prospects', ag.id).catch(() => []),
          ]);
          const raw = { payments, transactions, contracts, tenants, properties, owners, bordereaux, tickets, prospects };
          const data = computeAgencyYear({ year, ...raw });
          const dataPrev = computeAgencyYear({ year: year - 1, ...raw });
          agenciesData.push({ id: ag.id, name: ag.name, data, dataPrev });
        } catch (e) {
          console.warn('[AnnualReport] agence ignorée', ag.name, e?.code || e?.message);
          skipped.push(ag.name);
        }
      }
      if (!agenciesData.length) {
        setError("Aucune donnée d'agence lisible. Vérifiez que la règle multi-agences est déployée."); setBusy(false); return;
      }
      setResult({ year, agencies: agenciesData, consolidated: consolidate(agenciesData, 'data'), consolidatedPrev: consolidate(agenciesData, 'dataPrev'), skipped });
      setProgress('');
    } catch (e) { setError(e?.message || 'Erreur lors de la génération.'); }
    finally { setBusy(false); }
  }

  async function exportExcel() {
    if (!result || !view) return;
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const c = view.d;
    const synth = [
      [`RAPPORT D'EXERCICE ${result.year} — ${view.isAll ? 'TOUTES AGENCES' : (view.label || '').toUpperCase()}`], [],
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rowsOf(c.monthly)]), view.isAll ? 'Mensuel consolidé' : 'Mensuel');
    if (view.isAll) {
      result.agencies.forEach(a => {
        const safe = (a.name || 'Agence').replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Agence';
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rowsOf(a.data.monthly)]), safe);
      });
    }
    const slug = (view.isAll ? 'toutes_agences' : (view.label || 'agence')).replace(/[^a-zA-Z0-9]+/g, '_');
    XLSX.writeFile(wb, `Rapport_exercice_${result.year}_${slug}.xlsx`);
  }

  function exportPDF() {
    if (!result || !view) return;
    const html = buildReportHTML(view, result.year, state.orgSettings || {});
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (win) { win.document.write(html); win.document.close(); } else alert('Autorisez les pop-ups pour le PDF.');
  }

  // Portée affichée/exportée : une agence précise, ou le consolidé (« ALL »).
  const effectiveScope = (scope === 'ALL' || (scope && agencies.some(a => a.id === scope)))
    ? scope : (agencies[0]?.id || 'ALL');
  const view = useMemo(() => {
    if (!result) return null;
    if (effectiveScope === 'ALL') return { d: result.consolidated, dPrev: result.consolidatedPrev, label: 'toutes agences', agencies: result.agencies, isAll: true };
    const a = result.agencies.find(x => x.id === effectiveScope) || result.agencies[0];
    return { d: a.data, dPrev: a.dataPrev, label: a.name, agencies: [], isAll: false };
  }, [result, effectiveScope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Commentaires éditables : par AGENCE + exercice (pas en mode consolidé).
  const commentId = effectiveScope !== 'ALL' ? `${effectiveScope}__${year}` : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!commentId) { setComments(EMPTY_COMMENTS); setStatus('Brouillon'); setHistory([]); return; }
      try {
        const snap = await getDoc(doc(db, 'workspaces', WS, 'annualReports', commentId));
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : {};
        setComments({ ...EMPTY_COMMENTS, ...data });
        setStatus(data.status || 'Brouillon');
        setHistory(Array.isArray(data.history) ? data.history : []);
      } catch { if (!cancelled) { setComments(EMPTY_COMMENTS); setStatus('Brouillon'); setHistory([]); } }
    })();
    return () => { cancelled = true; };
  }, [commentId]);

  const locked = status === 'Validé' || status === 'Archivé';
  const STATUS_STYLE = {
    'Brouillon': 'bg-surface-container-high text-on-surface-variant',
    'Soumis à validation': 'bg-amber-100 text-amber-800',
    'Validé': 'bg-green-100 text-green-700',
    'Archivé': 'bg-blue-100 text-blue-800',
  };

  async function changeStatus(newStatus) {
    if (!commentId) return;
    const entry = { status: newStatus, at: new Date().toISOString(), by: user?.name || user?.email || 'Administrateur' };
    const newHist = [...history, entry];
    try {
      await setDoc(doc(db, 'workspaces', WS, 'annualReports', commentId),
        { status: newStatus, history: newHist, orgId: effectiveScope, year, updatedAt: entry.at }, { merge: true });
      setStatus(newStatus); setHistory(newHist);
      setCmtMsg(`Statut : ${newStatus}`); setTimeout(() => setCmtMsg(''), 4000);
    } catch (e) { setCmtMsg('Échec : ' + (e?.code || e?.message)); }
  }

  async function saveComments() {
    if (!commentId || locked) return;
    setCmtSaving(true); setCmtMsg('');
    try {
      const payload = {}; COMMENT_FIELDS.forEach(f => { payload[f.key] = comments[f.key] || ''; });
      await setDoc(doc(db, 'workspaces', WS, 'annualReports', commentId),
        { ...payload, orgId: effectiveScope, year, updatedAt: new Date().toISOString() }, { merge: true });
      setCmtMsg('Commentaires enregistrés ✓');
    } catch (e) { setCmtMsg("Échec de l'enregistrement : " + (e?.code || e?.message)); }
    finally { setCmtSaving(false); setTimeout(() => setCmtMsg(''), 4000); }
  }

  function exportFullPDF() {
    if (!result || !view) return;
    const html = buildFullReportHTML(view, result.year, state.orgSettings || {}, comments);
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (win) { win.document.write(html); win.document.close(); } else alert('Autorisez les pop-ups pour le PDF.');
  }

  function exportSlidesPDF() {
    if (!result || !view) return;
    const sel = SLIDES.filter(s => slides.includes(s.n)).map(s => s.n);
    if (!sel.length) { alert('Sélectionnez au moins une diapositive.'); return; }
    const html = buildSlidesHTML(view, result.year, state.orgSettings || {}, comments, sel);
    const win = window.open('', '_blank', 'width=1100,height=750');
    if (win) { win.document.write(html); win.document.close(); } else alert('Autorisez les pop-ups pour le PDF.');
  }
  const toggleSlide = (n) => setSlides(s => s.includes(n) ? s.filter(x => x !== n) : [...s, n]);

  // Export Word (.doc) : le rapport complet, ouvrable et éditable dans Word.
  function exportWord() {
    if (!result || !view) return;
    const html = buildFullReportHTML(view, result.year, state.orgSettings || {}, comments);
    const blob = new Blob(['﻿' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Rapport_annuel_${result.year}_${(view.label || 'agence').replace(/[^a-zA-Z0-9]+/g, '_')}.doc`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // Export PowerPoint (.pptx) éditable (pptxgenjs chargé à la demande).
  async function exportPptx() {
    if (!result || !view) return;
    setCmtMsg('Génération PowerPoint…');
    try {
      const Pptx = await loadPptx();
      const pptx = new Pptx();
      pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
      pptx.layout = 'WIDE';
      const c = view.d; const nextYear = result.year + 1; const cm = comments || {};
      const org = state.orgSettings || {}; const company = org.companyName || 'Minsouah';
      const scopeName = view.isAll ? 'Toutes les agences (consolidé)' : view.label;
      const BR = '785A00';
      const sel = SLIDES.filter(s => slides.includes(s.n)).map(s => s.n);
      const titleSlide = (n, title) => {
        const s = pptx.addSlide();
        s.addShape('rect', { x: 0, y: 0, w: '100%', h: 0.9, fill: { color: BR } });
        s.addText(`${n}. ${title}`, { x: 0.4, y: 0.15, w: 12.5, h: 0.6, color: 'FFFFFF', fontSize: 24, bold: true });
        s.addText(`${company} — ${scopeName} · Exercice ${result.year}`, { x: 0.4, y: 7.05, w: 12.5, h: 0.3, fontSize: 10, color: '999999' });
        return s;
      };
      const kpiRows = (s, pairs, y0 = 1.3) => pairs.forEach((p, i) => {
        const col = i % 3, row = Math.floor(i / 3); const x = 0.5 + col * 4.25, y = y0 + row * 1.5;
        s.addShape('roundRect', { x, y, w: 3.95, h: 1.3, rectRadius: 0.1, fill: { color: 'F7F5EF' }, line: { color: 'EEE8DA' } });
        s.addText(p[0], { x: x + 0.2, y: y + 0.15, w: 3.6, h: 0.3, fontSize: 11, color: '999999' });
        s.addText(String(p[1]), { x: x + 0.2, y: y + 0.5, w: 3.6, h: 0.6, fontSize: 20, bold: true, color: p[2] || '222222' });
      });
      const textSlide = (n, title, txt) => titleSlide(n, title).addText(String(txt || '—'), { x: 0.5, y: 1.3, w: 12.3, h: 5.5, fontSize: 16, color: '333333', valign: 'top' });
      const listSlide = (n, title, txt) => { const s = titleSlide(n, title); const items = String(txt || '').split('\n').map(l => l.trim()).filter(Boolean); s.addText(items.length ? items.map(t => ({ text: t, options: { bullet: true } })) : [{ text: '—' }], { x: 0.6, y: 1.3, w: 12, h: 5.5, fontSize: 16, color: '333333', valign: 'top' }); };

      for (const n of sel) {
        if (n === 1) { const s = pptx.addSlide(); s.background = { color: 'FFFAF0' }; s.addText(company, { x: 0.5, y: 2.3, w: 12.3, h: 1, fontSize: 44, bold: true, color: BR, align: 'center' }); s.addText(`Assemblée Générale — Exercice ${result.year}`, { x: 0.5, y: 3.6, w: 12.3, h: 0.6, fontSize: 24, color: '333333', align: 'center' }); s.addText(scopeName, { x: 0.5, y: 4.4, w: 12.3, h: 0.5, fontSize: 16, color: '777777', align: 'center' }); continue; }
        if (n === 2) { textSlide(2, 'Mot du gérant', cm.motGerant); continue; }
        if (n === 3) { const s = titleSlide(3, 'Présentation de Minsouah'); s.addText(String(cm.presentation || '—'), { x: 0.5, y: 1.2, w: 12.3, h: 2.4, fontSize: 15, color: '333333', valign: 'top' }); kpiRows(s, [['Biens gérés', fNum(c.patrimoine.properties)], ['Propriétaires', fNum(c.patrimoine.owners)], ['Locataires', fNum(c.patrimoine.tenants)]], 4.2); continue; }
        if (n === 4) { kpiRows(titleSlide(4, 'Portefeuille immobilier'), [['Biens / Unités', `${c.patrimoine.properties} / ${c.patrimoine.units}`], ['Occupation', c.patrimoine.occupancy + '%'], ['Unités vacantes', fNum(c.patrimoine.vacant)], ['Mandats actifs', fNum(c.patrimoine.activeContracts)]]); continue; }
        if (n === 5) { kpiRows(titleSlide(5, 'Résultats financiers'), [['CA (commissions)', fCFA(c.minsouah.ca), 'B45309'], ['Charges', fCFA(c.minsouah.charges), 'B91C1C'], ['Résultat Minsouah', fCFA(c.minsouah.resultat), c.minsouah.resultat >= 0 ? '15803D' : 'B91C1C'], ['Recouvrement', c.recovery.taux + '%', '785A00']]); continue; }
        if (n === 6) { kpiRows(titleSlide(6, 'Gestion locative'), [['Mandats actifs', fNum(c.patrimoine.activeContracts)], ['Mandats résiliés', fNum(c.patrimoine.resilieContracts)], ['Nouveaux contrats', fNum(c.patrimoine.newContracts)], ['Occupation', c.patrimoine.occupancy + '%']]); continue; }
        if (n === 7) { kpiRows(titleSlide(7, 'Situation des propriétaires'), [['Loyers collectés', fCFA(c.ownersFunds.collected)], ['Net dû proprios', fCFA(c.ownersFunds.netDu)], ['Reversé', fCFA(c.ownersFunds.reversed)], ['En attente', fCFA(c.ownersFunds.pending)]]); continue; }
        if (n === 8) { kpiRows(titleSlide(8, 'Recouvrement des loyers'), [['Encaissé', fCFA(c.recovery.collecte), '15803D'], ['Impayés', fCFA(c.recovery.impaye), 'B91C1C'], ['Taux de recouvrement', c.recovery.taux + '%', '785A00']]); continue; }
        if (n === 9) { kpiRows(titleSlide(9, 'Reversements propriétaires'), [['Reversé (validé)', fCFA(c.ownersFunds.reversed)], ['En attente', fCFA(c.ownersFunds.pending)]]); continue; }
        if (n === 10) { kpiRows(titleSlide(10, 'Maintenance et travaux'), [['Demandes', fNum(c.maintenance.total)], ['Réalisées', fNum(c.maintenance.done)], ['En attente', fNum(c.maintenance.pending)], ['Coût (devis)', fCFA(c.maintenance.cost)]]); continue; }
        if (n === 11) { const s = titleSlide(11, 'Développement commercial'); const cc = c.commercial; if (cc && cc.prospects > 0) { kpiRows(s, [['Prospects', fNum(cc.prospects)], ['Visites', fNum(cc.visites)], ['Mandats obtenus', fNum(cc.mandats)], ['Taux de conversion', cc.conversion + '%']]); } else { s.addText('Données commerciales non disponibles.', { x: 0.5, y: 1.5, w: 12, h: 1, fontSize: 16, color: '9A3412' }); } continue; }
        if (n === 12) { listSlide(12, 'Difficultés et risques', cm.difficultes); continue; }
        if (n === 13) { textSlide(13, 'Évaluation des performances', cm.evaluation); continue; }
        if (n === 14) { const s = titleSlide(14, `Plan stratégique ${nextYear}`); const items = String(cm.planAction || '').split('\n').map(l => l.trim()).filter(Boolean); const objs = buildObjectives(nextYear, c); s.addText([...items, ...objs].map(t => ({ text: t, options: { bullet: true } })), { x: 0.6, y: 1.3, w: 12, h: 5.5, fontSize: 14, color: '333333', valign: 'top' }); continue; }
        if (n === 15) { textSlide(15, 'Recommandations et décisions', cm.recommandations); continue; }
      }
      await pptx.writeFile({ fileName: `Presentation_AG_${result.year}_${(view.label || 'agence').replace(/[^a-zA-Z0-9]+/g, '_')}.pptx` });
      setCmtMsg('');
    } catch (e) { setCmtMsg('Échec PowerPoint : ' + (e?.message || e)); setTimeout(() => setCmtMsg(''), 5000); }
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
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Agence</label>
          <select value={effectiveScope} onChange={e => setScope(e.target.value)}
            className="border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary min-w-[200px]">
            {agencies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            {agencies.length > 1 && <option value="ALL">Toutes les agences (consolidé)</option>}
          </select>
        </div>
        <div className="flex-1" />
        <button onClick={generate} disabled={busy || !agencies.length}
          className="inline-flex items-center gap-2 bg-primary text-on-primary font-semibold rounded-lg px-4 py-2.5 text-sm hover:bg-primary/90 disabled:opacity-50">
          {busy ? <><Icon name="progress_activity" size={18} className="animate-spin" /> Génération…</>
                : <><Icon name="query_stats" size={18} /> Générer le rapport</>}
        </button>
      </div>

      {progress && <p className="text-sm text-on-surface-variant flex items-center gap-2"><Icon name="progress_activity" size={16} className="animate-spin" /> {progress}</p>}
      {error && <div className="bg-error/10 border border-error/20 text-error rounded-xl px-4 py-3 text-sm">{error}</div>}

      {result && view && (
        <div className="flex flex-col gap-md">
          {result.skipped?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
              Agence(s) non lue(s) (accès refusé) : {result.skipped.join(', ')}. Déconnectez-vous/reconnectez-vous une fois si besoin.
            </div>
          )}
          <div className="flex gap-sm flex-wrap items-center">
            <span className="text-sm text-on-surface-variant mr-1">Rapport : <b className="text-on-surface">{view.isAll ? 'Toutes les agences (consolidé)' : view.label}</b></span>
            <button onClick={exportPDF} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="picture_as_pdf" size={18} /> Synthèse PDF</button>
            <button onClick={exportExcel} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="table_view" size={18} /> Exporter Excel</button>
            <button onClick={exportFullPDF} className="inline-flex items-center gap-2 bg-primary text-on-primary font-semibold rounded-lg px-4 py-2 text-sm hover:bg-primary/90"><Icon name="description" size={18} /> Rapport complet (PDF)</button>
            <button onClick={exportWord} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="article" size={18} /> Word</button>
            <button onClick={exportSlidesPDF} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="slideshow" size={18} /> Présentation AG (PDF)</button>
            <button onClick={exportPptx} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30"><Icon name="co_present" size={18} /> PowerPoint</button>
            <button onClick={() => setShowSlideSel(v => !v)} className="inline-flex items-center gap-1 text-primary text-sm font-semibold px-2 py-2 hover:underline"><Icon name="tune" size={16} /> Diapos ({slides.length}/15)</button>
          </div>

          {showSlideSel && (
            <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Diapositives à inclure dans la présentation AG</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {SLIDES.map(s => (
                  <label key={s.n} className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                    <input type="checkbox" checked={slides.includes(s.n)} onChange={() => toggleSlide(s.n)} className="accent-primary" />
                    <span className="text-on-surface-variant">{s.n}.</span> {s.t}
                  </label>
                ))}
              </div>
            </div>
          )}
          <AgencyCard title={`${view.isAll ? 'Consolidé — toutes agences' : view.label} (${result.year})`} d={view.d} highlight />
          <Comparison d={view.d} dPrev={view.dPrev} year={result.year} />
          <Charts d={view.d} year={result.year} />
          {view.isAll && result.agencies.map(a => <AgencyCard key={a.id} title={a.name} d={a.data} />)}

          {!view.isAll ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold text-on-surface text-sm flex items-center gap-2">
                  <Icon name="edit_note" size={18} className="text-primary" /> Commentaires du rapport — {view.label} {result.year}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[status] || 'bg-surface-container-high'}`}>{status}</span>
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {cmtMsg && <span className="text-xs text-on-surface-variant">{cmtMsg}</span>}
                  {!locked && (
                    <button onClick={saveComments} disabled={cmtSaving} className="inline-flex items-center gap-1.5 bg-primary text-on-primary font-semibold rounded-lg px-3 py-1.5 text-xs hover:bg-primary/90 disabled:opacity-50">
                      {cmtSaving ? <><Icon name="progress_activity" size={14} className="animate-spin" /> …</> : <><Icon name="save" size={14} /> Enregistrer</>}
                    </button>
                  )}
                </div>
              </div>
              {/* Workflow de validation */}
              <div className="flex items-center gap-2 flex-wrap">
                {status === 'Brouillon' && <button onClick={() => changeStatus('Soumis à validation')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50">Soumettre à validation</button>}
                {status === 'Soumis à validation' && <>
                  <button onClick={() => changeStatus('Validé')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200">Valider</button>
                  <button onClick={() => changeStatus('Brouillon')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high">Renvoyer en brouillon</button>
                </>}
                {status === 'Validé' && <>
                  <button onClick={() => changeStatus('Archivé')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200">Archiver</button>
                  <button onClick={() => changeStatus('Brouillon')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high">Rouvrir (modifier)</button>
                </>}
                {status === 'Archivé' && <button onClick={() => changeStatus('Brouillon')} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-high">Rouvrir (modifier)</button>}
              </div>
              <p className="text-xs text-on-surface-variant">{locked
                ? 'Rapport verrouillé (validé/archivé). Cliquez « Rouvrir » pour modifier les textes.'
                : 'Ces textes sont repris dans le « Rapport complet (PDF) ». Les chiffres, eux, sont calculés automatiquement et non modifiables.'}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {COMMENT_FIELDS.map(f => (
                  <div key={f.key} className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{f.label}</label>
                    <textarea rows={(f.key === 'difficultes' || f.key === 'planAction' || f.key === 'evaluation') ? 4 : 3}
                      value={comments[f.key] || ''} onChange={e => setComments(c => ({ ...c, [f.key]: e.target.value }))} placeholder={f.ph}
                      disabled={locked}
                      className={`w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary resize-y ${locked ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  </div>
                ))}
              </div>
              {history.length > 0 && (
                <div className="mt-1 border-t border-outline-variant/20 pt-2">
                  <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Historique des validations</p>
                  <ul className="flex flex-col gap-0.5">
                    {history.slice().reverse().map((h, i) => (
                      <li key={i} className="text-xs text-on-surface-variant">
                        <span className="font-semibold text-on-surface">{h.status}</span> — {h.at ? new Date(h.at).toLocaleString('fr-FR') : ''}{h.by ? ` · ${h.by}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 text-sm">
              Les commentaires du rapport complet (mot du gérant, difficultés, plan d'action…) se saisissent <b>par agence</b>. Choisissez une agence ci-dessus pour les renseigner et générer son rapport complet.
            </div>
          )}
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
      {d.commercial && d.commercial.prospects > 0 && (
        <Block title="Développement commercial" color="bg-teal-100 text-teal-800" items={[
          { label: 'Prospects', value: fNum(d.commercial.prospects), cls: 'text-blue-700' },
          { label: 'Propriétaires', value: fNum(d.commercial.proprio) },
          { label: 'Locataires', value: fNum(d.commercial.locataire) },
          { label: 'Visites', value: fNum(d.commercial.visites) },
          { label: 'Mandats obtenus', value: fNum(d.commercial.mandats), cls: 'text-green-700' },
          { label: 'Taux de conversion', value: d.commercial.conversion + '%', cls: 'text-primary' },
        ]} />
      )}
    </div>
  );
}

/* ── Comparaison N vs N-1 (écran) ── */
function Comparison({ d, dPrev, year }) {
  if (!hasPrevData(dPrev)) return null;
  const rows = cmpRows(d, dPrev);
  return (
    <div className="rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
      <div className="px-md py-2.5 bg-secondary text-on-primary font-bold text-sm">Comparaison {year} vs {year - 1}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-high">
            <tr>{['Indicateur', year, year - 1, 'Écart', 'Évolution'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {rows.map(r => (
              <tr key={r.label} className="hover:bg-surface-container-low">
                <td className="px-3 py-2 font-medium text-on-surface">{r.label}</td>
                <td className="px-3 py-2">{cmpVal(r.n, r.t)}</td>
                <td className="px-3 py-2 text-on-surface-variant">{cmpVal(r.o, r.t)}</td>
                <td className="px-3 py-2">{cmpDelta(r)}</td>
                <td className={`px-3 py-2 font-semibold ${r.pct === null ? 'text-on-surface-variant' : (r.pct >= 0 ? 'text-green-700' : 'text-red-700')}`}>{cmpEvol(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Graphiques d'analyse (écran) ── */
function Charts({ d, year }) {
  const data = d.monthly.map(m => ({
    mois: m.mois.slice(0, 3),
    'Encaissé': m.collecte, 'Impayés': m.impaye,
    'Commission': m.commission, 'Charges': m.charges, 'Résultat': m.resultat,
    'Reversé': m.reverse, 'Recouvrement': m.recouvrement,
  }));
  const kFmt = (v) => Math.round((Number(v) || 0) / 1000) + 'k';
  const fcfa = formatFCFA;
  const box = 'bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-md">
      <div className={box}>
        <p className="font-semibold text-sm mb-2 text-on-surface">Loyers encaissés vs impayés — {year}</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mois" fontSize={11} /><YAxis fontSize={10} tickFormatter={kFmt} /><Tooltip formatter={fcfa} /><Legend />
            <Bar dataKey="Encaissé" fill="#15803d" /><Bar dataKey="Impayés" fill="#dc2626" /></BarChart>
        </ResponsiveContainer>
      </div>
      <div className={box}>
        <p className="font-semibold text-sm mb-2 text-on-surface">CA (commissions), charges & résultat Minsouah</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mois" fontSize={11} /><YAxis fontSize={10} tickFormatter={kFmt} /><Tooltip formatter={fcfa} /><Legend />
            <Line dataKey="Commission" stroke="#b45309" strokeWidth={2} dot={false} /><Line dataKey="Charges" stroke="#dc2626" strokeWidth={2} dot={false} /><Line dataKey="Résultat" stroke="#15803d" strokeWidth={2} dot={false} /></LineChart>
        </ResponsiveContainer>
      </div>
      <div className={box}>
        <p className="font-semibold text-sm mb-2 text-on-surface">Reversements propriétaires (validés)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mois" fontSize={11} /><YAxis fontSize={10} tickFormatter={kFmt} /><Tooltip formatter={fcfa} />
            <Bar dataKey="Reversé" fill="#0369a1" /></BarChart>
        </ResponsiveContainer>
      </div>
      <div className={box}>
        <p className="font-semibold text-sm mb-2 text-on-surface">Taux de recouvrement mensuel (%)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mois" fontSize={11} /><YAxis fontSize={10} domain={[0, 100]} /><Tooltip formatter={(v) => v + '%'} />
            <Line dataKey="Recouvrement" stroke="#785a00" strokeWidth={2} /></LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* Graphique SVG inline (encaissé vs impayé + ligne recouvrement) pour le PDF. */
function svgMonthly(monthly) {
  const W = 760, H = 220, pad = 34;
  const max = Math.max(1, ...monthly.map(m => Math.max(m.collecte, m.impaye)));
  const bw = (W - pad * 2) / monthly.length;
  const chartH = H - pad * 2;
  const bars = monthly.map((m, i) => {
    const x = pad + i * bw;
    const h1 = (m.collecte / max) * chartH, h2 = (m.impaye / max) * chartH;
    return `<rect x="${(x + 2).toFixed(1)}" y="${(H - pad - h1).toFixed(1)}" width="${(bw / 2 - 3).toFixed(1)}" height="${h1.toFixed(1)}" fill="#15803d"/>` +
           `<rect x="${(x + bw / 2).toFixed(1)}" y="${(H - pad - h2).toFixed(1)}" width="${(bw / 2 - 3).toFixed(1)}" height="${h2.toFixed(1)}" fill="#dc2626"/>` +
           `<text x="${(x + bw / 2).toFixed(1)}" y="${H - pad + 12}" font-size="9" text-anchor="middle" fill="#777">${m.mois.slice(0, 3)}</text>`;
  }).join('');
  // ligne recouvrement (0-100%)
  const pts = monthly.map((m, i) => `${(pad + i * bw + bw / 2).toFixed(1)},${(H - pad - (m.recouvrement / 100) * chartH).toFixed(1)}`).join(' ');
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="max-width:760px">
    <line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="#ccc"/>
    ${bars}
    <polyline points="${pts}" fill="none" stroke="#785a00" stroke-width="2"/>
    <g font-size="9">
      <rect x="${pad}" y="8" width="10" height="10" fill="#15803d"/><text x="${pad + 14}" y="17" fill="#555">Encaissé</text>
      <rect x="${pad + 80}" y="8" width="10" height="10" fill="#dc2626"/><text x="${pad + 94}" y="17" fill="#555">Impayés</text>
      <line x1="${pad + 160}" y1="13" x2="${pad + 175}" y2="13" stroke="#785a00" stroke-width="2"/><text x="${pad + 180}" y="17" fill="#555">Recouvrement %</text>
    </g>
  </svg>`;
}

/* ── HTML imprimable ── */
function buildReportHTML(view, year, org) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const logo = org.logo || ''; const company = org.companyName || 'Minsouah';
  const c = view.d; const nextYear = year + 1;
  const scopeLabel = view.isAll ? 'Bilan consolidé · Toutes agences' : `Agence : ${view.label}`;
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

  return `<!doctype html><html><head><meta charset="utf-8"><title>Rapport d'exercice ${year}</title>
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
      <h1>Rapport d'exercice ${year}${view.isAll ? '' : ' — ' + view.label}</h1>
      <p>${company} — ${scopeLabel} · Édité le ${today}</p>
    </div></div>

    <h2>Résultat de Minsouah ${year}</h2>
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
    <div style="margin-top:12px">${svgMonthly(c.monthly)}</div>

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

    ${view.isAll && view.agencies.length > 1 ? '<h2>Détail par agence</h2>' + view.agencies.map(agencySection).join('') : ''}

    <h2>Perspectives & objectifs ${nextYear}</h2>
    <div class="obj"><ul>${objectives.map(o => `<li>${o}</li>`).join('')}</ul>
      <p style="font-size:10px;color:#777;margin:8px 0 0">Suggestions générées à partir des chiffres de l'exercice ${year}. À valider et ajuster en assemblée.</p>
    </div>

    <div class="foot"><span>${company} — Document confidentiel (AG ${year})</span><span>${today}</span></div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
}

/* ── RAPPORT COMPLET (18 sections) : chiffres calculés + commentaires du gérant ── */
function buildFullReportHTML(view, year, org, comments) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const logo = org.logo || ''; const company = org.companyName || 'Minsouah';
  const c = view.d; const nextYear = year + 1; const cm = comments || {};
  const scopeName = view.isAll ? 'Toutes les agences (consolidé)' : view.label;
  const objectives = buildObjectives(nextYear, c);

  const mTable = (monthly) => `<table><thead><tr>
      <th>Mois</th><th class="r">Encaissé</th><th class="r">Impayés</th><th class="c">Recouv.</th>
      <th class="r">Commission</th><th class="r">Charges</th><th class="r">Résultat</th><th class="r">Reversé</th>
    </tr></thead><tbody>${monthly.map(m => `<tr><td>${m.mois}</td>
      <td class="r" style="color:#15803d">${fNum(m.collecte)}</td><td class="r" style="color:#b91c1c">${fNum(m.impaye)}</td>
      <td class="c">${m.recouvrement}%</td><td class="r" style="color:#b45309">${fNum(m.commission)}</td>
      <td class="r" style="color:#b91c1c">${fNum(m.charges)}</td><td class="r">${fNum(m.resultat)}</td>
      <td class="r" style="color:#0369a1">${fNum(m.reverse)}</td></tr>`).join('')}</tbody></table>`;

  const kpi = (l, v, color) => `<div class="k"><div class="l">${l}</div><div class="v" style="color:${color || '#222'}">${v}</div></div>`;
  const sec = (n, titre, body) => `<section class="sec"><h2><span class="num">${n}</span>${titre}</h2>${body}</section>`;

  const S = {};
  S[5] = `<div class="pat">
      <div class="pat-i"><span>Biens gérés</span><b>${fNum(c.patrimoine.properties)}</b></div>
      <div class="pat-i"><span>Unités</span><b>${fNum(c.patrimoine.units)}</b></div>
      <div class="pat-i"><span>Occupation</span><b>${c.patrimoine.occupancy}%</b></div>
      <div class="pat-i"><span>Unités vacantes</span><b>${fNum(c.patrimoine.vacant)}</b></div>
      <div class="pat-i"><span>Mandats actifs</span><b>${fNum(c.patrimoine.activeContracts)}</b></div>
      <div class="pat-i"><span>Mandats résiliés</span><b>${fNum(c.patrimoine.resilieContracts)}</b></div>
      <div class="pat-i"><span>Nouveaux contrats</span><b>${fNum(c.patrimoine.newContracts)}</b></div>
      <div class="pat-i"><span>Propriétaires</span><b>${fNum(c.patrimoine.owners)}</b></div>
    </div>`;
  S[6] = `<div class="note">Le chiffre d'affaires de Minsouah correspond aux <b>commissions acquises</b> — pas aux loyers encaissés pour le compte des propriétaires.</div>
    <div class="kgrid">${kpi('CA — commissions', fCFA(c.minsouah.ca), '#b45309')}${kpi('Charges de fonctionnement', fCFA(c.minsouah.charges), '#b91c1c')}${kpi('Résultat Minsouah', fCFA(c.minsouah.resultat), c.minsouah.resultat >= 0 ? '#15803d' : '#b91c1c')}${kpi('Taux de recouvrement', c.recovery.taux + '%', '#785a00')}</div>
    ${mTable(c.monthly)}<div style="margin-top:10px">${svgMonthly(c.monthly)}</div>`;
  S[7] = `<div class="kgrid">${kpi('Loyers collectés', fCFA(c.ownersFunds.collected), '#15803d')}${kpi('Net dû aux propriétaires', fCFA(c.ownersFunds.netDu), '#0f766e')}${kpi('Reversé (validé)', fCFA(c.ownersFunds.reversed), '#0369a1')}${kpi('En attente de reversement', fCFA(c.ownersFunds.pending), '#b45309')}</div>
    <p style="font-size:11px;color:#555">Propriétaires suivis : <b>${fNum(c.patrimoine.owners)}</b>. Les fonds des propriétaires sont présentés séparément du résultat de Minsouah.</p>`;
  S[8] = `<div class="kgrid">${kpi('Occupation', c.patrimoine.occupancy + '%', '#0369a1')}${kpi('Locataires', fNum(c.patrimoine.tenants), '#222')}${kpi('Mandats actifs', fNum(c.patrimoine.activeContracts), '#222')}${kpi('Mandats résiliés', fNum(c.patrimoine.resilieContracts), '#b91c1c')}</div>`;
  S[9] = `<div class="kgrid">${kpi('Loyers encaissés', fCFA(c.recovery.collecte), '#15803d')}${kpi('Impayés (cumul exercice)', fCFA(c.recovery.impaye), '#b91c1c')}${kpi('Taux de recouvrement', c.recovery.taux + '%', '#785a00')}${kpi('Cautions détenues', fCFA(c.cautions.held), '#222')}</div>`;
  S[10] = `<div class="kgrid">${kpi('Reversé (bordereaux validés)', fCFA(c.ownersFunds.reversed), '#0369a1')}${kpi('En attente', fCFA(c.ownersFunds.pending), '#b45309')}</div>`;
  S[11] = `<div class="kgrid">${kpi('Demandes de maintenance', fNum(c.maintenance.total), '#222')}${kpi('Réalisées', fNum(c.maintenance.done), '#15803d')}${kpi('En attente', fNum(c.maintenance.pending), '#b45309')}${kpi('Coût (devis)', fCFA(c.maintenance.cost), '#b91c1c')}</div>`;
  S[12] = (c.commercial && c.commercial.prospects > 0)
    ? `<div class="kgrid">${kpi('Prospects', fNum(c.commercial.prospects), '#0369a1')}${kpi('Prospects propriétaires', fNum(c.commercial.proprio))}${kpi('Prospects locataires', fNum(c.commercial.locataire))}${kpi('Visites', fNum(c.commercial.visites))}${kpi('Mandats / contrats obtenus', fNum(c.commercial.mandats), '#15803d')}${kpi('Taux de conversion', c.commercial.conversion + '%', '#785a00')}</div>`
    : `<div class="note" style="background:#fff7ed;border-color:#fed7aa;color:#9a3412">Suivi commercial (prospects, visites, taux de conversion) : <b>données non disponibles</b> — saisissez vos prospects dans le menu « Prospection ».</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Rapport annuel ${year} — ${scopeName}</title>
  <style>
    *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#222;margin:0;font-size:12px}
    .cover{height:96vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;border-bottom:4px solid #785a00;page-break-after:always}
    .cover img{height:80px;margin-bottom:18px} .cover h1{font-size:34px;color:#785a00;margin:0} .cover h2{font-size:20px;color:#444;margin:8px 0 0;border:none;padding:0}
    .cover p{color:#777;margin-top:16px}
    .wrap{padding:28px}
    .sec{margin-bottom:18px}
    h2{font-size:15px;color:#785a00;margin:18px 0 8px;border-left:4px solid #785a00;padding-left:8px;display:flex;align-items:center;gap:8px}
    h2 .num{background:#785a00;color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
    .note{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;font-size:11px;color:#1e40af;margin:8px 0}
    .kgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}
    .k{border:1px solid #eee;border-radius:8px;padding:8px 10px;background:#fafafa} .k .l{font-size:9px;text-transform:uppercase;color:#999} .k .v{font-size:15px;font-weight:800;margin-top:2px}
    table{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px} th,td{border:1px solid #e5e5e5;padding:5px 7px} th{background:#785a00;color:#fff;text-align:left;font-size:10px;text-transform:uppercase}
    td.r,th.r{text-align:right} td.c,th.c{text-align:center} tbody tr:nth-child(even){background:#faf8f2}
    .pat{display:grid;grid-template-columns:repeat(4,1fr);gap:6px} .pat-i{border:1px solid #eee;border-radius:6px;padding:6px 8px;display:flex;justify-content:space-between;background:#f7fafc} .pat-i span{color:#777;font-size:10px} .pat-i b{font-size:12px}
    .txt p{margin:4px 0;line-height:1.45} .txt ul{margin:4px 0;padding-left:20px} .txt li{margin:3px 0}
    .obj{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 16px} .obj li{margin:4px 0}
    .foot{margin-top:24px;border-top:1px solid #ddd;padding-top:8px;color:#999;font-size:10px;display:flex;justify-content:space-between}
    @media print{.wrap{padding:0 10px}}
  </style></head><body>
    <div class="cover">
      ${logo ? `<img src="${logo}"/>` : ''}
      <h1>${company}</h1>
      <h2>Rapport annuel de gestion — Exercice ${year}</h2>
      <p>${scopeName}<br/>Document préparé pour l'Assemblée Générale · ${today}${cm.status ? `<br/><b>Statut : ${esc(cm.status)}</b>` : ''}</p>
    </div>
    <div class="wrap">
      ${sec(1, 'Présentation', `<div class="txt">${textToHTML(cm.presentation)}</div>`)}
      ${sec(2, 'Mot du gérant', `<div class="txt">${textToHTML(cm.motGerant)}</div>`)}
      ${sec(3, "Rappel des objectifs de l'exercice", `<div class="txt">${textToHTML(cm.rappelObjectifs)}</div>`)}
      ${sec(4, 'Synthèse de l\'exercice', `<div class="kgrid">${kpi('CA (commissions)', fCFA(c.minsouah.ca), '#b45309')}${kpi('Résultat Minsouah', fCFA(c.minsouah.resultat), c.minsouah.resultat >= 0 ? '#15803d' : '#b91c1c')}${kpi('Loyers collectés (proprios)', fCFA(c.ownersFunds.collected), '#15803d')}${kpi('Recouvrement', c.recovery.taux + '%', '#785a00')}</div>`)}
      ${hasPrevData(view.dPrev) ? sec('4b', `Comparaison ${year} vs ${year - 1}`, compTableHTML(c, view.dPrev, year)) : ''}
      ${sec(5, 'Bilan des activités immobilières', S[5])}
      ${sec(6, 'Bilan financier de Minsouah', S[6])}
      ${sec(7, 'Situation des propriétaires', S[7])}
      ${sec(8, 'Situation locative', S[8])}
      ${sec(9, 'Recouvrement et impayés', S[9])}
      ${sec(10, 'Reversements propriétaires', S[10])}
      ${sec(11, 'Maintenance et travaux', S[11])}
      ${sec(12, 'Bilan commercial', S[12])}
      ${sec(13, 'Difficultés rencontrées', `<div class="txt">${textToList(cm.difficultes)}</div>`)}
      ${sec(14, 'Évaluation globale des performances', `<div class="txt">${textToHTML(cm.evaluation)}</div>`)}
      ${sec(15, 'Recommandations du gérant', `<div class="txt">${textToHTML(cm.recommandations)}</div>`)}
      ${sec(16, `Plan d'action ${nextYear}`, `<div class="txt">${textToList(cm.planAction)}</div><div class="obj" style="margin-top:8px"><p style="font-weight:700;margin:0 0 4px">Suggestions automatiques (à partir des chiffres ${year}) :</p><ul>${objectives.map(o => `<li>${o}</li>`).join('')}</ul></div>`)}
      ${sec(17, 'Conclusion', `<div class="txt">${textToHTML(cm.conclusion)}</div>`)}
      ${sec(18, 'Annexes statistiques — évolution mensuelle', mTable(c.monthly))}
      <div class="foot"><span>${company} — Rapport annuel de gestion ${year} (${scopeName})</span><span>${today}</span></div>
    </div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
}

/* ── PRÉSENTATION AG (diapositives paysage, une par page) ── */
function buildSlidesHTML(view, year, org, comments, selected) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const logo = org.logo || ''; const company = org.companyName || 'Minsouah';
  const c = view.d; const nextYear = year + 1; const cm = comments || {};
  const scopeName = view.isAll ? 'Toutes les agences (consolidé)' : view.label;
  const objectives = buildObjectives(nextYear, c);

  const bk = (l, v, color) => `<div class="bk"><div class="bk-l">${l}</div><div class="bk-v" style="color:${color || '#222'}">${v}</div></div>`;
  const grid = (items) => `<div class="bkgrid">${items.join('')}</div>`;
  const txtBlock = (s) => `<div class="stxt">${textToHTML(s)}</div>`;
  const listBlock = (s) => `<div class="stxt">${textToList(s)}</div>`;

  const body = {
    2: txtBlock(cm.motGerant),
    3: txtBlock(cm.presentation) + grid([bk('Biens gérés', fNum(c.patrimoine.properties), '#785a00'), bk('Propriétaires', fNum(c.patrimoine.owners), '#0369a1'), bk('Locataires', fNum(c.patrimoine.tenants), '#0f766e')]),
    4: grid([bk('Biens / Unités', `${c.patrimoine.properties} / ${c.patrimoine.units}`, '#785a00'), bk('Occupation', c.patrimoine.occupancy + '%', '#0369a1'), bk('Unités vacantes', fNum(c.patrimoine.vacant), '#b45309'), bk('Mandats actifs', fNum(c.patrimoine.activeContracts), '#15803d')]),
    5: grid([bk('CA (commissions)', fCFA(c.minsouah.ca), '#b45309'), bk('Charges', fCFA(c.minsouah.charges), '#b91c1c'), bk('Résultat Minsouah', fCFA(c.minsouah.resultat), c.minsouah.resultat >= 0 ? '#15803d' : '#b91c1c')]) + `<div style="margin-top:10px">${svgMonthly(c.monthly)}</div>`,
    6: grid([bk('Mandats actifs', fNum(c.patrimoine.activeContracts), '#15803d'), bk('Mandats résiliés', fNum(c.patrimoine.resilieContracts), '#b91c1c'), bk('Nouveaux contrats', fNum(c.patrimoine.newContracts), '#0369a1'), bk('Occupation', c.patrimoine.occupancy + '%', '#785a00')]),
    7: grid([bk('Loyers collectés', fCFA(c.ownersFunds.collected), '#15803d'), bk('Net dû proprios', fCFA(c.ownersFunds.netDu), '#0f766e'), bk('Reversé', fCFA(c.ownersFunds.reversed), '#0369a1'), bk('En attente', fCFA(c.ownersFunds.pending), '#b45309')]),
    8: grid([bk('Encaissé', fCFA(c.recovery.collecte), '#15803d'), bk('Impayés', fCFA(c.recovery.impaye), '#b91c1c'), bk('Taux de recouvrement', c.recovery.taux + '%', '#785a00')]),
    9: grid([bk('Reversé (validé)', fCFA(c.ownersFunds.reversed), '#0369a1'), bk('En attente', fCFA(c.ownersFunds.pending), '#b45309')]),
    10: grid([bk('Demandes', fNum(c.maintenance.total), '#222'), bk('Réalisées', fNum(c.maintenance.done), '#15803d'), bk('En attente', fNum(c.maintenance.pending), '#b45309'), bk('Coût (devis)', fCFA(c.maintenance.cost), '#b91c1c')]),
    11: `<div class="warn">Suivi commercial (prospects, visites, conversion) : <b>données non disponibles</b> — module de prospection non encore alimenté.</div>`,
    12: listBlock(cm.difficultes),
    13: txtBlock(cm.evaluation),
    14: listBlock(cm.planAction) + `<div class="obj"><p style="font-weight:700;margin:0 0 4px">Suggestions (chiffres ${year}) :</p><ul>${objectives.map(o => `<li>${o}</li>`).join('')}</ul></div>`,
    15: txtBlock(cm.recommandations),
  };
  const titleOf = (n) => (n === 14 ? `Plan stratégique ${nextYear}` : (SLIDES.find(s => s.n === n)?.t || ''));

  const slideHTML = (n) => {
    if (n === 1) return `<section class="slide cover">
        ${logo ? `<img src="${logo}"/>` : ''}
        <h1>${company}</h1>
        <h2>Assemblée Générale — Exercice ${year}</h2>
        <p>${scopeName} · ${today}</p>
      </section>`;
    return `<section class="slide">
      <div class="shead"><span>${company} — ${scopeName}</span><span>Exercice ${year}</span></div>
      <h3>${n}. ${titleOf(n)}</h3>
      <div class="sbody">${body[n] || '<p style="color:#aaa">—</p>'}</div>
    </section>`;
  };

  return `<!doctype html><html><head><meta charset="utf-8"><title>Présentation AG ${year} — ${scopeName}</title>
  <style>
    @page{size:A4 landscape;margin:0}
    *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#222;margin:0;background:#eee}
    .slide{width:297mm;height:209mm;padding:26px 34px;background:#fff;page-break-after:always;display:flex;flex-direction:column;position:relative}
    .slide.cover{align-items:center;justify-content:center;text-align:center;background:linear-gradient(135deg,#fffaf0,#fff)}
    .cover img{height:92px;margin-bottom:20px} .cover h1{font-size:46px;color:#785a00;margin:0} .cover h2{font-size:26px;color:#333;margin:10px 0 0} .cover p{color:#777;margin-top:18px;font-size:16px}
    .shead{display:flex;justify-content:space-between;font-size:12px;color:#999;border-bottom:2px solid #785a00;padding-bottom:6px}
    h3{font-size:28px;color:#785a00;margin:18px 0 14px}
    .sbody{flex:1;font-size:16px}
    .bkgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:12px}
    .bk{border:1px solid #eee;border-radius:12px;padding:16px 18px;background:#fafafa}
    .bk-l{font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#999} .bk-v{font-size:26px;font-weight:800;margin-top:4px}
    .stxt p{margin:6px 0;line-height:1.5;font-size:16px} .stxt ul{padding-left:22px} .stxt li{margin:6px 0;font-size:16px}
    .warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:10px;padding:14px 18px;font-size:16px}
    .obj{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 16px;margin-top:10px;font-size:14px} .obj li{margin:3px 0}
    @media screen{.slide{margin:12px auto;box-shadow:0 2px 12px rgba(0,0,0,.15)}}
  </style></head><body>
    ${selected.map(slideHTML).join('')}
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
}
