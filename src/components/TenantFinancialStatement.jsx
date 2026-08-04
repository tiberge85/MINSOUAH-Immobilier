import { useMemo } from 'react';
import Icon from './Icon';

/* ────────────────────────────────────────────────────────────────────────────
   Relevé de compte / état financier d'un locataire.
   Affiche, pour un locataire donné : son statut (à jour ou en retard), le détail
   mois par mois (payé / dû), le total encaissé et le total des arriérés, avec un
   export PDF individuel. Se base sur les paiements + le contrat du locataire.
   ──────────────────────────────────────────────────────────────────────────── */

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const fmt = (n) => `${Number(n || 0).toLocaleString('fr-CI')} FCFA`;
const norm = (s) => (s || '').toString().toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nameMatch = (a, b) => {
  a = norm(a); b = norm(b);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 4 && long.includes(short);
};
const normMonth = (s) => norm(s).replace(/\s+/g, ' ');
const monthLabel = (d) => `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function computeTenantStatement(tenant, { payments = [], contracts = [], properties = [] }) {
  const now = new Date();
  const curMonthFirst = new Date(now.getFullYear(), now.getMonth(), 1);

  // Paiements du locataire (par id OU par nom tolérant)
  const tp = (payments || []).filter(p =>
    (p.tenantId != null && String(p.tenantId) === String(tenant.id)) || nameMatch(p.tenantName, tenant.name)
  );

  // Contrat actif → loyer de référence
  const contract = (contracts || []).find(c =>
    ((c.tenantId != null && String(c.tenantId) === String(tenant.id)) || nameMatch(c.tenant, tenant.name)) &&
    (c.status === 'Actif' || c.status === 'Expirant')
  ) || (contracts || []).find(c => (c.tenantId != null && String(c.tenantId) === String(tenant.id)) || nameMatch(c.tenant, tenant.name));

  let rent = Number(contract?.rent) || 0;
  if (!rent) {
    const prop = (properties || []).find(p => nameMatch(p.name, tenant.property));
    rent = Number(prop?.rent) || 0;
  }

  // Début de la période due : 1er loyer (paymentStartDate) sinon entrée (since)
  const startRaw = tenant.paymentStartDate || tenant.since || contract?.startDate || null;
  let startDate = startRaw ? new Date(startRaw) : null;
  if (!startDate || isNaN(startDate.getTime())) {
    // À défaut, on part du plus ancien paiement connu, sinon du mois courant.
    const months = tp.map(p => p.month).filter(Boolean);
    startDate = months.length ? oldestMonthDate(months) : curMonthFirst;
  }
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  // Sécurité : ne pas générer plus de 48 mois en arrière
  const floor = new Date(curMonthFirst.getFullYear(), curMonthFirst.getMonth() - 47, 1);
  if (cursor < floor) cursor = floor;

  const rows = [];
  let totalPaid = 0, totalArrears = 0, currentDue = 0;
  while (cursor <= curMonthFirst) {
    const label = monthLabel(cursor);
    const paidRec = tp.find(p => p.status === 'Payé' && normMonth(p.month) === normMonth(label));
    const unpaidRec = tp.find(p => p.status !== 'Payé' && p.status !== 'Annulé' && normMonth(p.month) === normMonth(label));
    const isCurrent = cursor.getFullYear() === curMonthFirst.getFullYear() && cursor.getMonth() === curMonthFirst.getMonth();

    if (paidRec) {
      const amt = Number(paidRec.amount) || 0;
      totalPaid += amt;
      rows.push({ label, statut: 'Payé', montant: amt, date: paidRec.paidDate || '', arrear: false });
    } else {
      const amt = unpaidRec ? (Number(unpaidRec.amount) || rent) : rent;
      if (isCurrent) {
        currentDue += amt;
        rows.push({ label, statut: 'À payer', montant: amt, date: '', arrear: false });
      } else {
        totalArrears += amt;
        rows.push({ label, statut: 'Impayé (arriéré)', montant: amt, date: '', arrear: true });
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const upToDate = totalArrears === 0;
  return {
    tenant, contract, rent,
    rows: rows.reverse(), // du plus récent au plus ancien
    totalPaid, totalArrears, currentDue,
    upToDate,
    statusLabel: totalArrears > 0 ? 'En retard' : (currentDue > 0 ? 'À jour (mois en cours à régler)' : 'À jour'),
    arrearRows: rows.filter(r => r.arrear),
  };
}

function oldestMonthDate(labels) {
  let best = null;
  labels.forEach(l => {
    const [mn, yr] = (l || '').split(' ');
    const i = MONTHS_FR.indexOf(mn);
    if (i < 0 || !yr) return;
    const d = new Date(Number(yr), i, 1);
    if (!best || d < best) best = d;
  });
  return best || new Date();
}

function buildStatementHTML(st, orgSettings) {
  const t = st.tenant;
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const org = orgSettings?.companyName || 'MINSOUAH Immobilier';
  const statusColor = st.totalArrears > 0 ? '#b91c1c' : '#15803d';
  const rowsHTML = st.rows.map(r => `
    <tr>
      <td style="padding:7px 10px">${esc(r.label)}</td>
      <td style="padding:7px 10px;color:${r.arrear ? '#b91c1c' : r.statut === 'Payé' ? '#15803d' : '#b45309'};font-weight:600">${esc(r.statut)}</td>
      <td style="padding:7px 10px;text-align:right">${fmt(r.montant)}</td>
      <td style="padding:7px 10px;color:#6b7280;font-size:11px">${esc(r.date || '—')}</td>
    </tr>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Relevé — ${esc(t.name)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;padding:28px;background:#fff}
    h1{font-size:20px;margin:0 0 2px} .muted{color:#6b7280;font-size:12px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #785a00;padding-bottom:12px;margin-bottom:16px}
    .badge{display:inline-block;padding:6px 14px;border-radius:20px;color:#fff;font-weight:700;font-size:13px;background:${statusColor}}
    .grid{display:flex;gap:10px;margin:14px 0}
    .kpi{flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px}
    .kpi .v{font-size:17px;font-weight:800} .kpi .l{font-size:11px;color:#6b7280}
    table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:8px}
    thead td{background:#f3f4f6;font-weight:700;padding:8px 10px;border-bottom:2px solid #e5e7eb}
    tbody tr:nth-child(even){background:#fafafa}
    .foot{margin-top:18px;font-size:10px;color:#9ca3af;text-align:center}
  </style></head><body>
    <div class="hdr">
      <div>
        <h1>${esc(org)}</h1>
        <div class="muted">Relevé de compte locataire · émis le ${today}</div>
      </div>
      <div class="badge">${st.totalArrears > 0 ? 'EN RETARD' : 'À JOUR'}</div>
    </div>
    <div style="margin-bottom:6px"><strong style="font-size:15px">${esc(t.name)}</strong></div>
    <div class="muted">
      ${t.property ? 'Bien : ' + esc(t.property) + ' · ' : ''}${st.rent ? 'Loyer : ' + fmt(st.rent) + '/mois · ' : ''}${t.phone ? 'Tél : ' + esc(t.phone) : ''}
    </div>
    <div class="grid">
      <div class="kpi"><div class="v" style="color:#15803d">${fmt(st.totalPaid)}</div><div class="l">Total encaissé</div></div>
      <div class="kpi"><div class="v" style="color:#b91c1c">${fmt(st.totalArrears)}</div><div class="l">Arriérés (dus)</div></div>
      <div class="kpi"><div class="v" style="color:#b45309">${fmt(st.currentDue)}</div><div class="l">Mois en cours à régler</div></div>
    </div>
    <table>
      <thead><tr><td>Mois</td><td>Statut</td><td style="text-align:right">Montant</td><td>Réglé le</td></tr></thead>
      <tbody>${rowsHTML || '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:14px">Aucune échéance</td></tr>'}</tbody>
    </table>
    <p class="foot">Document généré automatiquement — ${esc(org)}</p>
  </body></html>`;
}

export function printTenantStatement(tenant, data, orgSettings) {
  const st = computeTenantStatement(tenant, data);
  const html = buildStatementHTML(st, orgSettings);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

export default function TenantFinancialStatement({ tenant, payments, contracts, properties, orgSettings, onClose }) {
  const st = useMemo(
    () => computeTenantStatement(tenant, { payments, contracts, properties }),
    [tenant, payments, contracts, properties]
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-outline-variant/20">
          <div className="min-w-0">
            <h2 className="font-bold text-on-surface truncate">État financier — {tenant.name}</h2>
            <p className="text-xs text-on-surface-variant truncate">{tenant.property || 'Locataire'}{st.rent ? ` · Loyer ${fmt(st.rent)}/mois` : ''}</p>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface flex-shrink-0"><Icon name="close" size={20} /></button>
        </div>

        {/* Statut + KPIs */}
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold ${st.totalArrears > 0 ? 'bg-error/10 text-error' : 'bg-green-100 text-green-700'}`}>
            <Icon name={st.totalArrears > 0 ? 'warning' : 'check_circle'} size={20} />
            {st.statusLabel}
            {st.totalArrears > 0 && <span className="ml-auto font-bold">{fmt(st.totalArrears)} dus</span>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-outline-variant/30 p-3">
              <div className="text-base font-extrabold text-green-700">{fmt(st.totalPaid)}</div>
              <div className="text-[11px] text-on-surface-variant">Total encaissé</div>
            </div>
            <div className="rounded-xl border border-outline-variant/30 p-3">
              <div className="text-base font-extrabold text-error">{fmt(st.totalArrears)}</div>
              <div className="text-[11px] text-on-surface-variant">Arriérés (dus)</div>
            </div>
            <div className="rounded-xl border border-outline-variant/30 p-3">
              <div className="text-base font-extrabold text-amber-700">{fmt(st.currentDue)}</div>
              <div className="text-[11px] text-on-surface-variant">Mois en cours</div>
            </div>
          </div>

          {/* Détail mois par mois */}
          <div className="rounded-xl border border-outline-variant/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant text-xs">
                  <th className="text-left px-3 py-2 font-semibold">Mois</th>
                  <th className="text-left px-3 py-2 font-semibold">Statut</th>
                  <th className="text-right px-3 py-2 font-semibold">Montant</th>
                  <th className="text-left px-3 py-2 font-semibold">Réglé le</th>
                </tr>
              </thead>
              <tbody>
                {st.rows.map((r, i) => (
                  <tr key={i} className="border-t border-outline-variant/10">
                    <td className="px-3 py-2">{r.label}</td>
                    <td className={`px-3 py-2 font-medium ${r.arrear ? 'text-error' : r.statut === 'Payé' ? 'text-green-700' : 'text-amber-700'}`}>{r.statut}</td>
                    <td className="px-3 py-2 text-right">{fmt(r.montant)}</td>
                    <td className="px-3 py-2 text-on-surface-variant text-xs">{r.date || '—'}</td>
                  </tr>
                ))}
                {st.rows.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-on-surface-variant text-sm">Aucune échéance à afficher</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pied : PDF */}
        <div className="p-4 border-t border-outline-variant/20 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high">Fermer</button>
          <button onClick={() => printTenantStatement(tenant, { payments, contracts, properties }, orgSettings)}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90">
            <Icon name="picture_as_pdf" size={16} /> Générer le PDF
          </button>
        </div>
      </div>
    </div>
  );
}
