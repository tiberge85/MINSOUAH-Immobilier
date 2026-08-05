import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import Badge from '../components/ui/Badge';
import Icon from '../components/Icon';

const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
// Montants toujours affichés EN ENTIER (aucune abréviation « k » dans le programme).
const fmtK = (n) => Number(n || 0).toLocaleString('fr-CI');

// Handles "DD/MM/YYYY" and "DD Mois AAAA" (French locale, with or without accents/dots)
const FR_M = { jan:0, fev:1, mar:2, avr:3, mai:4, juin:5, juil:6, jul:6, aou:7, sep:8, oct:9, nov:10, dec:11 };
function parsePaidDate(str) {
  if (!str) return null;
  if (str.includes('/')) {
    const [d, m, y] = str.split('/').map(Number);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) return { month: m - 1, year: y };
  }
  const match = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/i);
  if (match) {
    const tok = match[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\./g, '');
    const monthIdx = FR_M[tok.slice(0, 4)] ?? FR_M[tok.slice(0, 3)];
    if (monthIdx !== undefined) return { month: monthIdx, year: parseInt(match[3]) };
  }
  return null;
}


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
    <div className="bg-surface-container-lowest rounded-xl p-3 md:p-md shadow-card border border-outline-variant/20">
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center mb-2 ${color}`}>
        <Icon name={icon} size={16} />
      </div>
      <p className="text-on-surface-variant text-[10px] md:text-label-sm uppercase tracking-wider leading-tight">{label}</p>
      <p className="text-base md:text-h2 font-black text-on-surface mt-0.5 truncate leading-tight">{value}</p>
      {sub && <p className="text-[10px] md:text-label-sm text-on-surface-variant mt-0.5 truncate">{sub}</p>}
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
    tenants = [],
    currentUser,
  } = state;
  const navigate = useNavigate();
  const isOwnerRole = currentUser?.role === 'OWNER';
  const [selectedId, setSelectedId] = useState(() =>
    isOwnerRole && currentUser?.personId ? currentUser.personId : null
  );
  const [activeTab, setActiveTab] = useState('overview');
  const [lastSync, setLastSync] = useState(() => new Date());

  // Update timestamp whenever any data changes (payments, contracts, properties, tickets)
  useEffect(() => { setLastSync(new Date()); }, [payments, contracts, properties, tickets]);

  // Type-safe lookup: handle number/string mismatch from JSON storage or Firebase
  const owner = owners.find(o =>
    o.id === selectedId ||
    Number(o.id) === Number(selectedId) ||
    String(o.id) === String(selectedId)
  );

  // Normalise: lowercase + strip diacritics so "Côte" === "cote", "RÉSIDENCE" === "residence"
  const norm = s => (s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  // All properties that belong to this owner (4-path matching)
  const ownerProperties = useMemo(() => {
    if (!owner) return [];
    const ownerN = norm(owner.name);
    const ownerPropIds = new Set((owner.propertyIds || []).map(Number));
    return properties.filter(p =>
      norm(p.owner) === ownerN ||
      (p.ownerId != null && (p.ownerId === owner.id || Number(p.ownerId) === owner.id)) ||
      ownerPropIds.has(Number(p.id))
    );
  }, [owner, properties]);

  const ownerContracts = useMemo(() => {
    if (!owner) return [];
    const ownerN = norm(owner.name);
    const propNameSet = new Set(ownerProperties.map(p => norm(p.name)));
    // Accept all forms: original id, number, string
    const propIds = new Set([
      ...ownerProperties.map(p => p.id),
      ...ownerProperties.map(p => Number(p.id)),
      ...ownerProperties.map(p => String(p.id)),
    ]);
    // Strip composite key suffix "12345::" or "12345::67" → 12345
    const cleanId = id => {
      if (id == null) return null;
      if (typeof id === 'string' && id.includes('::')) { const n = Number(id.split('::')[0]); return isNaN(n) ? null : n; }
      return id;
    };
    return contracts.filter(c => {
      const cName = norm(c.propertyName || c.bien || '');
      if (cName && propNameSet.has(cName)) return true;
      // Also match "Building — Unit" names by prefix
      if (cName && [...propNameSet].some(pn => cName.startsWith(pn + ' '))) return true;
      const cleanedId = cleanId(c.propertyId);
      if (cleanedId != null && propIds.has(cleanedId)) return true;
      if (c.ownerId != null && (c.ownerId === owner.id || Number(c.ownerId) === owner.id)) return true;
      if (c.ownerName && norm(c.ownerName) === ownerN) return true;
      return false;
    });
  }, [owner, ownerProperties, contracts]);

  const ownerPayments = useMemo(() => {
    if (!owner) return [];
    const ownerN = norm(owner.name);
    const ownerPropIds3 = new Set((owner.propertyIds || []).map(Number));
    const ownerProps = properties.filter(p =>
      norm(p.owner) === ownerN ||
      (p.ownerId != null && (p.ownerId === owner.id || Number(p.ownerId) === owner.id)) ||
      ownerPropIds3.has(Number(p.id))
    );
    const contractIds = new Set(ownerContracts.map(c => c.id));
    const tenantIds   = new Set(ownerContracts.map(c => c.tenantId).filter(Boolean));
    return payments.filter(p => {
      // 1. Direct ownerId match (most reliable — set by Payments.jsx since this fix)
      if (p.ownerId != null && (p.ownerId === owner.id || Number(p.ownerId) === owner.id)) return true;
      // 2. ownerName match
      if (p.ownerName && norm(p.ownerName) === ownerN) return true;
      // 3. contractId from owner's contracts
      if (p.contractId != null && contractIds.has(p.contractId)) return true;
      // 4. tenantId from owner's active contracts
      if (p.tenantId != null && tenantIds.has(p.tenantId)) return true;
      // 5. propertyName match — also handles "Building — Unit" format by prefix
      if (p.propertyName) {
        const pn = norm(p.propertyName);
        if (ownerProps.some(op => pn === norm(op.name) || pn.startsWith(norm(op.name) + ' '))) return true;
      }
      return false;
    });
  }, [owner, ownerContracts, properties, payments]);

  const ownerTickets = useMemo(() =>
    ownerProperties.length
      ? tickets.filter(t => ownerProperties.some(p => norm(p.name) === norm(t.property || '')))
      : [],
    [ownerProperties, tickets]
  );

  const ownerInspections = useMemo(() =>
    ownerProperties.length
      ? (inspections || []).filter(i => ownerProperties.some(p => p.id === i.propertyId || p.name === i.propertyName))
      : [],
    [ownerProperties, inspections]
  );

  const isActiveContract = c => c.status === 'Actif' || c.status === 'Expirant';

  /* ─── Period filter ──────────────────────────────────────────── */
  const [period, setPeriod] = useState({ from: '', to: '' });
  const hasPeriod = period.from || period.to;

  const periodPayments = useMemo(() => {
    if (!hasPeriod) return ownerPayments;
    const from = period.from ? new Date(period.from) : null;
    const to   = period.to   ? new Date(period.to + 'T23:59:59') : null;
    return ownerPayments.filter(p => {
      const ref = p.paidDate || p.dueDate || p.createdAt;
      if (!ref) return true;
      let d;
      if (ref.includes('/')) {
        const [dd, mm, yyyy] = ref.split('/').map(Number);
        d = new Date(yyyy, mm - 1, dd);
      } else {
        d = new Date(ref);
      }
      if (isNaN(d)) return true;
      if (from && d < from) return false;
      if (to   && d > to  ) return false;
      return true;
    });
  }, [ownerPayments, period, hasPeriod]);

  /* ─── KPIs ─────────────────────────────────────────────────────── */
  const occupiedCount = ownerProperties.filter(p =>
    p.status === 'Loué' ||
    ownerContracts.some(c => isActiveContract(c) && (
      norm(c.propertyName || c.bien || '') === norm(p.name) ||
      (c.propertyId != null && (c.propertyId === p.id || Number(c.propertyId) === p.id))
    ))
  ).length;
  const freeCount = ownerProperties.length - occupiedCount;
  const activeContractsCount = ownerContracts.filter(isActiveContract).length;
  const occupancyRate = ownerProperties.length > 0
    ? Math.round((occupiedCount / ownerProperties.length) * 100)
    : 0;

  const contractRevenue = ownerContracts.filter(isActiveContract).reduce((s, c) => s + (c.rent || 0), 0);
  const propertyRentSum = ownerProperties.reduce((s, p) => {
    if (p.isBuilding) return s + (p.units || []).reduce((a, u) => a + (u.rent || 0), 0);
    return s + (p.rent || 0);
  }, 0);

  // Locataire d'un contrat + mois de son 1er loyer (avance/caution éventuelle).
  const _opNow = new Date();
  const _opCurFirst = new Date(_opNow.getFullYear(), _opNow.getMonth(), 1);
  const _opYear = _opNow.getFullYear();
  const tenantOfContract = (c) => (tenants || []).find(t =>
    (c.tenantId != null && String(t.id) === String(c.tenantId)) || norm(t.name) === norm(c.tenant)
  );
  const startFirstOf = (c) => {
    const t = tenantOfContract(c);
    const raw = t?.paymentStartDate || t?.since || c.startDate;
    const d = raw ? new Date(raw) : null;
    return d && !isNaN(d.getTime()) ? new Date(d.getFullYear(), d.getMonth(), 1) : null;
  };

  // LOYER ATTENDU CE MOIS : loyers des contrats actifs réellement DUS ce mois — on
  // exclut les locataires encore couverts par leur avance/caution (1er loyer plus
  // tard). Aligne le portail sur « Loyers attendus » du module de gestion.
  const activeOwnerContracts = ownerContracts.filter(isActiveContract);
  const expectedMonthly = activeOwnerContracts.length > 0
    ? activeOwnerContracts.reduce((s, c) => {
        const sf = startFirstOf(c);
        if (sf && _opCurFirst < sf) return s; // encore en avance ce mois → non dû
        return s + (c.rent || 0);
      }, 0)
    : propertyRentSum;

  // REVENU ANNUEL RÉALISTE (année en cours) : un locataire entré en cours d'année ne
  // génère pas 12 mois. Pour chaque contrat on compte du mois de son 1er loyer (si
  // dans l'année) jusqu'à décembre ; un contrat démarrant l'an prochain compte 0.
  const expectedAnnual = activeOwnerContracts.length > 0
    ? activeOwnerContracts.reduce((s, c) => {
        const sf = startFirstOf(c);
        let startMonth = 0;
        if (sf) {
          if (sf.getFullYear() > _opYear) return s;
          if (sf.getFullYear() === _opYear) startMonth = sf.getMonth();
        }
        return s + (c.rent || 0) * (12 - startMonth);
      }, 0)
    : propertyRentSum * 12;

  /* ─── Analytics data ─────────────────────────────────────────── */
  const monthlyRevData = useMemo(() => {
    const now = new Date();
    const expectedMth = contractRevenue > 0 ? contractRevenue : propertyRentSum;
    return Array.from({ length: 12 }, (_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const mois = d.toLocaleDateString('fr-FR', { month: 'short' });
      const collected = ownerPayments
        .filter(p => {
          if (p.status !== 'Payé') return false;
          const parsed = parsePaidDate(p.paidDate);
          return parsed && parsed.month === m && parsed.year === y;
        })
        .reduce((s, p) => s + (p.amount || 0), 0);
      const unpaid = ownerPayments
        .filter(p => {
          if (p.status === 'Payé') return false;
          const parsed = parsePaidDate(p.dueDate) || parsePaidDate(p.paidDate);
          return parsed && parsed.month === m && parsed.year === y;
        })
        .reduce((s, p) => s + (p.amount || 0), 0);
      return {
        mois,
        revenus: collected,
        impayés: unpaid,
        attendu: expectedMth,
      };
    });
  }, [ownerPayments, contractRevenue, propertyRentSum]);

  const occupancyData = useMemo(() => {
    const loué = ownerProperties.filter(p => p.status === 'Loué' || ownerContracts.some(c => (c.propertyName === p.name || norm(c.propertyName) === norm(p.name)) && isActiveContract(c))).length;
    const libre = ownerProperties.length - loué;
    return [
      { name: 'Occupés', value: loué, color: '#785a00' },
      { name: 'Libres', value: libre, color: '#d2c5ae' },
    ].filter(d => d.value > 0);
  }, [ownerProperties, ownerContracts]);

  // Encaissé / Impayés : par MOIS (mois en cours) par défaut, cohérent avec « Loyer/mois ».
  // Si une période est filtrée (dates en haut), on affiche la période choisie.
  const OP_MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  const _nowOP = new Date();
  const curMonthLbl = `${OP_MONTHS_FR[_nowOP.getMonth()]} ${_nowOP.getFullYear()}`;
  const collectedTotal = hasPeriod
    ? periodPayments.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0)
    : ownerPayments.filter(p => p.month === curMonthLbl && p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const pendingAmount  = hasPeriod
    ? periodPayments.filter(p => p.status !== 'Payé' && p.status !== 'Annulé').reduce((s, p) => s + (p.amount || 0), 0)
    : Math.max(0, expectedMonthly - collectedTotal); // reste à encaisser ce mois
  const openTickets    = ownerTickets.filter(t => t.status !== 'Résolu').length;

  // Taux de recouvrement : encaissé / attendu (mois) — ou encaissé / facturé (période).
  const totalBilled = hasPeriod ? (collectedTotal + pendingAmount) : expectedMonthly;
  const recoveryRate = totalBilled > 0 ? Math.round((collectedTotal / totalBilled) * 100) : null;

  // For chart: show expected revenue as a baseline when no payment records
  const hasPaymentData = ownerPayments.length > 0;

  // Locataires qui NE PAIENT PAS ce mois-ci, avec le MOTIF et la date :
  //  • « En avance / caution » → couvert par son avance, 1er loyer plus tard ;
  //  • « Impayé » → dû ce mois et non réglé.
  const opMonthName = (d) => `${OP_MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
  const unpaidThisMonth = useMemo(() => {
    const paidP = ownerPayments.filter(p => p.month === curMonthLbl && p.status === 'Payé');
    const paidIds = new Set(paidP.map(p => (p.tenantId != null ? String(p.tenantId) : '')).filter(Boolean));
    const paidNames = new Set(paidP.map(p => norm(p.tenantName)).filter(Boolean));
    const out = [];
    activeOwnerContracts.forEach(c => {
      const t = tenantOfContract(c);
      const paid = (t && paidIds.has(String(t.id))) || paidNames.has(norm(c.tenant)) || (t && paidNames.has(norm(t.name)));
      if (paid) return;
      const sf = startFirstOf(c);
      const enAvance = sf && _opCurFirst < sf;
      out.push({
        name: c.tenant || t?.name || '—',
        property: c.propertyName || t?.property || '—',
        rent: Number(c.rent) || 0,
        motif: enAvance ? 'En avance / caution' : 'Impayé',
        detail: enAvance ? `1er loyer : ${opMonthName(sf)}` : `Dû : ${curMonthLbl}`,
        enAvance,
      });
    });
    // Impayés d'abord, puis en avance ; par montant décroissant
    return out.sort((a, b) => (a.enAvance === b.enAvance ? b.rent - a.rent : a.enAvance ? 1 : -1));
  }, [activeOwnerContracts, ownerPayments, curMonthLbl, tenants]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── PDF export ─────────────────────────────────────────────── */
  const exportPDF = () => {
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const rows = (payments) => payments.map(p => `
      <tr>
        <td>${p.propertyName || '—'}</td>
        <td>${p.tenantName || '—'}</td>
        <td>${p.month || '—'}</td>
        <td style="text-align:right;font-weight:bold;color:${p.status === 'Payé' ? '#166534' : '#991b1b'}">${Number(p.amount||0).toLocaleString('fr-CI')} FCFA</td>
        <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:${p.status === 'Payé' ? '#dcfce7' : '#fee2e2'};color:${p.status === 'Payé' ? '#166534' : '#991b1b'}">${p.status}</span></td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport — ${owner?.name}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1c1b19;background:#fff;padding:32px}
  h1{font-size:22px;font-weight:900;color:#785a00;margin-bottom:4px}
  h2{font-size:14px;font-weight:700;color:#1c1b19;margin:24px 0 8px;border-bottom:2px solid #e3d9cc;padding-bottom:4px}
  .meta{font-size:12px;color:#817662;margin-bottom:24px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .kpi{background:#fff8f2;border:1px solid #e3d9cc;border-radius:10px;padding:12px;text-align:center}
  .kpi-val{font-size:18px;font-weight:900;color:#785a00}
  .kpi-lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#817662;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#785a00;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px}
  td{padding:7px 10px;border-bottom:1px solid #f0e8de}
  tr:hover td{background:#fff8f2}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e3d9cc;font-size:10px;color:#817662;text-align:center}
  @media print{body{padding:16px}}
</style></head><body>
<h1>${owner?.name || 'Propriétaire'}</h1>
<div class="meta">Rapport généré le ${today} · ${ownerProperties.length} bien(s) · Période : ${period.from || 'début'} → ${period.to || 'aujourd\'hui'}</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-val">${ownerProperties.length}</div><div class="kpi-lbl">Biens</div></div>
  <div class="kpi"><div class="kpi-val">${occupancyRate}%</div><div class="kpi-lbl">Occupation</div></div>
  <div class="kpi"><div class="kpi-val">${Number(collectedTotal).toLocaleString('fr-CI')}</div><div class="kpi-lbl">Encaissé (FCFA)</div></div>
  <div class="kpi"><div class="kpi-val">${recoveryRate !== null ? recoveryRate + '%' : '—'}</div><div class="kpi-lbl">Recouvrement</div></div>
</div>

<h2>Biens immobiliers</h2>
<table>
  <thead><tr><th>Nom</th><th>Adresse</th><th>Type</th><th>Loyer/mois</th><th>Statut</th></tr></thead>
  <tbody>${ownerProperties.map(p => `<tr><td>${p.name}</td><td>${p.address||'—'}</td><td>${p.type||'—'}</td><td style="text-align:right">${Number(p.rent||0).toLocaleString('fr-CI')} FCFA</td><td>${p.status||'—'}</td></tr>`).join('')}</tbody>
</table>

<h2>Contrats actifs (${ownerContracts.filter(isActiveContract).length})</h2>
<table>
  <thead><tr><th>Bien</th><th>Locataire</th><th>Loyer</th><th>Fin bail</th><th>Statut</th></tr></thead>
  <tbody>${ownerContracts.filter(isActiveContract).map(c => `<tr><td>${c.propertyName||'—'}</td><td>${c.tenant||'—'}</td><td style="text-align:right">${Number(c.rent||0).toLocaleString('fr-CI')} FCFA</td><td>${c.endDate||'—'}</td><td>${c.status}</td></tr>`).join('')}</tbody>
</table>

<h2>Paiements (${periodPayments.length})</h2>
<table>
  <thead><tr><th>Propriété</th><th>Locataire</th><th>Mois</th><th>Montant</th><th>Statut</th></tr></thead>
  <tbody>${rows(periodPayments)}</tbody>
</table>

<h2>Locataires ne payant pas ce mois (${curMonthLbl})</h2>
<table>
  <thead><tr><th>Locataire</th><th>Bien</th><th>Loyer</th><th>Motif</th><th>Détail</th></tr></thead>
  <tbody>${unpaidThisMonth.length ? unpaidThisMonth.map(u => `<tr>
    <td>${u.name}</td><td>${u.property}</td>
    <td style="text-align:right">${Number(u.rent).toLocaleString('fr-CI')} FCFA</td>
    <td><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:${u.enAvance ? '#fef9c3' : '#fee2e2'};color:${u.enAvance ? '#854d0e' : '#991b1b'}">${u.motif}</span></td>
    <td>${u.detail}</td></tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:#999">Tous les locataires sont à jour ce mois</td></tr>'}</tbody>
</table>

<h2>Résumé financier</h2>
<table>
  <thead><tr><th>Indicateur</th><th style="text-align:right">Valeur</th></tr></thead>
  <tbody>
    <tr><td>Loyer attendu/mois</td><td style="text-align:right">${Number(expectedMonthly).toLocaleString('fr-CI')} FCFA</td></tr>
    <tr><td>Revenu annuel estimé</td><td style="text-align:right">${Number(expectedAnnual).toLocaleString('fr-CI')} FCFA</td></tr>
    <tr><td>Total encaissé</td><td style="text-align:right;color:#166534;font-weight:bold">${Number(collectedTotal).toLocaleString('fr-CI')} FCFA</td></tr>
    <tr><td>Impayés</td><td style="text-align:right;color:#991b1b;font-weight:bold">${Number(pendingAmount).toLocaleString('fr-CI')} FCFA</td></tr>
    <tr><td>Taux de recouvrement</td><td style="text-align:right;font-weight:bold">${recoveryRate !== null ? recoveryRate + '%' : '—'}</td></tr>
  </tbody>
</table>

<div class="footer">Minsouah Immobilier · Rapport propriétaire · ${today}</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (w) { w.onload = () => { w.print(); URL.revokeObjectURL(url); }; }
  };

  /* ─── Net à reverser : sélection mois + type (loyers / nouveaux locataires) ─
     IMPORTANT : ces hooks doivent être AVANT tout return conditionnel
     (sinon React #310 : « plus de hooks qu'au rendu précédent »). */
  const OP_MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const _revNow = new Date();
  const OP_CUR_MONTH = `${OP_MONTHS[_revNow.getMonth()]} ${_revNow.getFullYear()}`;
  const [revMonth, setRevMonth] = useState(OP_CUR_MONTH); // par défaut : mois en cours
  const [revType, setRevType] = useState('encaissements'); // 'encaissements' | 'nouveaux'
  const opMonthLabel = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return `${OP_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const m = String(dateStr).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    return m ? `${OP_MONTHS[Number(m[2]) - 1]} ${m[3]}` : '';
  };
  const inRevMonth = (dateStr) => revMonth === 'Tous' ? true : opMonthLabel(dateStr) === revMonth;
  const opMonthKey = (l) => { const [mn, yr] = (l || '').split(' '); const i = OP_MONTHS.indexOf(mn); return i >= 0 ? Number(yr) * 100 + i : 0; };
  // Mois disponibles = MOIS DE LOYER (p.month), comme le rapport mensuel — pas la
  // date de règlement. Ainsi un loyer de juillet payé en juin reste bien rattaché
  // à juillet (sinon le total du mois s'effondrait, ex. 750 000 au lieu du réel).
  const revMonths = useMemo(() =>
    [...new Set([OP_CUR_MONTH, ...ownerPayments.map(p => p.month).filter(Boolean)])].sort((a, b) => opMonthKey(b) - opMonthKey(a)),
    [ownerPayments]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtCFA = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
  const commOf = (p) => p.commissionAmount != null ? p.commissionAmount : Math.round((p.amount || 0) * (Number(owner?.commissionRate) || 0) / 100);
  const netOf = (p) => p.montantNet != null ? p.montantNet : ((p.amount || 0) - commOf(p));

  // Loyers encaissés du mois : basés sur le MOIS DE LOYER (p.month) pour coller
  // exactement au rapport mensuel et à la carte « Encaissé » du tableau de bord.
  const revenus = useMemo(() => {
    const inRentMonth = (p) => revMonth === 'Tous' ? true : p.month === revMonth;
    const paid = ownerPayments.filter(p => p.status === 'Payé' && inRentMonth(p));
    const brut = paid.reduce((s, p) => s + (p.amount || 0), 0);
    const commissions = paid.reduce((s, p) => s + commOf(p), 0);
    const reversed = paid.filter(p => p.versementProprioId || p.avanceVerseeProprio);
    const pending = paid.filter(p => !p.versementProprioId && !p.avanceVerseeProprio);
    return {
      brut, commissions,
      dejaReverse: reversed.reduce((s, p) => s + netOf(p), 0),
      soldeRestant: pending.reduce((s, p) => s + netOf(p), 0),
      nbPaid: paid.length,
    };
  }, [ownerPayments, owner, revMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cautions & avances des NOUVEAUX locataires du propriétaire (par mois d'entrée)
  const revDeposits = useMemo(() => {
    const propNames = new Set(ownerProperties.map(pr => norm(pr.name || pr.propertyName)).filter(Boolean));
    const list = (tenants || []).filter(t => {
      const amt = (Number(t.cautionAmount) || 0) + (Number(t.advanceAmount) || 0);
      if (amt <= 0) return false;
      const pn = norm(t.property);
      const belongs = propNames.has(pn) || [...propNames].some(n => n && pn && (pn.includes(n) || n.includes(pn)));
      if (!belongs) return false;
      return revMonth === 'Tous' ? true : inRevMonth(t.since);
    });
    const caution = list.reduce((s, t) => s + (Number(t.cautionAmount) || 0), 0);
    const avance = list.reduce((s, t) => s + (Number(t.advanceAmount) || 0), 0);
    return { list, caution, avance, total: caution + avance };
  }, [tenants, ownerProperties, owner, revMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Historique des reversements (bordereaux propriétaire validés le concernant)
  const ownerVersements = useMemo(() =>
    (state.bordereaux || [])
      .filter(b => b.type === 'PROPRIETAIRE' && b.status === 'Validé' && owner && String(b.ownerId) === String(owner.id))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [state.bordereaux, owner]
  );

  /* ─── Owner selector ─────────────────────────────────────────── */
  if (!selectedId) {
    return (
      <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-lg">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container border border-outline-variant text-on-surface-variant transition-colors flex-shrink-0"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div>
            <h1 className="font-h2 text-h2 text-on-surface font-bold">Portail Propriétaires</h1>
            <p className="text-body-sm text-on-surface-variant">Sélectionnez un propriétaire</p>
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
              const oN = norm(o.name);
              const oPropIds = new Set((o.propertyIds || []).map(Number));
              const ownedProps = properties.filter(p =>
                norm(p.owner) === oN ||
                (p.ownerId != null && (p.ownerId === o.id || Number(p.ownerId) === o.id)) ||
                oPropIds.has(Number(p.id))
              );
              const propNamesNorm = new Set(ownedProps.map(p => norm(p.name)));
              const ownedContracts = contracts.filter(c => {
                const cName = norm(c.propertyName || c.bien || '');
                return (
                  (cName && propNamesNorm.has(cName)) ||
                  (c.ownerId && (c.ownerId === o.id || Number(c.ownerId) === o.id)) ||
                  (c.ownerName && norm(c.ownerName) === oN)
                ) && isActiveContract(c);
              });
              const contractRev = ownedContracts.reduce((s, c) => s + (c.rent || 0), 0);
              const rev = contractRev > 0 ? contractRev : ownedProps.filter(p => p.status === 'Loué').reduce((s, p) => s + (p.rent || 0), 0);
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
                      <p className="text-body-sm text-on-surface-variant">{ownedProps.length} bien(s) — {ownedProps.filter(p => p.status === 'Loué').length || ownedContracts.length} occupé(s)</p>
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
    { id: 'revenus', label: 'Revenus', icon: 'account_balance_wallet' },
    { id: 'properties', label: 'Biens', icon: 'apartment' },
    { id: 'finance', label: 'Finances', icon: 'trending_up' },
    { id: 'maintenance', label: 'Maintenance', icon: 'engineering' },
    { id: 'edl', label: 'États des lieux', icon: 'home_work' },
  ];

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-6xl mx-auto flex flex-col gap-gutter">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        {!isOwnerRole && (
          <button
            onClick={() => setSelectedId(null)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container border border-outline-variant text-on-surface-variant transition-colors flex-shrink-0"
          >
            <Icon name="arrow_back" size={18} />
          </button>
        )}
        {owner.avatar
          ? <img src={owner.avatar} alt="" className="w-11 h-11 sm:w-14 sm:h-14 rounded-full object-cover flex-shrink-0" />
          : <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-bold text-base sm:text-lg flex-shrink-0 ${owner.color || 'bg-primary-container text-on-primary-container'}`}>{owner.initials || owner.name?.[0]}</div>
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:font-h2 sm:text-h2 text-on-surface font-bold truncate leading-tight">{owner.name}</h1>
            <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-semibold bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>
          <p className="text-[11px] sm:text-body-sm text-on-surface-variant truncate">
            {ownerProperties.length} bien(s) · {occupancyRate}% occupation · màj {lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
        <Badge label={owner.status || 'Actif'} />
        <button
          onClick={exportPDF}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-primary text-on-primary rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <Icon name="picture_as_pdf" size={15} /> Exporter PDF
        </button>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-surface-container rounded-xl px-3 py-2 border border-outline-variant/30">
          <Icon name="date_range" size={14} className="text-on-surface-variant flex-shrink-0" />
          <input type="date" value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))}
            className="text-xs bg-transparent outline-none text-on-surface w-32" />
          <span className="text-on-surface-variant text-xs">→</span>
          <input type="date" value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))}
            className="text-xs bg-transparent outline-none text-on-surface w-32" />
        </div>
        {hasPeriod && (
          <button onClick={() => setPeriod({ from: '', to: '' })}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/70 bg-primary/10 rounded-xl px-3 py-2 font-semibold transition-colors">
            <Icon name="close" size={12} />Effacer la période
          </button>
        )}
        {hasPeriod && (
          <span className="text-xs text-on-surface-variant bg-amber-50 border border-amber-200 rounded-xl px-2 py-1">
            Filtré · {periodPayments.length} paiements
          </span>
        )}
      </div>

      {/* KPIs — 3 cols on mobile, 4 on lg then 7 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-md">
        <KpiCard label="Biens" value={ownerProperties.length} sub={`${occupiedCount} occ · ${freeCount} libre`} icon="apartment" color="bg-primary/10 text-primary" />
        <KpiCard label="Occupation" value={`${occupancyRate}%`} sub={`${activeContractsCount} contrat(s)`} icon="donut_large" color={occupancyRate >= 80 ? 'bg-green-100 text-green-700' : occupancyRate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-error/10 text-error'} />
        <KpiCard label="Attendu/mois" value={fmt(expectedMonthly)} sub={`An : ${fmt(expectedAnnual)}`} icon="trending_up" color="bg-green-100 text-green-700" />
        <KpiCard label="Encaissé" value={fmt(collectedTotal)} sub={hasPeriod ? `${periodPayments.filter(p=>p.status==='Payé').length} paiem.` : `${curMonthLbl}`} icon="check_circle" color="bg-primary/10 text-primary" />
        <KpiCard label="Impayés" value={fmt(pendingAmount)} sub={hasPeriod ? (pendingAmount > 0 ? `${periodPayments.filter(p=>p.status!=='Payé'&&p.status!=='Annulé').length} en att.` : 'À jour') : (pendingAmount > 0 ? `reste ${curMonthLbl}` : 'À jour')} icon="warning" color={pendingAmount > 0 ? 'bg-error/10 text-error' : 'bg-green-100 text-green-700'} />
        <KpiCard
          label="Recouvrement"
          value={recoveryRate !== null ? `${recoveryRate}%` : '—'}
          sub={recoveryRate !== null ? (recoveryRate >= 80 ? 'Excellent' : recoveryRate >= 60 ? 'Moyen' : 'Faible') : 'Aucune donnée'}
          icon="percent"
          color={recoveryRate === null ? 'bg-surface-container text-on-surface-variant' : recoveryRate >= 80 ? 'bg-green-100 text-green-700' : recoveryRate >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-error/10 text-error'}
        />
        <KpiCard label="Tickets" value={openTickets} sub={`${ownerTickets.length} total`} icon="engineering" color={openTickets > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'} />
      </div>

      {/* Warning: no properties linked */}
      {ownerProperties.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-md flex items-start gap-3">
          <Icon name="link_off" size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-800 text-body-sm">Aucun bien lié à ce propriétaire</p>
            <p className="text-[12px] text-amber-700 mt-0.5">
              Allez dans <strong>Gestion Locative → Propriétaires</strong>, modifiez ce propriétaire et cochez ses biens dans la liste.
              Ou ouvrez chaque bien dans <strong>Patrimoine</strong> et renseignez le champ Propriétaire.
            </p>
          </div>
        </div>
      )}

      {/* Tabs — scrollable on mobile so all labels always visible */}
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 no-scrollbar">
        <div className="flex gap-1 bg-surface-container rounded-xl p-1 min-w-max sm:min-w-0 sm:w-full">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap py-2 px-3 sm:px-4 rounded-lg text-[11px] sm:text-label-sm font-bold transition-all sm:flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-surface-container-lowest shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name={tab.icon} size={14} filled={activeTab === tab.id} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          {/* Monthly revenue bar chart */}
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="font-h3 text-h3 text-on-surface">Revenus Mensuels</h3>
                <p className="text-body-sm text-on-surface-variant">Encaissements · 12 mois glissants</p>
              </div>
              {!hasPaymentData && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                  Revenus attendus estimés
                </span>
              )}
            </div>
            <div className="h-44 sm:h-56 mt-lg">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyRevData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={78} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="attendu" name="Attendu" fill="#d2c5ae" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="revenus" name="Encaissé" fill="#785a00" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="impayés" name="Impayés" fill="#ba1a1a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-md mt-sm pt-sm border-t border-outline-variant/20">
              <div className="flex items-center gap-xs">
                <div className="w-3 h-3 rounded-full bg-[#d2c5ae]" />
                <span className="text-label-sm text-on-surface-variant">Attendu</span>
              </div>
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

          {/* Contrats actifs + résumé financier */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
            {/* Résumé financier */}
            <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
              <h4 className="font-bold text-on-surface mb-md flex items-center gap-2">
                <Icon name="account_balance_wallet" size={16} className="text-primary" />
                Résumé financier
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-body-sm text-on-surface-variant">Loyer attendu/mois</span>
                  <span className="font-bold text-on-surface">{fmt(expectedMonthly)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-body-sm text-on-surface-variant">Encaissé ({hasPeriod ? 'période' : curMonthLbl})</span>
                  <span className="font-bold text-green-700">{fmt(collectedTotal)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-body-sm text-on-surface-variant">Impayés ({hasPeriod ? 'période' : curMonthLbl})</span>
                  <span className={`font-bold ${pendingAmount > 0 ? 'text-error' : 'text-green-700'}`}>{fmt(pendingAmount)}</span>
                </div>
                <div className="border-t border-outline-variant/20 pt-2 flex justify-between items-center">
                  <span className="text-body-sm text-on-surface-variant font-semibold">Revenu annuel estimé</span>
                  <span className="font-black text-primary">{fmt(expectedAnnual)}</span>
                </div>
              </div>
            </div>

            {/* Locataires ne payant pas ce mois */}
            <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 sm:col-span-2 lg:col-span-3">
              <h4 className="font-bold text-on-surface mb-md flex items-center gap-2">
                <Icon name="person_off" size={16} className="text-error" />
                Locataires ne payant pas ce mois ({curMonthLbl}) · {unpaidThisMonth.length}
              </h4>
              {unpaidThisMonth.length === 0 ? (
                <div className="text-center py-4 text-green-700 text-body-sm flex items-center justify-center gap-2">
                  <Icon name="check_circle" size={18} /> Tous les locataires sont à jour ce mois
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-on-surface-variant text-xs border-b border-outline-variant/20">
                        <th className="text-left py-2 font-semibold">Locataire</th>
                        <th className="text-left py-2 font-semibold">Bien</th>
                        <th className="text-right py-2 font-semibold">Loyer</th>
                        <th className="text-left py-2 font-semibold pl-3">Motif</th>
                        <th className="text-left py-2 font-semibold">Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unpaidThisMonth.map((u, i) => (
                        <tr key={i} className="border-b border-outline-variant/10">
                          <td className="py-2 font-medium text-on-surface">{u.name}</td>
                          <td className="py-2 text-on-surface-variant">{u.property}</td>
                          <td className="py-2 text-right">{fmt(u.rent)}</td>
                          <td className="py-2 pl-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.enAvance ? 'bg-amber-100 text-amber-800' : 'bg-error/10 text-error'}`}>{u.motif}</span>
                          </td>
                          <td className="py-2 text-on-surface-variant text-xs">{u.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Contrats actifs */}
            <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 sm:col-span-1 lg:col-span-2">
              <h4 className="font-bold text-on-surface mb-md flex items-center gap-2">
                <Icon name="contract" size={16} className="text-primary" />
                Contrats actifs ({activeContractsCount})
              </h4>
              {ownerContracts.filter(isActiveContract).length === 0 ? (
                <div className="text-center py-4 text-on-surface-variant">
                  <Icon name="contract" size={32} className="opacity-20 mb-2" />
                  <p className="text-body-sm">Aucun contrat actif</p>
                  {ownerProperties.length > 0 && (
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      {occupiedCount} bien(s) marqué(s) "Loué" sans contrat enregistré
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {ownerContracts.filter(isActiveContract).map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-outline-variant/10 last:border-0">
                      <div className="min-w-0">
                        <p className="font-semibold text-on-surface text-body-sm truncate">{c.propertyName || c.bien || '—'}</p>
                        <p className="text-[11px] text-on-surface-variant truncate">{c.tenant} · Bail : {c.endDate || '—'}</p>
                      </div>
                      <span className="font-bold text-primary text-body-sm flex-shrink-0 ml-2">{fmt(c.rent)}</span>
                    </div>
                  ))}
                </div>
              )}
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

      {/* ── REVENUS (4 soldes) ───────────────────────────────────── */}
      {activeTab === 'revenus' && (
        <div className="px-4 sm:px-6 md:px-8 pb-8 max-w-5xl mx-auto flex flex-col gap-4">
          {/* Sélection du mois + type de reversement */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={revMonth} onChange={e => setRevMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container text-sm">
              <option value="Tous">Tous les mois</option>
              {revMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="inline-flex rounded-xl border border-outline-variant/40 overflow-hidden">
              <button onClick={() => setRevType('encaissements')}
                className={`px-3 py-2 text-sm font-semibold ${revType === 'encaissements' ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant'}`}>
                Encaissements du mois
              </button>
              <button onClick={() => setRevType('nouveaux')}
                className={`px-3 py-2 text-sm font-semibold ${revType === 'nouveaux' ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant'}`}>
                Nouveaux locataires
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(revType === 'encaissements' ? [
              { label: 'Loyers bruts encaissés', value: revenus.brut, icon: 'payments', cls: 'text-primary bg-primary/10' },
              { label: 'Commissions Minsouah', value: revenus.commissions, icon: 'percent', cls: 'text-amber-700 bg-amber-100', neg: true },
              { label: 'Déjà reversé', value: revenus.dejaReverse, icon: 'check_circle', cls: 'text-blue-700 bg-blue-100' },
              { label: 'Solde restant à reverser', value: revenus.soldeRestant, icon: 'account_balance_wallet', cls: 'text-green-700 bg-green-100' },
            ] : [
              { label: 'Cautions reçues', value: revDeposits.caution, icon: 'savings', cls: 'text-blue-700 bg-blue-100' },
              { label: 'Avances reçues', value: revDeposits.avance, icon: 'payments', cls: 'text-primary bg-primary/10' },
              { label: 'Total à reverser (nouveaux)', value: revDeposits.total, icon: 'account_balance_wallet', cls: 'text-green-700 bg-green-100' },
              { label: 'Nouveaux locataires', value: revDeposits.list.length, icon: 'group', cls: 'text-on-surface bg-surface-container-high', count: true },
            ]).map(c => (
              <div key={c.label} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-4 shadow-card">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${c.cls}`}><Icon name={c.icon} size={20} /></div>
                <p className="text-xs text-on-surface-variant">{c.label}</p>
                <p className={`text-lg font-black mt-0.5 ${c.neg ? 'text-amber-700' : 'text-on-surface'}`}>{c.neg && c.value ? '−' : ''}{c.count ? c.value : fmtCFA(c.value)}</p>
              </div>
            ))}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2">
            <Icon name="info" size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <span>{revType === 'encaissements'
              ? <><strong>Loyers bruts</strong> = total encaissé{revMonth !== 'Tous' ? ` en ${revMonth}` : ''}. <strong>Commissions</strong> = honoraires Minsouah. Le <strong>solde restant</strong> est le net qui vous sera reversé.</>
              : <>Cautions et avances des <strong>nouveaux locataires</strong>{revMonth !== 'Tous' ? ` entrés en ${revMonth}` : ''}, à reverser en plus des loyers du mois.</>}</span>
          </div>

          {revType === 'nouveaux' && revDeposits.list.length > 0 && (
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-4 shadow-card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-high text-on-surface-variant">
                  <tr>{['Locataire', 'Bien', 'Entrée', 'Caution', 'Avance', 'Total'].map(h => <th key={h} className="px-3 py-2 text-xs font-bold uppercase">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {revDeposits.list.map((t, i) => (
                    <tr key={t.id || i}>
                      <td className="px-3 py-2 font-semibold">{t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim() || '—'}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{t.property || '—'}</td>
                      <td className="px-3 py-2 text-on-surface-variant">{t.since || '—'}</td>
                      <td className="px-3 py-2">{fmtCFA(t.cautionAmount)}</td>
                      <td className="px-3 py-2">{fmtCFA(t.advanceAmount)}</td>
                      <td className="px-3 py-2 font-bold text-green-700">{fmtCFA((Number(t.cautionAmount) || 0) + (Number(t.advanceAmount) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-4 shadow-card">
            <h3 className="font-bold text-on-surface mb-3 flex items-center gap-2"><Icon name="history" size={18} /> Historique des reversements</h3>
            {ownerVersements.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-6">Aucun reversement effectué pour le moment.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container-high text-on-surface-variant">
                    <tr>{['N° Bordereau', 'Date', 'Loyers', 'Net reversé', 'Mode'].map(h => <th key={h} className="px-3 py-2 text-xs font-bold uppercase">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {ownerVersements.map(b => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-mono font-semibold">{b.number}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{b.date}</td>
                        <td className="px-3 py-2">{fmtCFA(b.totalAmount)}</td>
                        <td className="px-3 py-2 font-bold text-green-700">{fmtCFA(b.totalNet)}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{b.paymentMode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
                        <Icon name="payments" size={14} />{fmtK(prop.rent)} FCFA/mois
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
      {activeTab === 'finance' && (() => {
        // Arriérés: owner payments that are unpaid from past months
        const now2 = new Date();
        const ownerArrears = ownerPayments.filter(p => {
          if (p.status === 'Payé' || p.status === 'Annulé') return false;
          if (!p.month) return false;
          const MNAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
          const [mn, yr] = p.month.split(' ');
          const idx = MNAMES.indexOf(mn);
          if (idx === -1) return false;
          const y = parseInt(yr);
          return y < now2.getFullYear() || (y === now2.getFullYear() && idx < now2.getMonth());
        });
        const arrearsByTenantOwner = Object.values(ownerArrears.reduce((acc, p) => {
          const key = (p.tenantName || '—').toLowerCase();
          if (!acc[key]) acc[key] = { name: p.tenantName || '—', months: [], total: 0 };
          acc[key].months.push(p.month);
          acc[key].total += p.amount || 0;
          return acc;
        }, {})).sort((a, b) => b.total - a.total);

        // Per-property revenue
        const revenueByProp = ownerProperties.map(p => {
          const propNorm = (p.name || '').toLowerCase().trim();
          const collected = ownerPayments.filter(pm =>
            pm.status === 'Payé' && (pm.propertyName || '').toLowerCase().trim() === propNorm
          ).reduce((s, pm) => s + (pm.amount || 0), 0);
          const contract = ownerContracts.filter(isActiveContract).find(c =>
            (c.propertyName || '').toLowerCase().trim() === propNorm
          );
          return { name: p.name, collected, rent: contract?.rent || p.rent || 0 };
        }).filter(d => d.collected > 0 || d.rent > 0);

        // Recovery rate per month
        const recovRateData = monthlyRevData.map(d => ({
          mois: d.mois,
          taux: d.attendu > 0 ? Math.round(d.revenus / d.attendu * 100) : 0,
        }));

        return (
        <div className="flex flex-col gap-gutter">

          {/* Arrears alert */}
          {ownerArrears.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-md">
              <h4 className="font-bold text-red-800 mb-3 flex items-center gap-2">
                <Icon name="warning" size={16} className="text-red-600" />
                Arriérés — {ownerArrears.length} paiement(s) en retard · {fmt(ownerArrears.reduce((s,p)=>s+(p.amount||0),0))} dus
              </h4>
              <div className="flex flex-col gap-2">
                {arrearsByTenantOwner.map(g => (
                  <div key={g.name} className="bg-white rounded-lg px-3 py-2 flex items-center justify-between gap-2 border border-red-100">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-red-900">{g.name}</p>
                      <p className="text-xs text-red-600">{g.months.join(' · ')}</p>
                    </div>
                    <span className="font-black text-red-700 text-sm flex-shrink-0">{fmt(g.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
            {/* Cashflow line chart */}
            <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
              <h3 className="font-h3 text-h3 text-on-surface mb-1">Encaissements mensuel</h3>
              <p className="text-body-sm text-on-surface-variant mb-md">Attendu vs encaissé vs impayé</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyRevData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={78} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="attendu" name="Attendu" fill="#d2c5ae" radius={[3,3,0,0]} />
                    <Bar dataKey="revenus" name="Encaissé" fill="#785a00" radius={[3,3,0,0]} />
                    <Bar dataKey="impayés" name="Impayés" fill="#ba1a1a" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-md mt-2 pt-2 border-t border-outline-variant/20">
                {[['#d2c5ae','Attendu'],['#785a00','Encaissé'],['#ba1a1a','Impayés']].map(([c,l]) => (
                  <div key={l} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:c}} />
                    <span className="text-[10px] text-on-surface-variant">{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recovery rate line chart */}
            <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
              <h3 className="font-h3 text-h3 text-on-surface mb-1">Taux de recouvrement</h3>
              <p className="text-body-sm text-on-surface-variant mb-md">% encaissé vs attendu par mois</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={recovRateData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} vertical={false} />
                    <XAxis dataKey="mois" tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} domain={[0,100]} unit="%" width={38} />
                    <Tooltip formatter={(v) => [`${v}%`, 'Taux']} />
                    <Line type="monotone" dataKey="taux" name="Taux" stroke="#785a00" strokeWidth={2.5} dot={{ r: 3, fill: '#785a00' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Revenue by property */}
          {revenueByProp.length > 0 && (
            <div className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
              <h3 className="font-h3 text-h3 text-on-surface mb-1">Revenus par bien</h3>
              <p className="text-body-sm text-on-surface-variant mb-md">Encaissé cumulé · loyer mensuel attendu</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueByProp} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4" stroke="#d2c5ae" strokeOpacity={0.3} horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#817662', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip formatter={(v, n) => [fmt(v), n === 'collected' ? 'Encaissé' : 'Loyer/mois']} />
                    <Bar dataKey="rent" name="Loyer/mois" fill="#d2c5ae" radius={[0,4,4,0]} />
                    <Bar dataKey="collected" name="Encaissé" fill="#785a00" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-md mt-2 pt-2 border-t border-outline-variant/20">
                {[['#d2c5ae','Loyer/mois attendu'],['#785a00','Total encaissé']].map(([c,l]) => (
                  <div key={l} className="flex items-center gap-1">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:c}} />
                    <span className="text-[10px] text-on-surface-variant">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            {[
              { l: 'Loyer attendu/mois', v: fmt(expectedMonthly), c: 'text-primary' },
              { l: 'Revenu annuel estimé', v: fmt(expectedAnnual), c: 'text-primary' },
              { l: 'Total encaissé', v: fmt(collectedTotal), c: 'text-green-700' },
              { l: 'Total arriérés', v: fmt(ownerArrears.reduce((s,p)=>s+(p.amount||0),0)), c: ownerArrears.length > 0 ? 'text-red-700' : 'text-green-700' },
            ].map(item => (
              <div key={item.l} className="bg-surface-container-lowest rounded-xl p-3 border border-outline-variant/20 text-center shadow-card">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-wide mb-1">{item.l}</p>
                <p className={`font-black text-sm ${item.c}`}>{item.v}</p>
              </div>
            ))}
          </div>

          {/* Payments table */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="px-md py-md border-b border-outline-variant/20 flex items-center justify-between">
              <h3 className="font-h3 text-h3 text-on-surface">Détail des paiements</h3>
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
        );
      })()}

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
