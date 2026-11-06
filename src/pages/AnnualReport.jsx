import { useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import { loadXLSX } from '../lib/lazyXlsx';
import { computeMonthMetrics, MM_MONTH_NAMES } from '../lib/monthMetrics';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';

/* ────────────────────────────────────────────────────────────────────────────
   RAPPORT D'EXERCICE (Assemblée Générale) — toutes agences.

   Produit, pour l'année civile choisie, un bilan d'activité détaillé par agence
   et consolidé : loyers encaissés & recouvrement, commission Minsouah & net
   propriétaires, dépenses & résultat, patrimoine / contrats / locataires /
   cautions, mois par mois — plus des suggestions d'objectifs pour l'année
   suivante. Exportable en PDF (imprimable pour l'AG) et en Excel (détails).

   Les données sont lues DIRECTEMENT pour chaque agence de l'administrateur
   (getDocs par orgId). Une agence dont la lecture est refusée (règle Firestore
   pas encore déployée) est ignorée avec un avertissement — le rapport reste
   produit pour les agences lisibles.
   ──────────────────────────────────────────────────────────────────────────── */

const fCFA = (n) => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
const fNum = (n) => Number(n || 0).toLocaleString('fr-FR');

// Analyse une date de transaction tolérante (ISO, ou JJ/MM/AAAA).
function parseTxDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [_, d, mo, y] = m; // eslint-disable-line no-unused-vars
    if (y.length === 2) y = '20' + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

// Nombre d'unités d'un bien (immeuble → nb d'unités, sinon 1).
const unitCount = (p) => (p?.isBuilding ? (Array.isArray(p.units) ? p.units.length : 0) || 1 : 1);

/* Calcule tout le bilan annuel d'UNE agence à partir de ses données brutes. */
function computeAgencyYear({ year, payments, transactions, contracts, tenants, properties }) {
  const months = MM_MONTH_NAMES.map((name, i) => ({ name, idx: i, label: `${name} ${year}` }));

  const monthly = months.map((mo) => {
    const mm = computeMonthMetrics({ payments, contracts, tenants, monthLabel: mo.label });
    // Commission réellement appliquée aux paiements réglés (non reversés) du mois.
    const monthPaid = (payments || []).filter(p =>
      p.status === 'Payé' && !p.avanceVerseeProprio &&
      (p.month || '').toString().toLowerCase().trim() === mo.label.toLowerCase());
    const commission = monthPaid.reduce((s, p) => s + (Number(p.commissionAmount) || 0), 0);
    // Dépenses du mois (transactions négatives tombant dans le mois).
    const depenses = (transactions || []).filter(t => {
      if (t.positive) return false;
      const d = parseTxDate(t.date);
      return d && d.getFullYear() === year && d.getMonth() === mo.idx;
    }).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const collected = mm.collected;
    const netOwner = collected - commission;
    return {
      mois: mo.name, label: mo.label,
      attendu: mm.expected, encaisse: collected, impaye: mm.pending,
      recouvrement: mm.recoveryRate, commission, netOwner, depenses,
      resultat: collected - depenses,
    };
  });

  const sum = (f) => monthly.reduce((s, m) => s + (Number(f(m)) || 0), 0);
  const totals = {
    attendu: sum(m => m.attendu),
    encaisse: sum(m => m.encaisse),
    impaye: sum(m => m.impaye),
    commission: sum(m => m.commission),
    netOwner: sum(m => m.netOwner),
    depenses: sum(m => m.depenses),
    resultat: sum(m => m.resultat),
  };
  totals.recouvrement = totals.attendu > 0
    ? Math.round((totals.encaisse / (totals.encaisse + totals.impaye || 1)) * 100)
    : (totals.encaisse > 0 ? 100 : 0);

  // Patrimoine / parc
  const totalUnits = (properties || []).reduce((s, p) => s + unitCount(p), 0);
  const activeContracts = (contracts || []).filter(c => c.status === 'Actif' || c.status === 'Expirant');
  const resilieContracts = (contracts || []).filter(c => c.status === 'Résilié');
  const occupied = activeContracts.length;
  const occupancy = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;

  // Cautions
  const cautionHeld = (tenants || []).filter(t => !t.cautionRefunded)
    .reduce((s, t) => s + (Number(t.cautionAmount) || 0), 0);
  const cautionRefundedYear = (tenants || []).filter(t => {
    if (!t.cautionRefunded || !t.cautionRefundDate) return false;
    const d = new Date(t.cautionRefundDate);
    return !isNaN(d.getTime()) && d.getFullYear() === year;
  }).reduce((s, t) => s + (Number(t.cautionRestitue != null ? t.cautionRestitue : t.cautionAmount) || 0), 0);

  const patrimoine = {
    properties: (properties || []).length,
    units: totalUnits,
    occupied, occupancy,
    activeContracts: activeContracts.length,
    resilieContracts: resilieContracts.length,
    tenants: (tenants || []).length,
    cautionHeld, cautionRefundedYear,
  };

  return { monthly, totals, patrimoine };
}

/* Suggestions d'objectifs pour l'année suivante, calculées à partir du bilan. */
function buildObjectives(nextYear, consolidated) {
  const t = consolidated.totals;
  const p = consolidated.patrimoine;
  const out = [];
  // Recouvrement
  if (t.recouvrement < 95) {
    out.push(`Porter le taux de recouvrement de ${t.recouvrement}% à au moins 95% (réduire les impayés de ${fCFA(t.impaye)} constatés sur l'exercice).`);
  } else {
    out.push(`Maintenir l'excellent taux de recouvrement (${t.recouvrement}%) et sécuriser l'encaissement par des relances anticipées.`);
  }
  // Croissance des encaissements : +10% suggéré
  const target = Math.round(t.encaisse * 1.1);
  out.push(`Objectif d'encaissement ${nextYear} : ${fCFA(target)} (+10% vs ${fCFA(t.encaisse)} cette année).`);
  // Occupation / vacance
  const vacant = Math.max(0, p.units - p.occupied);
  if (vacant > 0) {
    out.push(`Réduire la vacance : ${vacant} unité(s) non occupée(s) sur ${p.units} (occupation ${p.occupancy}%) — objectif ≥ 90% d'occupation.`);
  } else {
    out.push(`Maintenir le plein emploi du parc (${p.occupancy}% d'occupation) et étudier l'extension du patrimoine géré.`);
  }
  // Maîtrise des charges
  if (t.encaisse > 0) {
    const ratio = Math.round((t.depenses / t.encaisse) * 100);
    out.push(`Maîtriser les charges : ${fCFA(t.depenses)} de dépenses (${ratio}% des encaissements) — viser une baisse de ce ratio.`);
  }
  // Contrats
  if (p.resilieContracts > 0) {
    out.push(`Fidéliser les locataires : ${p.resilieContracts} contrat(s) résilié(s) cette année — renforcer le suivi et la relation locataire.`);
  }
  // Développement commission
  out.push(`Développer les revenus de gestion : commission ${fCFA(t.commission)} cette année — objectif de croissance via de nouveaux mandats.`);
  return out;
}

export default function AnnualReport() {
  const { state } = useApp();
  const user = state.currentUser;
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null); // { year, agencies:[{id,name,data}], consolidated, skipped:[] }
  const [error, setError] = useState('');

  // Agences accessibles à l'administrateur.
  const myOrgIds = useMemo(() => {
    const ids = user?.orgIds?.length ? user.orgIds : [user?.orgId].filter(Boolean);
    return [...new Set(ids)];
  }, [user]);

  const agencies = useMemo(() => {
    const orgs = state.organizations || [];
    return myOrgIds.map(id => ({ id, name: orgs.find(o => o.id === id)?.name || id }));
  }, [myOrgIds, state.organizations]);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y + 1, y, y - 1, y - 2, y - 3];
  }, [now]);

  async function fetchOrgCollection(colName, orgId) {
    const q = query(collection(db, 'workspaces', WS, colName), where('orgId', '==', orgId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function generate() {
    setBusy(true); setError(''); setResult(null); setProgress('');
    try {
      const agenciesData = [];
      const skipped = [];
      for (const ag of agencies) {
        setProgress(`Lecture des données — ${ag.name}…`);
        try {
          const [payments, transactions, contracts, tenants, properties] = await Promise.all([
            fetchOrgCollection('payments', ag.id),
            fetchOrgCollection('transactions', ag.id),
            fetchOrgCollection('contracts', ag.id),
            fetchOrgCollection('tenants', ag.id),
            fetchOrgCollection('properties', ag.id),
          ]);
          const data = computeAgencyYear({ year, payments, transactions, contracts, tenants, properties });
          agenciesData.push({ id: ag.id, name: ag.name, data });
        } catch (e) {
          console.warn('[AnnualReport] agence ignorée', ag.name, e?.code || e?.message);
          skipped.push(ag.name);
        }
      }

      if (!agenciesData.length) {
        setError("Aucune donnée d'agence n'a pu être lue. Vérifiez que la règle d'accès multi-agences est déployée.");
        setBusy(false); return;
      }

      // Consolidation
      const consolidated = consolidate(agenciesData);
      setResult({ year, agencies: agenciesData, consolidated, skipped });
      setProgress('');
    } catch (e) {
      setError(e?.message || 'Erreur lors de la génération.');
    } finally {
      setBusy(false);
    }
  }

  function consolidate(agenciesData) {
    const monthly = MM_MONTH_NAMES.map((name, i) => {
      const acc = { mois: name, attendu: 0, encaisse: 0, impaye: 0, commission: 0, netOwner: 0, depenses: 0, resultat: 0 };
      agenciesData.forEach(a => {
        const m = a.data.monthly[i];
        acc.attendu += m.attendu; acc.encaisse += m.encaisse; acc.impaye += m.impaye;
        acc.commission += m.commission; acc.netOwner += m.netOwner; acc.depenses += m.depenses;
        acc.resultat += m.resultat;
      });
      acc.recouvrement = (acc.encaisse + acc.impaye) > 0 ? Math.round((acc.encaisse / (acc.encaisse + acc.impaye)) * 100) : 0;
      return acc;
    });
    const totals = ['attendu','encaisse','impaye','commission','netOwner','depenses','resultat']
      .reduce((o, k) => { o[k] = agenciesData.reduce((s, a) => s + a.data.totals[k], 0); return o; }, {});
    totals.recouvrement = (totals.encaisse + totals.impaye) > 0 ? Math.round((totals.encaisse / (totals.encaisse + totals.impaye)) * 100) : 0;
    const patrimoine = ['properties','units','occupied','activeContracts','resilieContracts','tenants','cautionHeld','cautionRefundedYear']
      .reduce((o, k) => { o[k] = agenciesData.reduce((s, a) => s + a.data.patrimoine[k], 0); return o; }, {});
    patrimoine.occupancy = patrimoine.units > 0 ? Math.round((patrimoine.occupied / patrimoine.units) * 100) : 0;
    return { monthly, totals, patrimoine };
  }

  /* ── Export Excel ── */
  async function exportExcel() {
    if (!result) return;
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();

    // Feuille synthèse consolidée
    const c = result.consolidated;
    const synth = [
      ['RAPPORT D\'EXERCICE ' + result.year + ' — TOUTES AGENCES'],
      [],
      ['Indicateur', 'Valeur (FCFA)'],
      ['Loyers encaissés', c.totals.encaisse],
      ['Impayés', c.totals.impaye],
      ['Taux de recouvrement (%)', c.totals.recouvrement],
      ['Commission Minsouah', c.totals.commission],
      ['Net propriétaires', c.totals.netOwner],
      ['Dépenses', c.totals.depenses],
      ['Résultat (encaissé − dépenses)', c.totals.resultat],
      [],
      ['Biens gérés', c.patrimoine.properties],
      ['Unités', c.patrimoine.units],
      ['Taux d\'occupation (%)', c.patrimoine.occupancy],
      ['Contrats actifs', c.patrimoine.activeContracts],
      ['Contrats résiliés', c.patrimoine.resilieContracts],
      ['Locataires', c.patrimoine.tenants],
      ['Cautions détenues', c.patrimoine.cautionHeld],
      ['Cautions restituées (' + result.year + ')', c.patrimoine.cautionRefundedYear],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(synth), 'Synthèse');

    // Détail mensuel consolidé
    const monthHeader = ['Mois', 'Attendu', 'Encaissé', 'Impayé', 'Recouvrement %', 'Commission', 'Net proprio', 'Dépenses', 'Résultat'];
    const consoRows = [monthHeader, ...c.monthly.map(m => [m.mois, m.attendu, m.encaisse, m.impaye, m.recouvrement, m.commission, m.netOwner, m.depenses, m.resultat])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(consoRows), 'Mensuel consolidé');

    // Une feuille par agence
    result.agencies.forEach(a => {
      const rows = [monthHeader, ...a.data.monthly.map(m => [m.mois, m.attendu, m.encaisse, m.impaye, m.recouvrement, m.commission, m.netOwner, m.depenses, m.resultat])];
      rows.push([]);
      rows.push(['TOTAL', a.data.totals.attendu, a.data.totals.encaisse, a.data.totals.impaye, a.data.totals.recouvrement, a.data.totals.commission, a.data.totals.netOwner, a.data.totals.depenses, a.data.totals.resultat]);
      const safe = (a.name || 'Agence').replace(/[\\/?*[\]:]/g, ' ').slice(0, 28);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), safe || 'Agence');
    });

    XLSX.writeFile(wb, `Rapport_exercice_${result.year}_toutes_agences.xlsx`);
  }

  /* ── Export PDF (impression) ── */
  function exportPDF() {
    if (!result) return;
    const html = buildReportHTML(result, state.orgSettings || {});
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (win) { win.document.write(html); win.document.close(); }
    else alert('Autorisez les pop-ups pour générer le PDF.');
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex items-start justify-between flex-wrap gap-sm">
        <div>
          <h2 className="font-bold text-on-surface text-lg flex items-center gap-2">
            <Icon name="assessment" size={22} className="text-primary" /> Rapport d'exercice (AG)
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Bilan d'activité détaillé sur l'année civile, pour toutes vos agences — exportable en PDF et Excel.
          </p>
        </div>
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
              Agence(s) non lue(s) (accès refusé — règle multi-agences à déployer) : {result.skipped.join(', ')}.
            </div>
          )}

          <div className="flex gap-sm flex-wrap">
            <button onClick={exportPDF} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30">
              <Icon name="picture_as_pdf" size={18} /> Exporter PDF
            </button>
            <button onClick={exportExcel} className="inline-flex items-center gap-2 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30">
              <Icon name="table_view" size={18} /> Exporter Excel
            </button>
          </div>

          {/* Aperçu consolidé */}
          <KpiGrid title={`Consolidé — toutes agences (${result.year})`} totals={result.consolidated.totals} patrimoine={result.consolidated.patrimoine} />

          {/* Par agence */}
          {result.agencies.map(a => (
            <KpiGrid key={a.id} title={a.name} totals={a.data.totals} patrimoine={a.data.patrimoine} />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiGrid({ title, totals, patrimoine }) {
  const kpis = [
    { label: 'Loyers encaissés', value: fCFA(totals.encaisse), cls: 'text-green-700' },
    { label: 'Recouvrement', value: totals.recouvrement + '%', cls: 'text-primary' },
    { label: 'Commission Minsouah', value: fCFA(totals.commission), cls: 'text-amber-700' },
    { label: 'Net propriétaires', value: fCFA(totals.netOwner), cls: 'text-green-700' },
    { label: 'Dépenses', value: fCFA(totals.depenses), cls: 'text-red-700' },
    { label: 'Résultat', value: fCFA(totals.resultat), cls: totals.resultat >= 0 ? 'text-green-700' : 'text-red-700' },
    { label: 'Occupation', value: patrimoine.occupancy + '%', cls: 'text-blue-700' },
    { label: 'Biens / Unités', value: `${patrimoine.properties} / ${patrimoine.units}`, cls: 'text-on-surface' },
    { label: 'Contrats actifs', value: fNum(patrimoine.activeContracts), cls: 'text-on-surface' },
    { label: 'Contrats résiliés', value: fNum(patrimoine.resilieContracts), cls: 'text-on-surface' },
    { label: 'Cautions détenues', value: fCFA(patrimoine.cautionHeld), cls: 'text-on-surface' },
    { label: 'Cautions restituées', value: fCFA(patrimoine.cautionRefundedYear), cls: 'text-on-surface' },
  ];
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
      <div className="px-md py-2.5 bg-secondary text-on-primary font-bold text-sm">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-outline-variant/20">
        {kpis.map(k => (
          <div key={k.label} className="bg-surface-container-lowest p-3">
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">{k.label}</p>
            <p className={`font-bold mt-0.5 text-sm ${k.cls}`}>{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Génère le HTML imprimable du rapport ── */
function buildReportHTML(result, org) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const logo = org.logo || '';
  const company = org.companyName || 'Minsouah';
  const c = result.consolidated;
  const nextYear = result.year + 1;
  const objectives = buildObjectives(nextYear, c);

  const monthTable = (monthly) => `
    <table>
      <thead><tr>
        <th>Mois</th><th class="r">Attendu</th><th class="r">Encaissé</th><th class="r">Impayé</th>
        <th class="c">Recouv.</th><th class="r">Commission</th><th class="r">Net proprio</th><th class="r">Dépenses</th><th class="r">Résultat</th>
      </tr></thead>
      <tbody>
        ${monthly.map(m => `<tr>
          <td>${m.mois}</td>
          <td class="r">${fNum(m.attendu)}</td>
          <td class="r" style="color:#15803d">${fNum(m.encaisse)}</td>
          <td class="r" style="color:#b91c1c">${fNum(m.impaye)}</td>
          <td class="c">${m.recouvrement}%</td>
          <td class="r" style="color:#b45309">${fNum(m.commission)}</td>
          <td class="r" style="color:#15803d">${fNum(m.netOwner)}</td>
          <td class="r" style="color:#b91c1c">${fNum(m.depenses)}</td>
          <td class="r">${fNum(m.resultat)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  const totalsRow = (t) => `
    <table style="margin-top:4px"><tbody>
      <tr style="font-weight:800;background:#fdf5e6">
        <td>TOTAL EXERCICE</td>
        <td class="r">${fNum(t.attendu)}</td>
        <td class="r" style="color:#15803d">${fNum(t.encaisse)}</td>
        <td class="r" style="color:#b91c1c">${fNum(t.impaye)}</td>
        <td class="c">${t.recouvrement}%</td>
        <td class="r" style="color:#b45309">${fNum(t.commission)}</td>
        <td class="r" style="color:#15803d">${fNum(t.netOwner)}</td>
        <td class="r" style="color:#b91c1c">${fNum(t.depenses)}</td>
        <td class="r">${fNum(t.resultat)}</td>
      </tr>
    </tbody></table>`;

  const patrimoineBlock = (p, title) => `
    <div class="pat">
      <div class="pat-i"><span>Biens gérés</span><b>${fNum(p.properties)}</b></div>
      <div class="pat-i"><span>Unités</span><b>${fNum(p.units)}</b></div>
      <div class="pat-i"><span>Occupation</span><b>${p.occupancy}%</b></div>
      <div class="pat-i"><span>Contrats actifs</span><b>${fNum(p.activeContracts)}</b></div>
      <div class="pat-i"><span>Contrats résiliés</span><b>${fNum(p.resilieContracts)}</b></div>
      <div class="pat-i"><span>Locataires</span><b>${fNum(p.tenants)}</b></div>
      <div class="pat-i"><span>Cautions détenues</span><b>${fNum(p.cautionHeld)}</b></div>
      <div class="pat-i"><span>Cautions restituées</span><b>${fNum(p.cautionRefundedYear)}</b></div>
    </div>`;

  const agencySection = (a) => `
    <h2 class="ag">Agence : ${a.name}</h2>
    ${monthTable(a.data.monthly)}
    ${totalsRow(a.data.totals)}
    ${patrimoineBlock(a.data.patrimoine, a.name)}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Rapport d'exercice ${result.year}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color:#222; margin:0; padding:28px; font-size:12px; }
    .head { display:flex; align-items:center; gap:14px; border-bottom:3px solid #785a00; padding-bottom:12px; margin-bottom:16px; }
    .head img { height:54px; }
    .head h1 { margin:0; font-size:20px; color:#785a00; }
    .head p { margin:2px 0 0; color:#777; font-size:11px; }
    h2 { font-size:15px; color:#785a00; margin:22px 0 8px; border-left:4px solid #785a00; padding-left:8px; }
    h2.ag { color:#0f766e; border-left-color:#0f766e; margin-top:26px; }
    .kgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:10px 0 4px; }
    .k { border:1px solid #eee; border-radius:8px; padding:8px 10px; background:#fafafa; }
    .k .l { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#999; }
    .k .v { font-size:15px; font-weight:800; margin-top:2px; }
    table { width:100%; border-collapse:collapse; margin-top:6px; font-size:11px; }
    th,td { border:1px solid #e5e5e5; padding:5px 7px; }
    th { background:#785a00; color:#fff; text-align:left; font-size:10px; text-transform:uppercase; }
    td.r, th.r { text-align:right; } td.c, th.c { text-align:center; }
    tbody tr:nth-child(even) { background:#faf8f2; }
    .pat { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:8px; }
    .pat-i { border:1px solid #eee; border-radius:6px; padding:6px 8px; display:flex; justify-content:space-between; background:#f7fafc; }
    .pat-i span { color:#777; font-size:10px; } .pat-i b { font-size:12px; }
    .obj { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 16px; margin-top:10px; }
    .obj li { margin:5px 0; }
    .foot { margin-top:26px; border-top:1px solid #ddd; padding-top:8px; color:#999; font-size:10px; display:flex; justify-content:space-between; }
    @media print { body { padding:0; } h2.ag { page-break-before:auto; } }
  </style></head><body>
    <div class="head">
      ${logo ? `<img src="${logo}" alt="logo"/>` : ''}
      <div>
        <h1>Rapport d'exercice ${result.year}</h1>
        <p>${company} — Bilan d'activité consolidé · Toutes agences · Édité le ${today}</p>
      </div>
    </div>

    <h2>Synthèse consolidée ${result.year}</h2>
    <div class="kgrid">
      <div class="k"><div class="l">Loyers encaissés</div><div class="v" style="color:#15803d">${fCFA(c.totals.encaisse)}</div></div>
      <div class="k"><div class="l">Taux de recouvrement</div><div class="v" style="color:#785a00">${c.totals.recouvrement}%</div></div>
      <div class="k"><div class="l">Commission Minsouah</div><div class="v" style="color:#b45309">${fCFA(c.totals.commission)}</div></div>
      <div class="k"><div class="l">Net propriétaires</div><div class="v" style="color:#15803d">${fCFA(c.totals.netOwner)}</div></div>
      <div class="k"><div class="l">Dépenses</div><div class="v" style="color:#b91c1c">${fCFA(c.totals.depenses)}</div></div>
      <div class="k"><div class="l">Résultat</div><div class="v" style="color:${c.totals.resultat >= 0 ? '#15803d' : '#b91c1c'}">${fCFA(c.totals.resultat)}</div></div>
      <div class="k"><div class="l">Impayés</div><div class="v" style="color:#b91c1c">${fCFA(c.totals.impaye)}</div></div>
      <div class="k"><div class="l">Occupation</div><div class="v" style="color:#0369a1">${c.patrimoine.occupancy}%</div></div>
    </div>

    <h2>Évolution mensuelle — consolidé</h2>
    ${monthTable(c.monthly)}
    ${totalsRow(c.totals)}

    <h2>Patrimoine & activité — consolidé</h2>
    ${patrimoineBlock(c.patrimoine, 'Consolidé')}

    ${result.agencies.length > 1 ? '<h2>Détail par agence</h2>' + result.agencies.map(agencySection).join('') : ''}

    <h2>Perspectives & objectifs ${nextYear}</h2>
    <div class="obj"><ul>
      ${objectives.map(o => `<li>${o}</li>`).join('')}
    </ul>
    <p style="font-size:10px;color:#777;margin:8px 0 0">Suggestions générées à partir des chiffres de l'exercice ${result.year}. À valider et ajuster en assemblée.</p>
    </div>

    <div class="foot"><span>${company} — Document confidentiel (AG ${result.year})</span><span>${today}</span></div>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
}
