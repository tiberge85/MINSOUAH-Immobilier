import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input, { Select } from '../components/ui/Input';
import Icon from '../components/Icon';

const MONTHS = [
  'Novembre 2024', 'Octobre 2024', 'Septembre 2024',
];
const STATUS_OPTS = ['Tous', 'Payé', 'Impayé', 'En retard'];

const statusColor = {
  'Payé':     'text-green-700 bg-green-100',
  'Impayé':   'text-error bg-error-container',
  'En retard':'text-amber-700 bg-amber-100',
};
const statusIcon = {
  'Payé':     'check_circle',
  'Impayé':   'cancel',
  'En retard':'schedule',
};

function generateReportHTML(month, payments, allPayments) {
  const mp = allPayments.filter(p => p.month === month);
  const paid = mp.filter(p => p.status === 'Payé');
  const unpaid = mp.filter(p => p.status !== 'Payé');
  const totalExpected = mp.reduce((s, p) => s + p.amount, 0);
  const totalCollected = paid.reduce((s, p) => s + p.amount, 0);
  const totalPending = unpaid.reduce((s, p) => s + p.amount, 0);
  const rate = mp.length ? Math.round((paid.length / mp.length) * 100) : 0;

  const rows = mp.map(p => `
    <tr>
      <td>${p.propertyName}</td>
      <td>${p.tenantName}</td>
      <td style="text-align:right">${p.amount.toLocaleString('fr-FR')} FCFA</td>
      <td>${p.dueDate}</td>
      <td>${p.paidDate || '—'}</td>
      <td style="font-weight:600;color:${p.status === 'Payé' ? '#166534' : p.status === 'En retard' ? '#92400e' : '#991b1b'}">${p.status}</td>
      <td>${p.reminderCount > 0 ? `${p.reminderCount} rappel(s)` : '—'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport Financier — ${month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1b19; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #785a00; padding-bottom: 16px; }
  .brand { font-size: 28px; font-weight: 900; color: #785a00; letter-spacing: -1px; }
  .subtitle { font-size: 12px; color: #817662; text-transform: uppercase; letter-spacing: 2px; margin-top: 4px; }
  .report-title { text-align: right; }
  .report-title h2 { font-size: 18px; font-weight: 700; color: #1c1b19; }
  .report-title p { font-size: 12px; color: #817662; margin-top: 4px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
  .kpi { background: #fff8f2; border: 1px solid #e3d9cc; border-radius: 12px; padding: 16px; }
  .kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #817662; margin-bottom: 6px; }
  .kpi-value { font-size: 22px; font-weight: 800; color: #1c1b19; }
  .kpi-value.green { color: #166534; }
  .kpi-value.red { color: #991b1b; }
  .kpi-value.gold { color: #785a00; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #785a00; color: white; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  td { padding: 10px 12px; border-bottom: 1px solid #e3d9cc; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) { background: #fff8f2; }
  .section-title { font-size: 15px; font-weight: 700; color: #1c1b19; margin-bottom: 12px; margin-top: 28px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e3d9cc; font-size: 11px; color: #817662; display: flex; justify-content: space-between; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">Minsouah</div>
    <div class="subtitle">L'immobilier réinventé</div>
  </div>
  <div class="report-title">
    <h2>Rapport de Paiements des Loyers</h2>
    <p>Période : ${month}</p>
    <p>Généré le : ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
  </div>
</div>

<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Loyers Attendus</div>
    <div class="kpi-value gold">${totalExpected.toLocaleString('fr-FR')} FCFA</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Encaissés</div>
    <div class="kpi-value green">${totalCollected.toLocaleString('fr-FR')} FCFA</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Impayés / En retard</div>
    <div class="kpi-value red">${totalPending.toLocaleString('fr-FR')} FCFA</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Taux de Recouvrement</div>
    <div class="kpi-value ${rate >= 80 ? 'green' : 'red'}">${rate}%</div>
  </div>
</div>

<div class="section-title">Détail des Paiements — ${month}</div>
<table>
  <thead>
    <tr>
      <th>Propriété</th>
      <th>Locataire</th>
      <th>Montant</th>
      <th>Échéance</th>
      <th>Payé le</th>
      <th>Statut</th>
      <th>Rappels</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

${unpaid.length > 0 ? `
<div class="section-title" style="color:#991b1b">⚠ Impayés à relancer (${unpaid.length})</div>
<table>
  <thead>
    <tr><th>Propriété</th><th>Locataire</th><th>Montant dû</th><th>Statut</th></tr>
  </thead>
  <tbody>
    ${unpaid.map(p => `
      <tr>
        <td>${p.propertyName}</td>
        <td>${p.tenantName}</td>
        <td style="text-align:right;font-weight:700;color:#991b1b">${p.amount.toLocaleString('fr-FR')} FCFA</td>
        <td style="font-weight:600;color:${p.status === 'En retard' ? '#92400e' : '#991b1b'}">${p.status}</td>
      </tr>`).join('')}
  </tbody>
</table>` : ''}

<div class="footer">
  <span>Minsouah — Gestion Immobilière</span>
  <span>Document généré automatiquement — Confidentiel</span>
</div>

<script>window.onload = () => window.print();</script>
</body>
</html>`;
}

const newPaymentForm0 = {
  propertyName: '', tenantName: '', amount: '', month: MONTHS[0], dueDate: '', contractId: '',
};

export default function Payments() {
  const { state, dispatch } = useApp();
  const { payments, contracts } = state;

  const [selectedMonth, setSelectedMonth] = useState(MONTHS[0]);
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [search, setSearch] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState(newPaymentForm0);
  const [reminderModal, setReminderModal] = useState(null);

  const allMonths = useMemo(() => {
    const set = new Set(payments.map(p => p.month));
    MONTHS.forEach(m => set.add(m));
    return [...set].sort((a, b) => {
      const monthOrder = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
      const [am, ay] = a.split(' ');
      const [bm, by] = b.split(' ');
      return by - ay || monthOrder.indexOf(bm) - monthOrder.indexOf(am);
    });
  }, [payments]);

  const filtered = payments.filter(p => {
    const matchMonth = p.month === selectedMonth;
    const matchStatus = statusFilter === 'Tous' || p.status === statusFilter;
    const matchSearch = p.propertyName.toLowerCase().includes(search.toLowerCase()) ||
      p.tenantName.toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchStatus && matchSearch;
  });

  const monthPayments = payments.filter(p => p.month === selectedMonth);
  const totalExpected = monthPayments.reduce((s, p) => s + p.amount, 0);
  const totalCollected = monthPayments.filter(p => p.status === 'Payé').reduce((s, p) => s + p.amount, 0);
  const totalPending = monthPayments.filter(p => p.status !== 'Payé').reduce((s, p) => s + p.amount, 0);
  const recoveryRate = monthPayments.length
    ? Math.round((monthPayments.filter(p => p.status === 'Payé').length / monthPayments.length) * 100)
    : 0;

  const handleMarkPaid = (id) => dispatch({ type: 'MARK_PAYMENT_PAID', payload: id });
  const handleReminder = (id) => dispatch({ type: 'SEND_REMINDER', payload: id });

  const handleAddPayment = () => {
    dispatch({
      type: 'ADD_PAYMENT',
      payload: {
        ...form,
        amount: parseFloat(form.amount) || 0,
        contractId: parseInt(form.contractId) || null,
        status: 'Impayé',
        paidDate: null,
        reminderSent: false,
        reminderCount: 0,
      },
    });
    setAddModal(false);
    setForm(newPaymentForm0);
  };

  const handleGenerateReport = () => {
    const html = generateReportHTML(selectedMonth, filtered, payments);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const stats = [
    { label: 'Loyers Attendus', value: `${totalExpected.toLocaleString('fr-FR')} FCFA`, icon: 'request_quote', color: 'bg-primary/10 text-primary' },
    { label: 'Encaissés', value: `${totalCollected.toLocaleString('fr-FR')} FCFA`, icon: 'check_circle', color: 'bg-green-100 text-green-700' },
    { label: 'Impayés', value: `${totalPending.toLocaleString('fr-FR')} FCFA`, icon: 'warning', color: 'bg-error/10 text-error' },
    { label: 'Recouvrement', value: `${recoveryRate}%`, icon: 'percent', color: recoveryRate >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700' },
  ];

  return (
    <div className="px-margin pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* Header actions */}
      <div className="flex flex-wrap gap-sm items-center justify-between">
        <div className="flex flex-wrap gap-sm">
          <Button icon="add_circle" onClick={() => setAddModal(true)}>
            Nouveau Paiement
          </Button>
          <Button icon="picture_as_pdf" variant="secondary" onClick={handleGenerateReport}>
            Rapport Mensuel
          </Button>
        </div>
        {/* Month selector */}
        <div className="flex items-center gap-sm bg-surface-container-lowest border border-outline-variant rounded-xl px-md py-xs shadow-card">
          <Icon name="calendar_month" className="text-primary" size={18} />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none text-body-sm text-on-surface focus:outline-none"
          >
            {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-md">
        {stats.map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-center gap-md">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${s.color}`}>
              <Icon name={s.icon} size={22} />
            </div>
            <div>
              <p className="text-on-surface-variant text-label-sm font-label-sm uppercase tracking-wider">{s.label}</p>
              <p className="font-h3 text-h3 text-on-surface font-bold mt-0.5">{s.value}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Filters */}
      <div className="bg-surface-container-lowest rounded-xl p-sm shadow-card border border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center gap-md">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
          <input
            type="text"
            placeholder="Propriété, locataire..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-md py-xs border border-outline-variant rounded-lg bg-surface-container-low text-body-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-wrap gap-xs">
          {STATUS_OPTS.map(opt => (
            <button
              key={opt}
              onClick={() => setStatusFilter(opt)}
              className={`px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${
                statusFilter === opt ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        <span className="ml-auto text-body-sm text-on-surface-variant">{filtered.length} paiement(s)</span>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary text-on-primary">
              <tr>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Propriété / Locataire</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider text-right">Montant</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Échéance</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Payé le</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Statut</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider">Rappels</th>
                <th className="px-md py-3 text-label-sm font-label-sm uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-xl text-on-surface-variant">
                    <Icon name="payments" size={40} className="opacity-30 mb-md" />
                    <p>Aucun paiement pour ce mois</p>
                  </td>
                </tr>
              )}
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="px-md py-4">
                    <p className="text-label-md font-label-md text-on-surface">{p.propertyName}</p>
                    <p className="text-body-sm text-on-surface-variant">{p.tenantName}</p>
                  </td>
                  <td className="px-md py-4 text-right">
                    <span className={`font-label-md text-label-md ${p.status === 'Payé' ? 'text-green-700' : 'text-error'}`}>
                      {p.amount.toLocaleString('fr-FR')} FCFA
                    </span>
                  </td>
                  <td className="px-md py-4 text-body-sm text-on-surface">{p.dueDate}</td>
                  <td className="px-md py-4 text-body-sm text-on-surface">{p.paidDate || <span className="text-on-surface-variant">—</span>}</td>
                  <td className="px-md py-4">
                    <span className={`inline-flex items-center gap-1 px-sm py-0.5 rounded-full text-label-sm font-label-sm ${statusColor[p.status] || ''}`}>
                      <Icon name={statusIcon[p.status] || 'info'} size={13} />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-md py-4">
                    {p.reminderCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-label-sm text-amber-700">
                        <Icon name="notifications_active" size={14} />
                        {p.reminderCount} envoyé(s)
                      </span>
                    ) : (
                      <span className="text-on-surface-variant text-body-sm">—</span>
                    )}
                  </td>
                  <td className="px-md py-4">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.status !== 'Payé' && (
                        <>
                          <button
                            onClick={() => handleMarkPaid(p.id)}
                            title="Marquer comme payé"
                            className="flex items-center gap-1 px-sm py-xs bg-green-100 text-green-700 rounded-lg text-label-sm font-label-sm hover:bg-green-200 transition-colors"
                          >
                            <Icon name="check_circle" size={14} />
                            Marquer Payé
                          </button>
                          <button
                            onClick={() => setReminderModal(p)}
                            title="Envoyer un rappel"
                            className="flex items-center gap-1 px-sm py-xs bg-amber-100 text-amber-700 rounded-lg text-label-sm font-label-sm hover:bg-amber-200 transition-colors"
                          >
                            <Icon name="notifications" size={14} />
                            Rappel
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-md py-3 bg-surface-container-low border-t border-outline-variant/20 flex justify-between items-center">
          <span className="text-body-sm text-on-surface-variant">
            {monthPayments.filter(p => p.status === 'Payé').length} / {monthPayments.length} paiements reçus — {recoveryRate}% de recouvrement
          </span>
          <span className={`text-label-sm font-label-sm ${recoveryRate >= 80 ? 'text-green-700' : 'text-error'}`}>
            {recoveryRate >= 80 ? '✓ Bon taux' : '⚠ Taux faible'}
          </span>
        </div>
      </div>

      {/* ── Reminder Confirm Modal ──────────────────────────────────────── */}
      <Modal
        open={!!reminderModal}
        onClose={() => setReminderModal(null)}
        title="Envoyer un Rappel d'Impayé"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReminderModal(null)}>Annuler</Button>
            <Button
              icon="send"
              onClick={() => { handleReminder(reminderModal.id); setReminderModal(null); }}
            >
              Confirmer l'Envoi
            </Button>
          </>
        }
      >
        {reminderModal && (
          <div className="flex flex-col gap-md">
            <div className="flex items-start gap-md p-md bg-amber-50 border border-amber-200 rounded-xl">
              <Icon name="notifications_active" className="text-amber-600 flex-shrink-0 mt-0.5" size={22} />
              <div>
                <p className="text-label-md font-label-md text-on-surface">Rappel pour <strong>{reminderModal.tenantName}</strong></p>
                <p className="text-body-sm text-on-surface-variant mt-1">
                  Loyer de <strong>{reminderModal.amount.toLocaleString('fr-FR')} FCFA</strong> — {reminderModal.month}<br />
                  Propriété : <strong>{reminderModal.propertyName}</strong>
                </p>
                {reminderModal.reminderCount > 0 && (
                  <p className="text-label-sm text-amber-700 mt-2">
                    ⚠ {reminderModal.reminderCount} rappel(s) déjà envoyé(s)
                  </p>
                )}
              </div>
            </div>
            <p className="text-body-sm text-on-surface-variant">
              Le statut passera en <strong>"En retard"</strong> et le compteur de rappels sera incrémenté.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Add Payment Modal ───────────────────────────────────────────── */}
      <Modal
        open={addModal}
        onClose={() => { setAddModal(false); setForm(newPaymentForm0); }}
        title="Enregistrer un Paiement Manuel"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddModal(false)}>Annuler</Button>
            <Button icon="add_circle" onClick={handleAddPayment} disabled={!form.propertyName || !form.tenantName || !form.amount}>
              Enregistrer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <div className="grid grid-cols-2 gap-md">
            <Input
              label="Propriété"
              placeholder="Nom de la propriété"
              value={form.propertyName}
              onChange={e => setForm(f => ({ ...f, propertyName: e.target.value }))}
              icon="apartment"
              required
            />
            <Input
              label="Locataire"
              placeholder="Nom du locataire"
              value={form.tenantName}
              onChange={e => setForm(f => ({ ...f, tenantName: e.target.value }))}
              icon="person"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-md">
            <Input
              label="Montant (FCFA)"
              type="number"
              placeholder="Ex: 4200"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              icon="payments"
              required
            />
            <div>
              <label className="text-label-md font-label-md text-on-surface-variant block mb-1">Mois concerné</label>
              <select
                value={form.month}
                onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-sm text-on-surface focus:outline-none focus:border-primary"
              >
                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <Input
            label="Date d'échéance"
            type="date"
            value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
            icon="calendar_today"
          />
        </div>
      </Modal>
    </div>
  );
}
