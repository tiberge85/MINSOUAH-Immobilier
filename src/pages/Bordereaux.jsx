import { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { QRCodeCanvas } from 'qrcode.react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import Icon from '../components/Icon';
import SearchSelect from '../components/SearchSelect';
import SignaturePad from '../components/SignaturePad';
import { can } from '../lib/permissions';
import { openBordereauPrint } from '../lib/bordereauReport';

const PAYMENT_MODES = ['Espèces', 'Chèque', 'Virement', 'Mobile Money', 'Mixte'];
const STATUSES = ['Brouillon', 'En attente de validation', 'Validé', 'Annulé'];
const STATUS_STYLE = {
  'Brouillon': 'bg-surface-container-high text-on-surface-variant',
  'En attente de validation': 'bg-amber-100 text-amber-700',
  'Validé': 'bg-green-100 text-green-700',
  'Annulé': 'bg-error/10 text-error',
};

const fmt = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} XOF`;
const todayISO = () => new Date().toISOString().slice(0, 10);
const nowHM = () => new Date().toTimeString().slice(0, 5);
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
// Sortable key for a "Mois AAAA" label (e.g. "Juillet 2026" → 202606)
const monthKey = (label) => {
  const [mn, yr] = (label || '').split(' ');
  const idx = MONTHS_FR.indexOf(mn);
  return idx >= 0 ? Number(yr) * 100 + idx : 0;
};

/* Small button matching the app style */
function Btn({ children, icon, variant = 'primary', small, onClick, disabled }) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const size = small ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm';
  const styles = {
    primary: 'bg-primary text-on-primary hover:bg-primary/90',
    secondary: 'bg-surface-container-high text-on-surface hover:bg-surface-container',
    green: 'bg-green-600 text-white hover:bg-green-700',
    amber: 'bg-amber-500 text-white hover:bg-amber-600',
    danger: 'bg-error/10 text-error hover:bg-error/20',
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${size} ${styles[variant]}`}>
      {icon && <Icon name={icon} size={small ? 14 : 18} />}{children}
    </button>
  );
}

export default function Bordereaux() {
  const { state, dispatch } = useApp();
  const toast = useToast();
  const { payments = [], owners = [], properties = [], orgSettings, currentUser, bordereaux = [] } = state;

  const canCreate = can(currentUser, 'bordereaux', 'create');
  const canEdit = can(currentUser, 'bordereaux', 'edit');
  const canDelete = can(currentUser, 'bordereaux', 'delete');
  const canValidate = can(currentUser, 'bordereaux', 'validate');

  const [tab, setTab] = useState('dashboard');
  const [detail, setDetail] = useState(null);      // bordereau being viewed
  const [printTarget, setPrintTarget] = useState(null);
  const qrRef = useRef(null);

  /* ── Print via a hidden QR canvas → data URL → print window ── */
  useEffect(() => {
    if (!printTarget) return;
    const t = setTimeout(() => {
      let qrUrl = '';
      try { qrUrl = qrRef.current?.toDataURL('image/png') || ''; } catch { /* ignore */ }
      openBordereauPrint(printTarget, orgSettings, qrUrl);
      dispatch({ type: 'LOG_ACTIVITY', payload: { details: `Bordereau ${printTarget.number} imprimé`, action: 'BORDEREAU_PRINT' } });
      setPrintTarget(null);
    }, 120);
    return () => clearTimeout(t);
  }, [printTarget, orgSettings, dispatch]);

  const verifyUrl = (b) => `${window.location.origin}/#/bordereau/${b?.id || ''}`;

  /* ── Owner resolution for a payment ── */
  const ownerIdOfPayment = (p) => {
    if (p.ownerId != null) return Number(p.ownerId);
    const prop = properties.find(pr => (pr.propertyName || '').toLowerCase() === (p.propertyName || '').toLowerCase());
    return prop?.ownerId != null ? Number(prop.ownerId) : null;
  };

  const paidPayments = useMemo(() => payments.filter(p => p.status === 'Payé'), [payments]);
  const eligibleCompta = useMemo(() => paidPayments.filter(p => !p.versementComptaId), [paidPayments]);

  /* ════════════════ DASHBOARD METRICS ════════════════ */
  const metrics = useMemo(() => {
    const totalEncaisse = paidPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const validCompta = bordereaux.filter(b => b.type === 'COMPTA' && b.status === 'Validé');
    const validProprio = bordereaux.filter(b => b.type === 'PROPRIETAIRE' && b.status === 'Validé');
    const verseCompta = validCompta.reduce((s, b) => s + (b.totalAmount || 0), 0);
    const reverseProprio = validProprio.reduce((s, b) => s + (b.totalNet || 0), 0);
    const enAttenteReversement = paidPayments.filter(p => !p.versementProprioId && !p.avanceVerseeProprio).reduce((s, p) => s + (p.amount || 0), 0);
    return {
      totalEncaisse, verseCompta, reverseProprio, enAttenteReversement,
      nbCrees: bordereaux.length,
      nbValides: bordereaux.filter(b => b.status === 'Validé').length,
      nbAnnules: bordereaux.filter(b => b.status === 'Annulé').length,
      nbAttente: bordereaux.filter(b => b.status === 'En attente de validation').length,
    };
  }, [paidPayments, bordereaux]);

  const [granularity, setGranularity] = useState('mois');
  const chartData = useMemo(() => {
    const buckets = {};
    const keyOf = (d) => {
      const dt = new Date(d);
      if (isNaN(dt)) return null;
      if (granularity === 'jour') return dt.toISOString().slice(0, 10);
      if (granularity === 'semaine') {
        const onejan = new Date(dt.getFullYear(), 0, 1);
        const week = Math.ceil((((dt - onejan) / 86400000) + onejan.getDay() + 1) / 7);
        return `${dt.getFullYear()}-S${String(week).padStart(2, '0')}`;
      }
      if (granularity === 'annee') return String(dt.getFullYear());
      return dt.toISOString().slice(0, 7); // mois
    };
    bordereaux.filter(b => b.status === 'Validé').forEach(b => {
      const k = keyOf(b.createdAt || b.date);
      if (!k) return;
      if (!buckets[k]) buckets[k] = { label: k, Comptabilité: 0, Propriétaire: 0 };
      if (b.type === 'PROPRIETAIRE') buckets[k].Propriétaire += b.totalNet || 0;
      else buckets[k].Comptabilité += b.totalAmount || 0;
    });
    return Object.values(buckets).sort((a, b) => a.label.localeCompare(b.label)).slice(-14);
  }, [bordereaux, granularity]);

  /* ════════════════ SEARCH / LIST ════════════════ */
  const [search, setSearch] = useState('');
  const [fType, setFType] = useState('Tous');
  const [fStatus, setFStatus] = useState('Tous');
  const filteredList = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...bordereaux]
      .filter(b => (fType === 'Tous' || b.type === fType))
      .filter(b => (fStatus === 'Tous' || b.status === fStatus))
      .filter(b => !q ||
        (b.number || '').toLowerCase().includes(q) ||
        (b.ownerName || '').toLowerCase().includes(q) ||
        (b.createdBy?.userName || '').toLowerCase().includes(q) ||
        (b.lines || []).some(l => (l.tenantName || '').toLowerCase().includes(q) || (l.propertyName || '').toLowerCase().includes(q)))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [bordereaux, search, fType, fStatus]);

  /* ════════════════ EXPORTS ════════════════ */
  const listToRows = (list) => list.map(b => ({
    Numéro: b.number, Type: b.type === 'PROPRIETAIRE' ? 'Propriétaire' : 'Comptabilité',
    Date: b.date, Statut: b.status,
    Propriétaire: b.ownerName || '',
    'Nb loyers': (b.lines || []).length,
    'Montant total': b.totalAmount || 0,
    'Net reversé': b.totalNet || 0,
    'Créé par': b.createdBy?.userName || '',
  }));
  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(listToRows(filteredList));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bordereaux');
    XLSX.writeFile(wb, `bordereaux_${todayISO()}.xlsx`);
  };
  const exportCSV = () => {
    const rows = listToRows(filteredList);
    if (!rows.length) { toast('Aucun bordereau à exporter', 'info'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h]).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `bordereaux_${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ════════════════ STATUS TRANSITIONS ════════════════ */
  const submitForValidation = (b) => { dispatch({ type: 'SET_BORDEREAU_STATUS', payload: { id: b.id, status: 'En attente de validation', step: 'controlled' } }); toast(`Bordereau ${b.number} soumis pour validation`); setDetail(null); };
  const validate = (b) => { dispatch({ type: 'SET_BORDEREAU_STATUS', payload: { id: b.id, status: 'Validé', step: 'validated' } }); toast(`Bordereau ${b.number} validé — loyers verrouillés`); setDetail(null); };
  const cancel = (b) => { if (!window.confirm(`Annuler le bordereau ${b.number} ? Les loyers seront de nouveau disponibles.`)) return; dispatch({ type: 'SET_BORDEREAU_STATUS', payload: { id: b.id, status: 'Annulé' } }); toast(`Bordereau ${b.number} annulé`); setDetail(null); };
  const remove = (b) => { if (!window.confirm(`Supprimer définitivement le bordereau ${b.number} ?`)) return; dispatch({ type: 'DELETE_BORDEREAU', payload: b.id }); toast('Bordereau supprimé'); setDetail(null); };

  if (!can(currentUser, 'bordereaux', 'view')) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <Icon name="lock" size={40} className="opacity-40 mb-2" />
        <p>Vous n'avez pas accès aux bordereaux de versement.</p>
      </div>
    );
  }

  const TABS = [
    { id: 'dashboard', label: 'Tableau de bord', icon: 'dashboard' },
    { id: 'list', label: 'Bordereaux', icon: 'receipt_long' },
    ...(canCreate ? [{ id: 'create-compta', label: 'Versement comptabilité', icon: 'account_balance' }] : []),
    ...(canCreate ? [{ id: 'create-proprio', label: 'Reversement propriétaire', icon: 'real_estate_agent' }] : []),
  ];

  return (
    <div className="p-3 sm:p-margin flex flex-col gap-md">
      {/* Hidden QR canvas used to embed the QR in the printable document */}
      {printTarget && (
        <div style={{ position: 'fixed', left: -9999, top: -9999 }}>
          <QRCodeCanvas ref={qrRef} value={verifyUrl(printTarget)} size={200} level="M" includeMargin />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar bg-surface-container rounded-2xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
            <Icon name={t.icon} size={18} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <DashboardTab metrics={metrics} chartData={chartData} granularity={granularity} setGranularity={setGranularity} />
      )}

      {tab === 'list' && (
        <ListTab
          list={filteredList} search={search} setSearch={setSearch}
          fType={fType} setFType={setFType} fStatus={fStatus} setFStatus={setFStatus}
          onOpen={setDetail} onExcel={exportExcel} onCSV={exportCSV}
        />
      )}

      {tab === 'create-compta' && canCreate && (
        <CreateCompta
          eligible={eligibleCompta} currentUser={currentUser} canValidate={canValidate}
          organizations={state.organizations || []}
          onDone={() => setTab('list')} dispatch={dispatch} toast={toast}
        />
      )}

      {tab === 'create-proprio' && canCreate && (
        <CreateProprio
          owners={owners} paidPayments={paidPayments} ownerIdOfPayment={ownerIdOfPayment}
          currentUser={currentUser} canValidate={canValidate}
          onDone={() => setTab('list')} dispatch={dispatch} toast={toast}
        />
      )}

      {/* Detail modal */}
      {detail && (
        <DetailModal
          b={detail} onClose={() => setDetail(null)}
          canEdit={canEdit} canDelete={canDelete} canValidate={canValidate}
          onPrint={() => setPrintTarget(detail)}
          onSubmit={() => submitForValidation(detail)}
          onValidate={() => validate(detail)}
          onCancel={() => cancel(detail)}
          onDelete={() => remove(detail)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════ DASHBOARD ════════════════════════════ */
function DashboardTab({ metrics, chartData, granularity, setGranularity }) {
  const cards = [
    { label: 'Total encaissé', value: metrics.totalEncaisse, icon: 'payments', color: 'text-primary bg-primary/10' },
    { label: 'Versé à la comptabilité', value: metrics.verseCompta, icon: 'account_balance', color: 'text-blue-700 bg-blue-100' },
    { label: 'Reversé aux propriétaires', value: metrics.reverseProprio, icon: 'real_estate_agent', color: 'text-green-700 bg-green-100' },
    { label: 'En attente de reversement', value: metrics.enAttenteReversement, icon: 'hourglass_top', color: 'text-amber-700 bg-amber-100' },
  ];
  return (
    <div className="flex flex-col gap-md">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${c.color}`}><Icon name={c.icon} size={20} /></div>
            <p className="text-xs text-on-surface-variant">{c.label}</p>
            <p className="text-xl font-black text-on-surface mt-0.5">{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Bordereaux créés', value: metrics.nbCrees, color: 'text-on-surface' },
          { label: 'Validés', value: metrics.nbValides, color: 'text-green-700' },
          { label: 'En attente', value: metrics.nbAttente, color: 'text-amber-700' },
          { label: 'Annulés', value: metrics.nbAnnules, color: 'text-error' },
        ].map(s => (
          <div key={s.label} className="bg-surface rounded-2xl border border-outline-variant/20 p-4 text-center">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-on-surface-variant">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="bar_chart" size={18} /> Montants validés</h3>
          <div className="flex gap-1 bg-surface-container rounded-xl p-1">
            {['jour', 'semaine', 'mois', 'annee'].map(g => (
              <button key={g} onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${granularity === g ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
                {g === 'annee' ? 'année' : g}
              </button>
            ))}
          </div>
        </div>
        {chartData.length === 0 ? (
          <div className="text-center py-12 text-on-surface-variant text-sm">Aucun bordereau validé à afficher.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="Comptabilité" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Propriétaire" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════ LIST ════════════════════════════ */
function ListTab({ list, search, setSearch, fType, setFType, fStatus, setFStatus, onOpen, onExcel, onCSV }) {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="N°, locataire, propriétaire, utilisateur…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <select value={fType} onChange={e => setFType(e.target.value)} className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container text-sm">
          <option value="Tous">Tous types</option>
          <option value="COMPTA">Comptabilité</option>
          <option value="PROPRIETAIRE">Propriétaire</option>
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container text-sm">
          <option value="Tous">Tous statuts</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Btn small variant="secondary" icon="table_view" onClick={onExcel}>Excel</Btn>
        <Btn small variant="secondary" icon="download" onClick={onCSV}>CSV</Btn>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-container-high text-on-surface-variant">
            <tr>{['N° Bordereau', 'Type', 'Date', 'Bénéficiaire', 'Montant', 'Statut', ''].map(h => (
              <th key={h} className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide">{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {list.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-on-surface-variant"><Icon name="receipt_long" size={36} className="opacity-30 mb-2" /><p>Aucun bordereau</p></td></tr>
            )}
            {list.map(b => (
              <tr key={b.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => onOpen(b)}>
                <td className="px-3 py-3 font-mono font-semibold text-on-surface">{b.number}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${b.type === 'PROPRIETAIRE' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {b.type === 'PROPRIETAIRE' ? 'Propriétaire' : 'Comptabilité'}
                  </span>
                </td>
                <td className="px-3 py-3 text-on-surface-variant">{b.date}</td>
                <td className="px-3 py-3 text-on-surface">{b.ownerName || '—'}</td>
                <td className="px-3 py-3 font-semibold text-on-surface">{fmt(b.type === 'PROPRIETAIRE' ? b.totalNet : b.totalAmount)}</td>
                <td className="px-3 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status]}`}>{b.status}</span></td>
                <td className="px-3 py-3 text-right"><Icon name="chevron_right" size={18} className="text-on-surface-variant" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════════ CREATE — COMPTA ════════════════════════════ */
function CreateCompta({ eligible, currentUser, canValidate, organizations = [], onDone, dispatch, toast }) {
  const [sel, setSel] = useState(() => new Set());
  const [monthFilter, setMonthFilter] = useState('Tous');
  const [form, setForm] = useState({ date: todayISO(), time: nowHM(), agence: '', depositedBy: currentUser?.name || '', receivedBy: '', paymentMode: 'Espèces', bank: '', beneficiaryOrgId: '', beneficiaryAccount: '', bankRef: '', observation: '' });
  const [attachments, setAttachments] = useState([]);
  const sigRef = useRef(null);

  const months = useMemo(() => [...new Set(eligible.map(p => p.month).filter(Boolean))]
    .sort((a, b) => monthKey(b) - monthKey(a)), [eligible]);
  const shownEligible = monthFilter === 'Tous' ? eligible : eligible.filter(p => p.month === monthFilter);

  const toggle = (id) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selected = eligible.filter(p => sel.has(p.id));
  const total = selected.reduce((s, p) => s + (p.amount || 0), 0);

  const onFiles = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      if (f.size > 700 * 1024) { toast(`${f.name} ignoré (> 700 Ko)`, 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => setAttachments(a => [...a, { name: f.name, type: f.type, dataUrl: reader.result }]);
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  };

  const build = (status) => {
    if (selected.length === 0) { toast('Sélectionnez au moins un loyer', 'error'); return; }
    const lines = selected.map(p => ({
      paymentId: p.id, tenantName: p.tenantName || '', propertyName: p.propertyName || '', unit: p.unit || '',
      period: p.month || '', paidDate: p.paidDate || '', method: p.method || '', paymentRef: p.reference || String(p.id),
      amount: p.amount || 0,
    }));
    dispatch({
      type: 'ADD_BORDEREAU',
      payload: {
        type: 'COMPTA', status,
        date: form.date, time: form.time,
        agence: form.agence,
        depositedBy: form.depositedBy, receivedBy: form.receivedBy,
        caissier: form.depositedBy, // legacy field kept in sync
        paymentMode: form.paymentMode,
        bank: form.bank,
        beneficiaryOrgId: form.beneficiaryOrgId,
        beneficiaryOrgName: (organizations.find(o => o.id === form.beneficiaryOrgId)?.name) || '',
        beneficiaryAccount: form.beneficiaryAccount, bankRef: form.bankRef,
        observation: form.observation, attachments,
        signatures: { caissier: sigRef.current?.getDataURL() || null },
        lines, totalAmount: total,
      },
    });
    toast(status === 'Validé' ? 'Bordereau créé et validé' : 'Bordereau enregistré en brouillon');
    onDone();
  };

  return (
    <div className="flex flex-col gap-md">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <Icon name="account_balance" size={22} className="text-blue-700 flex-shrink-0" />
        <div>
          <p className="font-bold text-blue-800">Bordereau de versement à la comptabilité</p>
          <p className="text-xs text-blue-700 mt-0.5">Sélectionnez les loyers encaissés à verser. Une fois validé, ils passent en « versé à la comptabilité » et ne sont plus sélectionnables.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-md">
        {/* Header form */}
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-3">
          <h3 className="font-bold text-on-surface">Informations du versement</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} /></Field>
            <Field label="Heure"><input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className={inp} /></Field>
            <Field label="Agence"><input value={form.agence} onChange={e => setForm(f => ({ ...f, agence: e.target.value }))} className={inp} /></Field>
            <Field label="Mode de versement">
              <select value={form.paymentMode} onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))} className={inp}>
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Versé par (déposant)"><input value={form.depositedBy} onChange={e => setForm(f => ({ ...f, depositedBy: e.target.value }))} className={inp} placeholder="Nom du déposant" /></Field>
            <Field label="Reçu par (comptable)"><input value={form.receivedBy} onChange={e => setForm(f => ({ ...f, receivedBy: e.target.value }))} className={inp} placeholder="Nom de la comptable" /></Field>
            <div className="col-span-2">
              <Field label="Organisation bénéficiaire">
                <select value={form.beneficiaryOrgId} onChange={e => setForm(f => ({ ...f, beneficiaryOrgId: e.target.value }))} className={inp}>
                  <option value="">— Choisir une organisation —</option>
                  {organizations.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Banque"><input value={form.bank} onChange={e => setForm(f => ({ ...f, bank: e.target.value }))} className={inp} /></Field>
            <Field label="Compte bénéficiaire"><input value={form.beneficiaryAccount} onChange={e => setForm(f => ({ ...f, beneficiaryAccount: e.target.value }))} className={inp} /></Field>
            <Field label="Référence bancaire"><input value={form.bankRef} onChange={e => setForm(f => ({ ...f, bankRef: e.target.value }))} className={inp} /></Field>
          </div>
          <Field label="Observation"><textarea value={form.observation} onChange={e => setForm(f => ({ ...f, observation: e.target.value }))} className={inp} rows={2} /></Field>
          <div>
            <label className="text-xs font-semibold text-on-surface-variant uppercase mb-1.5 block">Pièces jointes (reçu, scan…)</label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container border border-outline-variant/40 text-sm cursor-pointer hover:bg-surface-container-high w-fit">
              <Icon name="attach_file" size={16} /> Ajouter
              <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={onFiles} />
            </label>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-surface-container-high px-2 py-1 rounded-lg">
                    <Icon name="description" size={12} />{a.name}
                    <button onClick={() => setAttachments(list => list.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <SignaturePad ref={sigRef} label="Signature du déposant" />
        </div>

        {/* Payment selection */}
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-bold text-on-surface">Loyers à verser ({selected.length}/{shownEligible.length})</h3>
            <button onClick={() => {
              const ids = shownEligible.map(p => p.id);
              const allShownSelected = ids.length > 0 && ids.every(id => sel.has(id));
              setSel(prev => { const n = new Set(prev); ids.forEach(id => allShownSelected ? n.delete(id) : n.add(id)); return n; });
            }} className="text-xs font-semibold text-primary">Tout {shownEligible.every(p => sel.has(p.id)) && shownEligible.length ? 'désélectionner' : 'sélectionner'}</button>
          </div>
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container text-sm">
            <option value="Tous">Tous les mois ({eligible.length})</option>
            {months.map(m => <option key={m} value={m}>{m} ({eligible.filter(p => p.month === m).length})</option>)}
          </select>
          <div className="max-h-[380px] overflow-y-auto flex flex-col gap-1">
            {shownEligible.length === 0 && <p className="text-sm text-on-surface-variant text-center py-8">Aucun loyer encaissé en attente de versement{monthFilter !== 'Tous' ? ` pour ${monthFilter}` : ''}.</p>}
            {shownEligible.map(p => (
              <label key={p.id} className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${sel.has(p.id) ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/20 hover:bg-surface-container-low'}`}>
                <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="w-4 h-4 accent-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{p.tenantName}</p>
                  <p className="text-xs text-on-surface-variant truncate">{p.propertyName} · {p.month} · {p.paidDate}</p>
                </div>
                <span className="text-sm font-bold text-on-surface">{fmt(p.amount)}</span>
              </label>
            ))}
          </div>
          <div className="border-t border-outline-variant/20 pt-3 flex items-center justify-between">
            <span className="text-sm text-on-surface-variant">Total à verser</span>
            <span className="text-lg font-black text-primary">{fmt(total)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Btn variant="secondary" icon="save" onClick={() => build('Brouillon')} disabled={selected.length === 0}>Enregistrer brouillon</Btn>
        {canValidate && <Btn variant="green" icon="verified" onClick={() => build('Validé')} disabled={selected.length === 0}>Créer et valider</Btn>}
      </div>
    </div>
  );
}

/* ════════════════════════════ CREATE — PROPRIETAIRE ════════════════════════════ */
function CreateProprio({ owners, paidPayments, ownerIdOfPayment, currentUser, canValidate, onDone, dispatch, toast }) {
  const [ownerId, setOwnerId] = useState('');
  const [monthFilter, setMonthFilter] = useState('Tous');
  const [frais, setFrais] = useState('');            // global fees for the whole remittance
  const [form, setForm] = useState({ date: todayISO(), time: nowHM(), paymentMode: 'Virement', transferRef: '', observation: '' });
  const sigResp = useRef(null);
  const sigOwner = useRef(null);

  const owner = owners.find(o => String(o.id) === String(ownerId));
  const rate = owner ? (Number(owner.commissionRate) || 0) : 0;

  // All the owner's collected rents not yet reversed
  const ownerPayments = useMemo(() => {
    if (!owner) return [];
    // Exclude rents already reversed via a voucher OR manually flagged as
    // "déjà versé au propriétaire" (advance payments) so they don't reappear.
    return paidPayments.filter(p => !p.versementProprioId && !p.avanceVerseeProprio && ownerIdOfPayment(p) === Number(owner.id));
  }, [owner, paidPayments, ownerIdOfPayment]);

  const months = useMemo(() => [...new Set(ownerPayments.map(p => p.month).filter(Boolean))]
    .sort((a, b) => monthKey(b) - monthKey(a)), [ownerPayments]);
  const scope = monthFilter === 'Tous' ? ownerPayments : ownerPayments.filter(p => p.month === monthFilter);

  // Lines are computed automatically (no per-tenant selection) — commission per line
  const lines = useMemo(() => scope.map(p => {
    const amount = p.amount || 0;
    const commission = Math.round(amount * rate / 100);
    return {
      paymentId: p.id, tenantName: p.tenantName || '', propertyName: p.propertyName || '', unit: p.unit || '',
      period: p.month || '', paidDate: p.paidDate || '', method: p.method || '', paymentRef: p.reference || String(p.id),
      amount, commission, frais: 0, net: amount - commission,
    };
  }), [scope, rate]);

  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
  const totalCommission = lines.reduce((s, l) => s + l.commission, 0);
  const totalFrais = Number(frais) || 0;
  const totalNet = totalAmount - totalCommission - totalFrais;
  // Group the bilan by month for a clean recap (not per-tenant selection)
  const byMonth = useMemo(() => {
    const g = {};
    lines.forEach(l => {
      const k = l.period || '—';
      if (!g[k]) g[k] = { period: k, count: 0, amount: 0, commission: 0 };
      g[k].count++; g[k].amount += l.amount; g[k].commission += l.commission;
    });
    return Object.values(g).sort((a, b) => monthKey(b.period) - monthKey(a.period));
  }, [lines]);

  const build = (status) => {
    if (!owner) { toast('Sélectionnez un propriétaire', 'error'); return; }
    if (lines.length === 0) { toast('Aucun encaissement à reverser', 'error'); return; }
    dispatch({
      type: 'ADD_BORDEREAU',
      payload: {
        type: 'PROPRIETAIRE', status,
        date: form.date, time: form.time, paymentMode: form.paymentMode, transferRef: form.transferRef, observation: form.observation,
        periodLabel: monthFilter === 'Tous' ? 'Tous les mois' : monthFilter,
        ownerId: owner.id, ownerName: owner.name, ownerPhone: owner.phone || '', ownerEmail: owner.email || '',
        ownerBank: owner.bank || '', ownerAccount: owner.iban || '', commissionRate: rate,
        signatures: { directeur: sigResp.current?.getDataURL() || null, proprietaire: sigOwner.current?.getDataURL() || null },
        lines,
        totalAmount, totalCommission, totalFrais, totalNet,
      },
    });
    toast(status === 'Validé' ? 'Reversement créé et validé' : 'Reversement enregistré en brouillon');
    onDone();
  };

  return (
    <div className="flex flex-col gap-md">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
        <Icon name="real_estate_agent" size={22} className="text-green-700 flex-shrink-0" />
        <div>
          <p className="font-bold text-green-800">Bordereau de reversement au propriétaire</p>
          <p className="text-xs text-green-700 mt-0.5">Le bilan des encaissements du propriétaire (net de commission et de frais) lui est reversé. Choisissez éventuellement un mois précis.</p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4 flex flex-col gap-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Propriétaire">
            <SearchSelect value={ownerId} onChange={v => { setOwnerId(v); setMonthFilter('Tous'); }}
              options={owners.map(o => ({ value: String(o.id), label: `${o.name}${o.commissionRate ? ` — ${o.commissionRate}%` : ''}` }))}
              placeholder="— Choisir un propriétaire —" />
          </Field>
          <Field label="Mois concerné">
            <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={inp} disabled={!owner}>
              <option value="Tous">Tous les mois</option>
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          {owner && (
            <div className="text-sm text-on-surface-variant flex flex-col justify-center">
              <p><Icon name="percent" size={13} className="inline" /> Commission : <strong className="text-on-surface">{rate}%</strong>{!owner.commissionRate && <span className="text-amber-600"> (0%)</span>}</p>
              <p className="truncate"><Icon name="account_balance" size={13} className="inline" /> {owner.bank || '—'} · {owner.iban || 'RIB —'}</p>
            </div>
          )}
        </div>
      </div>

      {owner && (
        <>
          {/* ── BILAN des encaissements ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total encaissé', value: totalAmount, color: 'text-primary bg-primary/10', icon: 'payments' },
              { label: `Commission (${rate}%)`, value: totalCommission, color: 'text-amber-700 bg-amber-100', icon: 'percent', neg: true },
              { label: 'Frais déduits', value: totalFrais, color: 'text-amber-700 bg-amber-100', icon: 'receipt_long', neg: true },
              { label: 'Net à reverser', value: totalNet, color: 'text-green-700 bg-green-100', icon: 'account_balance_wallet' },
            ].map(c => (
              <div key={c.label} className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${c.color}`}><Icon name={c.icon} size={18} /></div>
                <p className="text-xs text-on-surface-variant">{c.label}</p>
                <p className={`text-lg font-black mt-0.5 ${c.neg ? 'text-amber-700' : 'text-on-surface'}`}>{c.neg && c.value ? '−' : ''}{fmt(c.value)}</p>
              </div>
            ))}
          </div>

          <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-bold text-on-surface">Bilan des encaissements ({lines.length} loyer{lines.length > 1 ? 's' : ''})</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-on-surface-variant">Frais à déduire</label>
                <input type="number" min="0" value={frais} placeholder="0" onChange={e => setFrais(e.target.value)}
                  className="w-32 px-3 py-1.5 rounded-lg border border-outline-variant/40 bg-surface-container text-sm" />
              </div>
            </div>
            {lines.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-8">Aucun encaissement en attente de reversement{monthFilter !== 'Tous' ? ` pour ${monthFilter}` : ''}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container-high text-on-surface-variant">
                    <tr>{['Période', 'Nb loyers', 'Encaissé', 'Commission', 'Net'].map(h => <th key={h} className="px-3 py-2 text-xs font-bold uppercase">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {byMonth.map(g => (
                      <tr key={g.period}>
                        <td className="px-3 py-2 font-semibold">{g.period}</td>
                        <td className="px-3 py-2 text-on-surface-variant">{g.count}</td>
                        <td className="px-3 py-2">{fmt(g.amount)}</td>
                        <td className="px-3 py-2 text-amber-700">−{fmt(g.commission)}</td>
                        <td className="px-3 py-2 font-bold text-green-700">{fmt(g.amount - g.commission)}</td>
                      </tr>
                    ))}
                    <tr className="bg-surface-container-high font-bold">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2">{lines.length}</td>
                      <td className="px-3 py-2">{fmt(totalAmount)}</td>
                      <td className="px-3 py-2 text-amber-700">−{fmt(totalCommission)}</td>
                      <td className="px-3 py-2 text-green-700">{fmt(totalAmount - totalCommission)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="text-xs text-on-surface-variant mt-2">Frais déduits : −{fmt(totalFrais)} → <strong className="text-green-700">Net à reverser : {fmt(totalNet)}</strong></p>
              </div>
            )}
          </div>

          <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4 grid lg:grid-cols-2 gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inp} /></Field>
              <Field label="Heure"><input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} className={inp} /></Field>
              <Field label="Mode de versement">
                <select value={form.paymentMode} onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))} className={inp}>
                  {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Référence transfert"><input value={form.transferRef} onChange={e => setForm(f => ({ ...f, transferRef: e.target.value }))} className={inp} /></Field>
              <div className="col-span-2"><Field label="Observation"><textarea value={form.observation} onChange={e => setForm(f => ({ ...f, observation: e.target.value }))} rows={2} className={inp} /></Field></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SignaturePad ref={sigResp} label="Signature du responsable" />
              <SignaturePad ref={sigOwner} label="Signature du propriétaire" subtitle="Si remise physique" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Btn variant="secondary" icon="save" onClick={() => build('Brouillon')} disabled={lines.length === 0}>Enregistrer brouillon</Btn>
            {canValidate && <Btn variant="green" icon="verified" onClick={() => build('Validé')} disabled={lines.length === 0}>Créer et valider</Btn>}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════ DETAIL MODAL ════════════════════════════ */
function DetailModal({ b, onClose, canEdit, canDelete, canValidate, onPrint, onSubmit, onValidate, onCancel, onDelete }) {
  const isProprio = b.type === 'PROPRIETAIRE';
  const v = b.validation || {};
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="font-mono font-black text-lg text-on-surface">{b.number}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status]}`}>{b.status}</span>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" size={22} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <Info label="Type" value={isProprio ? 'Reversement propriétaire' : 'Versement comptabilité'} />
            <Info label="Date" value={`${b.date || ''} ${b.time || ''}`} />
            {isProprio ? <>
              <Info label="Propriétaire" value={b.ownerName} />
              <Info label="Banque" value={`${b.ownerBank || '—'} ${b.ownerAccount || ''}`} />
            </> : <>
              <Info label="Agence" value={b.agence || '—'} />
              <Info label="Versé par" value={b.depositedBy || b.caissier || '—'} />
              <Info label="Reçu par (comptable)" value={b.receivedBy || '—'} />
              <Info label="Organisation bénéf." value={b.beneficiaryOrgName || '—'} />
            </>}
            <Info label="Mode" value={b.paymentMode || '—'} />
            <Info label="Créé par" value={b.createdBy?.userName || '—'} />
          </div>

          <div className="overflow-x-auto border border-outline-variant/20 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-container-high text-on-surface-variant">
                <tr>{['Locataire', 'Bien', 'Période', 'Montant', ...(isProprio ? ['Commission', 'Frais', 'Net'] : [])].map(h => <th key={h} className="px-3 py-2 text-xs font-bold uppercase">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {(b.lines || []).map(l => (
                  <tr key={l.paymentId}>
                    <td className="px-3 py-2 font-semibold">{l.tenantName}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{l.propertyName}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{l.period}</td>
                    <td className="px-3 py-2">{fmt(l.amount)}</td>
                    {isProprio && <><td className="px-3 py-2 text-amber-700">−{fmt(l.commission)}</td><td className="px-3 py-2">−{fmt(l.frais)}</td><td className="px-3 py-2 font-bold text-green-700">{fmt(l.net)}</td></>}
                  </tr>
                ))}
                <tr className="bg-surface-container-high font-bold">
                  <td className="px-3 py-2" colSpan={3}>TOTAUX</td>
                  <td className="px-3 py-2">{fmt(b.totalAmount)}</td>
                  {isProprio && <><td className="px-3 py-2 text-amber-700">−{fmt(b.totalCommission)}</td><td className="px-3 py-2">−{fmt(b.totalFrais)}</td><td className="px-3 py-2 text-green-700">{fmt(b.totalNet)}</td></>}
                </tr>
              </tbody>
            </table>
          </div>

          {b.observation && <div className="text-sm bg-surface-container-low rounded-xl p-3"><span className="text-xs text-on-surface-variant uppercase block mb-1">Observation</span>{b.observation}</div>}

          {/* Validation trail */}
          <div className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
            {v.created && <span className="flex items-center gap-1"><Icon name="edit" size={13} /> Créé : {v.created.userName} · {new Date(v.created.at).toLocaleString('fr-FR')}</span>}
            {v.controlled && <span className="flex items-center gap-1"><Icon name="fact_check" size={13} /> Contrôlé : {v.controlled.userName} · {new Date(v.controlled.at).toLocaleString('fr-FR')}</span>}
            {v.validated && <span className="flex items-center gap-1 text-green-700"><Icon name="verified" size={13} /> Validé : {v.validated.userName} · {new Date(v.validated.at).toLocaleString('fr-FR')}</span>}
          </div>
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-outline-variant/20 px-5 py-3 flex flex-wrap gap-2 justify-end">
          <Btn small variant="secondary" icon="print" onClick={onPrint}>Imprimer</Btn>
          {b.status === 'Brouillon' && canEdit && <Btn small variant="amber" icon="send" onClick={onSubmit}>Soumettre</Btn>}
          {(b.status === 'Brouillon' || b.status === 'En attente de validation') && canValidate && <Btn small variant="green" icon="verified" onClick={onValidate}>Valider</Btn>}
          {b.status === 'Validé' && canValidate && <Btn small variant="danger" icon="block" onClick={onCancel}>Annuler</Btn>}
          {b.status !== 'Validé' && canDelete && <Btn small variant="danger" icon="delete" onClick={onDelete}>Supprimer</Btn>}
        </div>
      </div>
    </div>
  );
}

/* ── tiny helpers ── */
const inp = 'w-full px-3 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';
function Field({ label, children }) {
  return <div><label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">{label}</label>{children}</div>;
}
function Info({ label, value }) {
  return <div className="flex justify-between border-b border-dotted border-outline-variant/30 py-1"><span className="text-on-surface-variant">{label}</span><span className="font-semibold text-on-surface text-right">{value || '—'}</span></div>;
}
