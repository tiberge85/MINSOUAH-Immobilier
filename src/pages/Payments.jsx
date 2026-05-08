import { useState, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import SignaturePad from '../components/SignaturePad';

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

const statusColor = {
  'Payé':      'text-green-700 bg-green-100',
  'Impayé':    'text-red-700 bg-red-100',
  'En retard': 'text-amber-700 bg-amber-100',
};
const statusIcon = { 'Payé': 'check_circle', 'Impayé': 'cancel', 'En retard': 'schedule' };

/* ── Receipt HTML ─────────────────────────────────────────────────────────── */
function buildReceiptHTML(payment, orgSettings, signatures = {}) {
  const org = orgSettings || {};
  const receiptNum = `QUI-${payment.id}-${Date.now().toString().slice(-5)}`;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Quittance de Loyer — ${payment.month}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1c1b19; background: #fff; }
  .page { max-width: 680px; margin: 0 auto; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #785a00; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 26px; font-weight: 900; color: #785a00; letter-spacing: -1px; }
  .brand-sub { font-size: 11px; color: #817662; text-transform: uppercase; letter-spacing: 2px; margin-top: 3px; }
  .doc-info { text-align: right; }
  .doc-info h2 { font-size: 17px; font-weight: 700; color: #1c1b19; }
  .doc-info p { font-size: 12px; color: #817662; margin-top: 3px; }
  .receipt-num { display: inline-block; background: #fff8f2; border: 1px solid #e3d9cc; border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 700; color: #785a00; margin-top: 6px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
  .party { background: #fff8f2; border: 1px solid #e3d9cc; border-radius: 10px; padding: 16px; }
  .party-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #817662; font-weight: 700; margin-bottom: 8px; }
  .party-name { font-size: 15px; font-weight: 700; color: #1c1b19; margin-bottom: 4px; }
  .party-detail { font-size: 12px; color: #5a5040; line-height: 1.6; }
  .amount-box { background: #785a00; color: white; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; }
  .amount-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8; margin-bottom: 8px; }
  .amount-value { font-size: 36px; font-weight: 900; letter-spacing: -1px; }
  .amount-period { font-size: 14px; opacity: 0.85; margin-top: 6px; }
  .details { border: 1px solid #e3d9cc; border-radius: 10px; overflow: hidden; margin-bottom: 24px; }
  .details-row { display: flex; justify-content: space-between; padding: 10px 16px; font-size: 13px; border-bottom: 1px solid #f0e8de; }
  .details-row:last-child { border-bottom: none; }
  .details-row span:first-child { color: #817662; }
  .details-row span:last-child { font-weight: 600; color: #1c1b19; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e3d9cc; }
  .sig-box { text-align: center; }
  .sig-line { border-bottom: 1px solid #817662; height: 60px; margin-bottom: 8px; display:flex; align-items:flex-end; justify-content:center; }
  .sig-line img { max-height:56px; max-width:100%; object-fit:contain; }
  .sig-label { font-size: 11px; color: #817662; text-transform: uppercase; letter-spacing: 1px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e3d9cc; font-size: 10px; color: #b0a090; text-align: center; line-height: 1.6; }
  .paid-stamp { position: absolute; top: 160px; right: 60px; border: 4px solid #166534; color: #166534; border-radius: 8px; padding: 8px 16px; font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; transform: rotate(-15deg); opacity: 0.5; pointer-events: none; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style>
</head>
<body>
<div class="page" style="position:relative">
  <div class="paid-stamp">PAYÉ</div>
  <div class="header">
    <div>
      <div class="brand">${org.companyName || 'Minsouah'}</div>
      <div class="brand-sub">L'immobilier réinventé</div>
      ${org.address ? `<div style="font-size:12px;color:#817662;margin-top:4px">${org.address}</div>` : ''}
    </div>
    <div class="doc-info">
      <h2>Quittance de Loyer</h2>
      <p>Date d'émission : ${today}</p>
      <div class="receipt-num">${receiptNum}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-title">Bailleur / Propriétaire</div>
      <div class="party-name">${org.companyName || 'Minsouah Immobilier'}</div>
      <div class="party-detail">${org.address || 'Abidjan, Côte d\'Ivoire'}</div>
    </div>
    <div class="party">
      <div class="party-title">Locataire</div>
      <div class="party-name">${payment.tenantName}</div>
      <div class="party-detail">
        ${payment.tenantEmail ? payment.tenantEmail + '<br>' : ''}
        ${payment.tenantPhone || ''}
      </div>
    </div>
  </div>

  <div class="amount-box">
    <div class="amount-label">Loyer reçu pour la période de</div>
    <div class="amount-period">${payment.month}</div>
    <div class="amount-value">${Number(payment.amount).toLocaleString('fr-FR')} FCFA</div>
  </div>

  <div class="details">
    <div class="details-row"><span>Propriété</span><span>${payment.propertyName}</span></div>
    <div class="details-row"><span>Période couverte</span><span>${payment.month}</span></div>
    <div class="details-row"><span>Date d'échéance</span><span>${payment.dueDate || '—'}</span></div>
    <div class="details-row"><span>Date de paiement</span><span>${payment.paidDate || today}</span></div>
    <div class="details-row"><span>Mode de paiement</span><span>${payment.method || 'Espèces'}</span></div>
    <div class="details-row"><span>Référence</span><span>${receiptNum}</span></div>
    <div class="details-row"><span>Statut</span><span style="color:#166534;font-weight:700">✓ Paiement confirmé</span></div>
  </div>

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-line">
        ${signatures.bailleur ? `<img src="${signatures.bailleur}" alt="signature bailleur" />` : ''}
      </div>
      <div class="sig-label">Signature du Bailleur</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">
        ${signatures.locataire ? `<img src="${signatures.locataire}" alt="signature locataire" />` : ''}
      </div>
      <div class="sig-label">Signature du Locataire</div>
    </div>
  </div>

  <div class="footer">
    Ce document tient lieu de quittance de loyer et atteste du règlement intégral de la somme indiquée.<br>
    ${org.companyName || 'Minsouah'} — Gestion Immobilière — Document généré automatiquement — ${today}
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;
}

/* ── Monthly Report HTML ──────────────────────────────────────────────────── */
function buildReportHTML(month, paid, unpaid, orgSettings) {
  const org = orgSettings || {};
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalCollected = paid.reduce((s, p) => s + p.amount, 0);
  const totalUnpaid = unpaid.reduce((s, p) => s + p.amount, 0);
  const total = totalCollected + totalUnpaid;
  const rate = (paid.length + unpaid.length) > 0 ? Math.round(paid.length / (paid.length + unpaid.length) * 100) : 0;

  const paidRows = paid.map(p => `<tr>
    <td>${p.propertyName}</td><td>${p.tenantName}</td>
    <td style="text-align:right;font-weight:700;color:#166534">${Number(p.amount).toLocaleString('fr-FR')} FCFA</td>
    <td>${p.paidDate || '—'}</td>
  </tr>`).join('');

  const unpaidRows = unpaid.map(p => `<tr>
    <td>${p.propertyName}</td><td>${p.tenantName}</td>
    <td style="text-align:right;font-weight:700;color:#991b1b">${Number(p.amount).toLocaleString('fr-FR')} FCFA</td>
    <td style="color:${p.status === 'En retard' ? '#92400e' : '#991b1b'};font-weight:600">${p.status}</td>
  </tr>`).join('');

  const barWidth = rate;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"><title>Rapport Mensuel — ${month}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1c1b19;background:#fff;padding:40px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #785a00;padding-bottom:16px;margin-bottom:28px}
  .brand{font-size:26px;font-weight:900;color:#785a00}.brand-sub{font-size:11px;color:#817662;text-transform:uppercase;letter-spacing:2px;margin-top:3px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
  .kpi{background:#fff8f2;border:1px solid #e3d9cc;border-radius:10px;padding:16px}
  .kpi-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#817662;margin-bottom:6px}
  .kpi-v{font-size:20px;font-weight:800}
  .bar-wrap{background:#e3d9cc;border-radius:99px;height:16px;margin-bottom:28px;overflow:hidden}
  .bar{height:100%;background:#785a00;border-radius:99px;width:${barWidth}%;transition:width 0.5s}
  .bar-label{font-size:12px;color:#817662;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px}
  th{background:#785a00;color:white;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:1px}
  td{padding:9px 12px;border-bottom:1px solid #f0e8de}tr:last-child td{border-bottom:none}tr:nth-child(even){background:#fff8f2}
  .section-h{font-size:14px;font-weight:700;margin:24px 0 10px}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e3d9cc;font-size:10px;color:#b0a090;display:flex;justify-content:space-between}
  @media print{body{padding:20px}}
</style>
</head>
<body>
<div class="header">
  <div><div class="brand">${org.companyName || 'Minsouah'}</div><div class="brand-sub">L'immobilier réinventé</div></div>
  <div style="text-align:right"><h2 style="font-size:17px;font-weight:700">Rapport de Paiements — ${month}</h2><p style="font-size:12px;color:#817662;margin-top:4px">Généré le ${today}</p></div>
</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-l">Total attendu</div><div class="kpi-v" style="color:#785a00">${Number(total).toLocaleString('fr-FR')} FCFA</div></div>
  <div class="kpi"><div class="kpi-l">Encaissé</div><div class="kpi-v" style="color:#166534">${Number(totalCollected).toLocaleString('fr-FR')} FCFA</div></div>
  <div class="kpi"><div class="kpi-l">Impayés</div><div class="kpi-v" style="color:#991b1b">${Number(totalUnpaid).toLocaleString('fr-FR')} FCFA</div></div>
  <div class="kpi"><div class="kpi-l">Recouvrement</div><div class="kpi-v" style="color:${rate >= 80 ? '#166534' : '#991b1b'}">${rate}%</div></div>
</div>

<div class="bar-label">Taux de recouvrement : <strong>${rate}%</strong> (${paid.length} payés sur ${paid.length + unpaid.length})</div>
<div class="bar-wrap"><div class="bar"></div></div>

${paid.length > 0 ? `<div class="section-h" style="color:#166534">✓ Paiements reçus (${paid.length})</div>
<table><thead><tr><th>Propriété</th><th>Locataire</th><th>Montant</th><th>Payé le</th></tr></thead>
<tbody>${paidRows}</tbody></table>` : ''}

${unpaid.length > 0 ? `<div class="section-h" style="color:#991b1b">⚠ Impayés / En retard (${unpaid.length})</div>
<table><thead><tr><th>Propriété</th><th>Locataire</th><th>Montant dû</th><th>Statut</th></tr></thead>
<tbody>${unpaidRows}</tbody></table>` : ''}

<div class="footer"><span>${org.companyName || 'Minsouah'} — Gestion Immobilière</span><span>Document confidentiel — généré automatiquement</span></div>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

/* ── Local primitives ────────────────────────────────────────────────────── */
function Btn({ children, onClick, disabled, variant = 'primary', icon, small }) {
  const base = 'inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors focus:outline-none';
  const size = small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const colors = variant === 'primary'
    ? 'bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40'
    : variant === 'danger'
    ? 'bg-red-100 text-red-700 hover:bg-red-200'
    : variant === 'green'
    ? 'bg-green-100 text-green-700 hover:bg-green-200'
    : variant === 'amber'
    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
    : 'bg-surface-container-high text-on-surface hover:bg-outline-variant/30';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${size} ${colors}`}>
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

function ModalWrap({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-3xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className={`bg-surface w-full ${widths[size]} rounded-2xl shadow-2xl flex flex-col max-h-[90vh]`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
          <h3 className="font-semibold text-on-surface text-base">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-outline-variant/30 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary';

/* ── Main component ─────────────────────────────────────────────────────── */
export default function Payments() {
  const { state, dispatch } = useApp();
  const { payments, properties, tenants, contracts, orgSettings } = state;

  const now = new Date();
  const currentMonthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  const [tab, setTab] = useState('payments');
  const [selectedMonth, setSelectedMonth] = useState(currentMonthLabel);
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [search, setSearch] = useState('');

  /* ── Payment modal ── */
  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces' });
  const [quittancePayment, setQuittancePayment] = useState(null);

  /* ── Reminder modal ── */
  const [reminderModal, setReminderModal] = useState(null);

  /* ── All months (from existing payments + current) ── */
  const allMonths = useMemo(() => {
    const set = new Set(payments.map(p => p.month));
    set.add(currentMonthLabel);
    return [...set].sort((a, b) => {
      const [am, ay] = a.split(' ');
      const [bm, by] = b.split(' ');
      return by - ay || MONTH_NAMES.indexOf(bm) - MONTH_NAMES.indexOf(am);
    });
  }, [payments, currentMonthLabel]);

  /* ── Flatten all properties (buildings → units + standalone) ── */
  const allPropertyOptions = useMemo(() => {
    const opts = [];
    (properties || []).forEach(prop => {
      if (prop.isBuilding && prop.units?.length > 0) {
        prop.units.forEach(unit => {
          opts.push({
            value: `${prop.id}::${unit.id}`,
            label: `${prop.name} — ${unit.number}`,
            propertyName: `${prop.name} — ${unit.number}`,
            buildingId: prop.id,
            buildingName: prop.name,
            unitId: unit.id,
            rent: unit.rent,
            isUnit: true,
          });
        });
      } else {
        opts.push({
          value: String(prop.id),
          label: prop.name,
          propertyName: prop.name,
          buildingId: prop.id,
          rent: prop.rent,
          isUnit: false,
        });
      }
    });
    return opts;
  }, [properties]);

  /* ── Tenants matching the selected property ── */
  const matchingTenants = useMemo(() => {
    if (!payForm.propertyKey) return tenants || [];
    const selected = allPropertyOptions.find(o => o.value === payForm.propertyKey);
    if (!selected) return tenants || [];

    const matched = (tenants || []).filter(t => {
      const tName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
      // Via active contract — name OR id based
      const viaContract = (contracts || []).some(c => {
        if (c.status !== 'Actif') return false;
        const tenantMatch = c.tenantId === t.id || c.tenant === tName;
        const propMatch =
          c.propertyName === selected.propertyName ||
          c.propertyName === selected.buildingName ||
          String(c.propertyId) === String(selected.buildingId) ||
          (selected.isUnit && String(c.buildingId) === String(selected.buildingId));
        return tenantMatch && propMatch;
      });
      // Direct property field on tenant
      const directMatch =
        (t.property || '').includes(selected.buildingName) ||
        (t.property || '').includes(selected.propertyName);
      return viaContract || directMatch;
    });
    // Fallback: if no match found via contract/property, show all active tenants
    return matched.length > 0 ? matched : (tenants || []).filter(t => t.status === 'Actif' || t.status === 'En cours' || !t.status);
  }, [payForm.propertyKey, allPropertyOptions, tenants, contracts]);

  /* ── Filtered payments (main tab) ── */
  const filtered = useMemo(() => payments.filter(p => {
    const matchMonth = p.month === selectedMonth;
    const matchStatus = statusFilter === 'Tous' || p.status === statusFilter;
    const matchSearch = (p.propertyName || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.tenantName || '').toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchStatus && matchSearch;
  }), [payments, selectedMonth, statusFilter, search]);

  /* ── Stats for selected month ── */
  const monthPmts = payments.filter(p => p.month === selectedMonth);
  const totalExpected = monthPmts.reduce((s, p) => s + (p.amount || 0), 0);
  const totalCollected = monthPmts.filter(p => p.status === 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = monthPmts.filter(p => p.status !== 'Payé').reduce((s, p) => s + (p.amount || 0), 0);
  const recoveryRate = monthPmts.length ? Math.round(monthPmts.filter(p => p.status === 'Payé').length / monthPmts.length * 100) : 0;

  /* ── Current month unpaid (for Rappels tab) ── */
  const currentMonthUnpaid = useMemo(() =>
    payments.filter(p => p.month === currentMonthLabel && p.status !== 'Payé'),
    [payments, currentMonthLabel]
  );

  /* ── Report month payments ── */
  const reportPaid = monthPmts.filter(p => p.status === 'Payé');
  const reportUnpaid = monthPmts.filter(p => p.status !== 'Payé');

  /* ── Handlers ── */
  const handlePropertySelect = (val) => {
    const opt = allPropertyOptions.find(o => o.value === val);
    setPayForm(f => ({ ...f, propertyKey: val, tenantId: '', amount: opt?.rent || '' }));
  };

  const handleSavePayment = () => {
    const opt = allPropertyOptions.find(o => o.value === payForm.propertyKey);
    const tenant = (tenants || []).find(t => String(t.id) === String(payForm.tenantId));
    const today = new Date().toLocaleDateString('fr-CI');
    const tenantFullName = tenant ? (tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim()) : '';
    const newPayment = {
      propertyName: opt?.propertyName || payForm.propertyKey,
      tenantName: tenantFullName,
      tenantEmail: tenant?.email || '',
      tenantPhone: tenant?.phone || '',
      amount: parseFloat(payForm.amount) || 0,
      month: payForm.month,
      dueDate: payForm.dueDate,
      method: payForm.method,
      status: 'Payé',
      paidDate: today,
      reminderSent: false,
      reminderCount: 0,
    };
    dispatch({ type: 'ADD_PAYMENT', payload: newPayment });
    setPayModal(false);
    setPayForm({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces' });
    setQuittancePayment(newPayment);
  };

  const handleMarkPaid = (id) => dispatch({ type: 'MARK_PAYMENT_PAID', payload: id });
  const handleReminder = (p) => { dispatch({ type: 'SEND_REMINDER', payload: p.id }); setReminderModal(null); };

  /* ── Quittance / Signature state ── */
  const [receiptTab, setReceiptTab]       = useState('preview');
  const [signatures, setSignatures]       = useState({ bailleur: null, locataire: null });
  const [sigBailleur, setSigBailleur]     = useState(false);
  const [sigLocataire, setSigLocataire]   = useState(false);
  const sigBailleurRef                    = useRef(null);
  const sigLocataireRef                   = useRef(null);

  const openReceipt = useCallback((payment) => {
    setQuittancePayment(payment);
    setReceiptTab('preview');
    setSignatures({ bailleur: null, locataire: null });
    setSigBailleur(false);
    setSigLocataire(false);
  }, []);

  const handleConfirmSignatures = useCallback(() => {
    const bailleur  = sigBailleurRef.current?.getDataURL() || null;
    const locataire = sigLocataireRef.current?.getDataURL() || null;
    setSignatures({ bailleur, locataire });
    setReceiptTab('send');
  }, []);

  const printReceipt = useCallback(() => {
    const html = buildReceiptHTML(quittancePayment, orgSettings, signatures);
    const win = window.open('', '_blank', 'width=820,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  }, [quittancePayment, orgSettings, signatures]);

  const whatsappReceipt = useCallback(() => {
    const phone = (quittancePayment?.tenantPhone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Bonjour ${quittancePayment?.tenantName},\n\nVotre quittance de loyer pour ${quittancePayment?.month} d'un montant de ${fmt(quittancePayment?.amount)} a bien été enregistrée.${signatures.bailleur ? '\n✅ Quittance signée numériquement.' : ''}\nMerci pour votre paiement.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.open(`https://wa.me/${phone || ''}?text=${msg}`, '_blank');
  }, [quittancePayment, orgSettings, signatures]);

  const emailReceipt = useCallback(() => {
    const email = quittancePayment?.tenantEmail || '';
    const subject = encodeURIComponent(`Quittance de loyer — ${quittancePayment?.month}`);
    const body = encodeURIComponent(
      `Bonjour ${quittancePayment?.tenantName},\n\nVeuillez trouver ci-joint votre quittance de loyer pour la période de ${quittancePayment?.month}.\n\nMontant : ${fmt(quittancePayment?.amount)}\nPropriété : ${quittancePayment?.propertyName}\n\nCordialement,\n${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }, [quittancePayment, orgSettings]);

  const handlePrintReport = () => {
    const html = buildReportHTML(selectedMonth, reportPaid, reportUnpaid, orgSettings);
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const sendWhatsAppReminder = (p) => {
    const phone = (p.tenantPhone || '').replace(/\D/g, '');
    const msg = encodeURIComponent(
      `Bonjour ${p.tenantName},\n\nNous vous rappelons que votre loyer de ${fmt(p.amount)} pour ${p.month} est en attente de règlement.\nPropriété : ${p.propertyName}\n\nMerci de procéder au paiement dès que possible.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.open(`https://wa.me/${phone || ''}?text=${msg}`, '_blank');
    dispatch({ type: 'SEND_REMINDER', payload: p.id });
  };

  const sendEmailReminder = (p) => {
    const subject = encodeURIComponent(`Rappel de loyer — ${p.month}`);
    const body = encodeURIComponent(
      `Bonjour ${p.tenantName},\n\nNous vous rappelons que votre loyer de ${fmt(p.amount)} pour ${p.month} n'a pas encore été reçu.\nPropriété : ${p.propertyName}\n\nMerci de régulariser votre situation dans les meilleurs délais.\n\nCordialement,\n${orgSettings?.companyName || 'Minsouah Immobilier'}`
    );
    window.location.href = `mailto:${p.tenantEmail || ''}?subject=${subject}&body=${body}`;
    dispatch({ type: 'SEND_REMINDER', payload: p.id });
  };

  const sendBulkReminders = () => {
    currentMonthUnpaid.forEach(p => dispatch({ type: 'SEND_REMINDER', payload: p.id }));
  };

  const TABS = [
    { id: 'payments', label: 'Paiements', icon: 'payments' },
    { id: 'reminders', label: 'Rappels du mois', icon: 'notifications_active', badge: currentMonthUnpaid.length },
    { id: 'report', label: 'Rapport mensuel', icon: 'bar_chart' },
  ];

  return (
    <div className="px-margin pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* ── Header ── */}
      <div className="flex flex-wrap gap-sm items-center justify-between">
        <div className="flex flex-wrap gap-sm">
          <Btn icon="add_circle" onClick={() => setPayModal(true)}>Enregistrer un paiement</Btn>
        </div>
        <div className="flex items-center gap-sm bg-surface-container-lowest border border-outline-variant rounded-xl px-4 py-2">
          <Icon name="calendar_month" className="text-primary" size={16} />
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none text-sm text-on-surface focus:outline-none">
            {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* ── Stats ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-md">
        {[
          { label: 'Loyers Attendus', value: fmt(totalExpected), icon: 'request_quote', cls: 'bg-primary/10 text-primary' },
          { label: 'Encaissés', value: fmt(totalCollected), icon: 'check_circle', cls: 'bg-green-100 text-green-700' },
          { label: 'Impayés', value: fmt(totalPending), icon: 'warning', cls: 'bg-red-100 text-red-700' },
          { label: 'Recouvrement', value: `${recoveryRate}%`, icon: 'percent', cls: recoveryRate >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700' },
        ].map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-center gap-md">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${s.cls}`}>
              <Icon name={s.icon} size={20} />
            </div>
            <div>
              <p className="text-on-surface-variant text-xs uppercase tracking-wider font-semibold">{s.label}</p>
              <p className="font-bold text-on-surface mt-0.5 text-base">{s.value}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-surface-container-low rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors relative ${
              tab === t.id ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}>
            <Icon name={t.icon} size={16} />
            {t.label}
            {t.badge > 0 && (
              <span className="bg-error text-on-error text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB: PAIEMENTS ══════════════════ */}
      {tab === 'payments' && (
        <>
          {/* Filters */}
          <div className="bg-surface-container-lowest rounded-xl p-sm border border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center gap-md">
            <div className="relative w-full sm:w-64">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={15} />
              <input type="text" placeholder="Propriété, locataire..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-outline-variant rounded-lg bg-surface-container-low text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="flex flex-wrap gap-xs">
              {['Tous','Payé','Impayé','En retard'].map(opt => (
                <button key={opt} onClick={() => setStatusFilter(opt)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    statusFilter === opt ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
                  }`}>
                  {opt}
                </button>
              ))}
            </div>
            <span className="ml-auto text-sm text-on-surface-variant">{filtered.length} paiement(s)</span>
          </div>

          {/* Table */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-secondary text-on-primary">
                  <tr>
                    {['Propriété / Locataire','Montant','Échéance','Payé le','Statut','Rappels','Actions'].map((h,i) => (
                      <th key={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${i === 1 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-12 text-on-surface-variant">
                      <Icon name="payments" size={36} className="opacity-30 mb-2" /><p>Aucun paiement pour ce mois</p>
                    </td></tr>
                  )}
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-sm text-on-surface">{p.propertyName}</p>
                        <p className="text-xs text-on-surface-variant">{p.tenantName}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className={`font-bold text-sm ${p.status === 'Payé' ? 'text-green-700' : 'text-red-700'}`}>
                          {fmt(p.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-on-surface">{p.dueDate || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-on-surface">{p.paidDate || <span className="text-on-surface-variant">—</span>}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                          <Icon name={statusIcon[p.status] || 'info'} size={12} />
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-on-surface-variant">
                        {p.reminderCount > 0
                          ? <span className="text-amber-700 flex items-center gap-1"><Icon name="notifications_active" size={12} />{p.reminderCount}</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap">
                          {p.status === 'Payé' && (
                            <Btn small icon="receipt" variant="secondary" onClick={() => openReceipt(p)}>Quittance</Btn>
                          )}
                          {p.status !== 'Payé' && (
                            <>
                              <Btn small icon="check_circle" variant="green" onClick={() => handleMarkPaid(p.id)}>Payé</Btn>
                              <Btn small icon="notifications" variant="amber" onClick={() => setReminderModal(p)}>Rappel</Btn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 bg-surface-container-low border-t border-outline-variant/20 flex justify-between text-xs text-on-surface-variant">
              <span>{monthPmts.filter(p => p.status === 'Payé').length} / {monthPmts.length} reçus — {recoveryRate}% recouvrement</span>
              <span className={recoveryRate >= 80 ? 'text-green-700 font-semibold' : 'text-error font-semibold'}>
                {recoveryRate >= 80 ? '✓ Bon taux' : '⚠ Taux faible'}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════ TAB: RAPPELS ══════════════════ */}
      {tab === 'reminders' && (
        <div className="flex flex-col gap-md">
          <div className="flex items-center justify-between flex-wrap gap-sm">
            <div>
              <h3 className="font-bold text-on-surface text-base">Rappels — {currentMonthLabel}</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">
                {currentMonthUnpaid.length} locataire(s) n'ont pas encore payé ce mois-ci
              </p>
            </div>
            {currentMonthUnpaid.length > 0 && (
              <Btn icon="notifications_active" onClick={sendBulkReminders}>
                Envoyer tous les rappels ({currentMonthUnpaid.length})
              </Btn>
            )}
          </div>

          {currentMonthUnpaid.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <Icon name="check_circle" size={40} className="text-green-600 mb-3" />
              <p className="font-semibold text-green-800">Tous les loyers ont été réglés ce mois-ci !</p>
              <p className="text-sm text-green-600 mt-1">Aucun rappel à envoyer pour {currentMonthLabel}.</p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-hidden shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-secondary text-on-primary">
                    <tr>
                      {['Locataire','Propriété','Montant dû','Statut','Rappels','Actions'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {currentMonthUnpaid.map(p => (
                      <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-sm">{p.tenantName}</p>
                          {p.tenantPhone && <p className="text-xs text-on-surface-variant">{p.tenantPhone}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-sm text-on-surface">{p.propertyName}</td>
                        <td className="px-4 py-3.5 font-bold text-sm text-red-700">{fmt(p.amount)}</td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                            <Icon name={statusIcon[p.status] || 'info'} size={12} />
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-on-surface-variant">
                          {p.reminderCount > 0
                            ? <span className="text-amber-700">{p.reminderCount} envoyé(s)</span>
                            : <span>Aucun</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => sendWhatsAppReminder(p)}
                              className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                              <Icon name="chat" size={12} /> WhatsApp
                            </button>
                            {p.tenantEmail && (
                              <button onClick={() => sendEmailReminder(p)}
                                className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-200 transition-colors">
                                <Icon name="mail" size={12} /> Email
                              </button>
                            )}
                            <button onClick={() => handleMarkPaid(p.id)}
                              className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                              <Icon name="check_circle" size={12} /> Marquer payé
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ TAB: RAPPORT MENSUEL ══════════════════ */}
      {tab === 'report' && (
        <div className="flex flex-col gap-md">
          <div className="flex items-center justify-between flex-wrap gap-sm">
            <div>
              <h3 className="font-bold text-on-surface text-base">Rapport — {selectedMonth}</h3>
              <p className="text-sm text-on-surface-variant mt-0.5">{reportPaid.length} payés · {reportUnpaid.length} impayés</p>
            </div>
            <Btn icon="picture_as_pdf" variant="secondary" onClick={handlePrintReport}>Imprimer / Exporter</Btn>
          </div>

          {/* Bar chart */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-5 shadow-card">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Taux de recouvrement</p>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-red-100 rounded-full h-5 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${recoveryRate}%` }}
                />
              </div>
              <span className={`text-lg font-black w-14 text-right ${recoveryRate >= 80 ? 'text-green-700' : 'text-red-700'}`}>
                {recoveryRate}%
              </span>
            </div>
            <div className="flex justify-between text-xs text-on-surface-variant mt-2">
              <span className="text-green-700 font-semibold">{fmt(totalCollected)} encaissé</span>
              <span className="text-red-700 font-semibold">{fmt(totalPending)} en attente</span>
            </div>

            {/* Per-property mini bars */}
            {monthPmts.length > 0 && (() => {
              const byProp = {};
              monthPmts.forEach(p => {
                if (!byProp[p.propertyName]) byProp[p.propertyName] = { paid: 0, total: 0 };
                byProp[p.propertyName].total++;
                if (p.status === 'Payé') byProp[p.propertyName].paid++;
              });
              return (
                <div className="mt-4 flex flex-col gap-2">
                  {Object.entries(byProp).map(([name, v]) => {
                    const pct = Math.round(v.paid / v.total * 100);
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <span className="text-xs text-on-surface-variant w-40 truncate">{name}</span>
                        <div className="flex-1 bg-outline-variant/20 rounded-full h-2.5 overflow-hidden">
                          <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-on-surface w-12 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Paid list */}
          {reportPaid.length > 0 && (
            <div className="bg-surface-container-lowest rounded-xl border border-green-200 overflow-hidden shadow-card">
              <div className="bg-green-50 px-5 py-3 border-b border-green-200 flex items-center gap-2">
                <Icon name="check_circle" size={16} className="text-green-600" />
                <h4 className="font-bold text-green-800 text-sm">Paiements reçus ({reportPaid.length})</h4>
                <span className="ml-auto font-bold text-green-700 text-sm">{fmt(totalCollected)}</span>
              </div>
              <table className="w-full text-left">
                <thead><tr className="bg-green-50 border-b border-green-100">
                  {['Propriété','Locataire','Montant','Payé le'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-green-700">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-green-50">
                  {reportPaid.map(p => (
                    <tr key={p.id} className="hover:bg-green-50/50">
                      <td className="px-4 py-3 text-sm font-medium">{p.propertyName}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{p.tenantName}</td>
                      <td className="px-4 py-3 text-sm font-bold text-green-700">{fmt(p.amount)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{p.paidDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Unpaid list */}
          {reportUnpaid.length > 0 && (
            <div className="bg-surface-container-lowest rounded-xl border border-red-200 overflow-hidden shadow-card">
              <div className="bg-red-50 px-5 py-3 border-b border-red-200 flex items-center gap-2">
                <Icon name="warning" size={16} className="text-red-600" />
                <h4 className="font-bold text-red-800 text-sm">Impayés / En retard ({reportUnpaid.length})</h4>
                <span className="ml-auto font-bold text-red-700 text-sm">{fmt(totalPending)}</span>
              </div>
              <table className="w-full text-left">
                <thead><tr className="bg-red-50 border-b border-red-100">
                  {['Propriété','Locataire','Montant dû','Statut'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-700">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-red-50">
                  {reportUnpaid.map(p => (
                    <tr key={p.id} className="hover:bg-red-50/50">
                      <td className="px-4 py-3 text-sm font-medium">{p.propertyName}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{p.tenantName}</td>
                      <td className="px-4 py-3 text-sm font-bold text-red-700">{fmt(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[p.status] || ''}`}>
                          <Icon name={statusIcon[p.status] || 'info'} size={12} />{p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {monthPmts.length === 0 && (
            <div className="text-center py-12 text-on-surface-variant">
              <Icon name="bar_chart" size={40} className="opacity-30 mb-2" />
              <p>Aucune donnée pour {selectedMonth}</p>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ MODAL: Enregistrer un paiement ══════════════ */}
      <ModalWrap
        open={payModal}
        onClose={() => { setPayModal(false); setPayForm({ propertyKey: '', tenantId: '', amount: '', month: currentMonthLabel, dueDate: '', method: 'Espèces' }); }}
        title="Enregistrer un paiement"
        size="md"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setPayModal(false)}>Annuler</Btn>
            <Btn icon="check_circle" onClick={handleSavePayment}
              disabled={!payForm.propertyKey || !payForm.tenantId || !payForm.amount}>
              Confirmer le paiement
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Propriété / Appartement" required>
            <select value={payForm.propertyKey} onChange={e => handlePropertySelect(e.target.value)} className={inputCls}>
              <option value="">— Choisir la propriété —</option>
              {(() => {
                const standalone = allPropertyOptions.filter(o => !o.isUnit);
                const buildings = {};
                allPropertyOptions.filter(o => o.isUnit).forEach(o => {
                  if (!buildings[o.buildingName]) buildings[o.buildingName] = [];
                  buildings[o.buildingName].push(o);
                });
                return (
                  <>
                    {standalone.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    {Object.entries(buildings).map(([bname, units]) => (
                      <optgroup key={bname} label={`🏢 ${bname}`}>
                        {units.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </optgroup>
                    ))}
                  </>
                );
              })()}
            </select>
          </Field>

          <Field label="Locataire" required>
            <select value={payForm.tenantId} onChange={e => setPayForm(f => ({ ...f, tenantId: e.target.value }))}
              className={inputCls} disabled={!payForm.propertyKey}>
              <option value="">— Choisir le locataire —</option>
              {matchingTenants.map(t => {
                const name = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
                return <option key={t.id} value={t.id}>{name}</option>;
              })}
              {payForm.propertyKey && matchingTenants.length === 0 && (
                <option disabled>Aucun locataire actif sur ce bien</option>
              )}
            </select>
            {payForm.propertyKey && matchingTenants.length === 0 && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <Icon name="info" size={12} /> Aucun contrat actif trouvé pour cette propriété.
              </p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Montant (FCFA)" required>
              <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Ex: 150000" className={inputCls} />
            </Field>
            <Field label="Mois concerné">
              <select value={payForm.month} onChange={e => setPayForm(f => ({ ...f, month: e.target.value }))} className={inputCls}>
                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date d'échéance">
              <input type="date" value={payForm.dueDate} onChange={e => setPayForm(f => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Mode de paiement">
              <select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                {['Espèces','Virement','Mobile Money','Chèque','Autre'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </ModalWrap>

      {/* ══════════════ MODAL: Quittance ══════════════ */}
      <ModalWrap
        open={!!quittancePayment}
        onClose={() => setQuittancePayment(null)}
        title="Quittance de Loyer"
        size="xl"
        footer={
          receiptTab === 'preview' ? (
            <div className="flex gap-3 w-full justify-between items-center">
              <Btn variant="secondary" onClick={() => setQuittancePayment(null)}>Fermer</Btn>
              <div className="flex gap-3">
                <Btn icon="draw" onClick={() => setReceiptTab('sign')}>Signer numériquement</Btn>
                <Btn icon="print" variant="secondary" onClick={printReceipt}>Imprimer sans signature</Btn>
              </div>
            </div>
          ) : receiptTab === 'sign' ? (
            <div className="flex gap-3 w-full justify-between">
              <Btn variant="secondary" onClick={() => setReceiptTab('preview')}>← Retour</Btn>
              <Btn icon="check_circle" onClick={handleConfirmSignatures}>
                Valider les signatures →
              </Btn>
            </div>
          ) : (
            <div className="flex gap-3 w-full flex-wrap justify-between items-center">
              <Btn variant="secondary" onClick={() => setReceiptTab('sign')}>← Modifier signatures</Btn>
              <div className="flex gap-2 flex-wrap">
                <Btn icon="print" onClick={printReceipt}>Imprimer</Btn>
                <Btn icon="chat" variant="green" onClick={whatsappReceipt}>WhatsApp</Btn>
                <Btn icon="mail" variant="secondary" onClick={emailReceipt}>Email</Btn>
              </div>
            </div>
          )
        }
      >
        {quittancePayment && (
          <div className="flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex gap-1 bg-surface-container-low rounded-xl p-1">
              {[
                { key: 'preview', label: 'Aperçu', icon: 'preview' },
                { key: 'sign',    label: 'Signatures', icon: 'draw' },
                { key: 'send',    label: 'Envoyer', icon: 'send',
                  badge: (signatures.bailleur || signatures.locataire) },
              ].map(t => (
                <button key={t.key} onClick={() => setReceiptTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors relative ${
                    receiptTab === t.key ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}>
                  <Icon name={t.icon} size={14} />
                  {t.label}
                  {t.badge && <span className="w-2 h-2 bg-green-500 rounded-full absolute top-1 right-1" />}
                </button>
              ))}
            </div>

            {/* ── TAB: APERÇU ── */}
            {receiptTab === 'preview' && (
              <div className="flex flex-col gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
                  <Icon name="check_circle" size={20} className="text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-green-800 text-sm">Paiement enregistré</p>
                    <p className="text-xs text-green-700">Prévisualisez la quittance avant de la signer ou l'envoyer.</p>
                  </div>
                </div>
                {/* Iframe preview */}
                <div className="border border-outline-variant/30 rounded-xl overflow-hidden bg-gray-50" style={{ height: '460px' }}>
                  <iframe
                    srcDoc={buildReceiptHTML(quittancePayment, orgSettings, signatures)}
                    title="Aperçu quittance"
                    className="w-full h-full border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
                <p className="text-xs text-on-surface-variant text-center">
                  Aperçu en temps réel — les signatures apparaîtront une fois ajoutées.
                </p>
              </div>
            )}

            {/* ── TAB: SIGNATURES ── */}
            {receiptTab === 'sign' && (
              <div className="flex flex-col gap-5">
                <div className="bg-primary-container/20 border border-primary/20 rounded-xl p-3 flex items-start gap-3">
                  <Icon name="info" size={18} className="text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-on-surface">
                    Dessinez les signatures dans les zones ci-dessous. Elles seront intégrées dans la quittance avant impression ou envoi.
                    La signature du locataire est <strong>optionnelle</strong>.
                  </p>
                </div>

                <SignaturePad
                  ref={sigBailleurRef}
                  label="Signature du Bailleur / Gestionnaire"
                  subtitle={`${orgSettings?.companyName || 'Minsouah Immobilier'}`}
                  required
                  onChange={setSigBailleur}
                />

                <SignaturePad
                  ref={sigLocataireRef}
                  label="Signature du Locataire"
                  subtitle={`${quittancePayment.tenantName} — optionnel`}
                  onChange={setSigLocataire}
                />

                {/* Preview of signed receipt */}
                {(sigBailleur || sigLocataire) && (
                  <button
                    type="button"
                    onClick={() => {
                      const b = sigBailleurRef.current?.getDataURL();
                      const l = sigLocataireRef.current?.getDataURL();
                      const html = buildReceiptHTML(quittancePayment, orgSettings, { bailleur: b, locataire: l });
                      const win = window.open('', '_blank', 'width=820,height=700');
                      if (win) { win.document.write(html); win.document.close(); }
                    }}
                    className="flex items-center justify-center gap-2 text-xs text-primary hover:underline"
                  >
                    <Icon name="preview" size={14} /> Prévisualiser avec les signatures actuelles
                  </button>
                )}
              </div>
            )}

            {/* ── TAB: ENVOYER ── */}
            {receiptTab === 'send' && (
              <div className="flex flex-col gap-4">
                {/* Signature status */}
                <div className={`rounded-xl p-3 flex items-start gap-3 ${
                  signatures.bailleur ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <Icon name={signatures.bailleur ? 'verified' : 'warning'} size={20}
                    className={signatures.bailleur ? 'text-green-600' : 'text-amber-600'} />
                  <div>
                    <p className={`font-semibold text-sm ${signatures.bailleur ? 'text-green-800' : 'text-amber-800'}`}>
                      {signatures.bailleur ? 'Quittance signée numériquement' : 'Quittance sans signature'}
                    </p>
                    <div className="flex gap-4 mt-1">
                      <span className={`text-xs flex items-center gap-1 ${signatures.bailleur ? 'text-green-700' : 'text-amber-600'}`}>
                        <Icon name={signatures.bailleur ? 'check_circle' : 'radio_button_unchecked'} size={12} />
                        Bailleur
                      </span>
                      <span className={`text-xs flex items-center gap-1 ${signatures.locataire ? 'text-green-700' : 'text-on-surface-variant'}`}>
                        <Icon name={signatures.locataire ? 'check_circle' : 'radio_button_unchecked'} size={12} />
                        Locataire
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details summary */}
                <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
                  {[
                    ['Locataire',  quittancePayment.tenantName],
                    ['Propriété',  quittancePayment.propertyName],
                    ['Période',    quittancePayment.month],
                    ['Montant',    fmt(quittancePayment.amount)],
                    ['Mode',       quittancePayment.method || 'Espèces'],
                    ['Date',       quittancePayment.paidDate || new Date().toLocaleDateString('fr-CI')],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between px-4 py-2 border-b border-outline-variant/10 last:border-0">
                      <span className="text-xs text-on-surface-variant">{k}</span>
                      <span className="text-xs font-semibold text-on-surface">{v}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-on-surface-variant text-center">
                  Choisissez le canal d'envoi ci-dessous.
                </p>
              </div>
            )}
          </div>
        )}
      </ModalWrap>

      {/* ══════════════ MODAL: Rappel confirm ══════════════ */}
      <ModalWrap
        open={!!reminderModal}
        onClose={() => setReminderModal(null)}
        title="Envoyer un rappel de paiement"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setReminderModal(null)}>Annuler</Btn>
            <Btn icon="send" onClick={() => handleReminder(reminderModal)}>Confirmer l'envoi</Btn>
          </>
        }
      >
        {reminderModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <Icon name="notifications_active" size={22} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-on-surface">Rappel pour <strong>{reminderModal.tenantName}</strong></p>
                <p className="text-sm text-on-surface-variant mt-1">
                  Loyer de <strong>{fmt(reminderModal.amount)}</strong> — {reminderModal.month}<br />
                  Propriété : <strong>{reminderModal.propertyName}</strong>
                </p>
                {reminderModal.reminderCount > 0 && (
                  <p className="text-xs text-amber-700 mt-2">⚠ {reminderModal.reminderCount} rappel(s) déjà envoyé(s)</p>
                )}
              </div>
            </div>
            <p className="text-sm text-on-surface-variant">Le statut passera en <strong>«&nbsp;En retard&nbsp;»</strong> et le compteur sera incrémenté.</p>
          </div>
        )}
      </ModalWrap>
    </div>
  );
}
