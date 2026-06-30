import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

const INSURANCE_TYPES = ['Habitation', 'Multirisque', 'Responsabilité civile', 'Autre'];

/* ── Helpers ── */
function getStatus(endDate) {
  if (!endDate) return 'Active';
  const end = new Date(endDate);
  const now = new Date();
  const diffMs = end - now;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Expirée';
  if (diffDays <= 30) return 'Expire bientôt';
  return 'Active';
}

const statusStyle = {
  'Active':        'text-green-700 bg-green-100',
  'Expire bientôt': 'text-amber-700 bg-amber-100',
  'Expirée':       'text-red-700 bg-red-100',
};

/* ── Local primitives ── */
function Btn({ children, onClick, disabled, variant = 'primary', icon, small }) {
  const base = 'inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors focus:outline-none';
  const size = small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const colors = variant === 'primary'
    ? 'bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40'
    : variant === 'danger'
    ? 'bg-red-100 text-red-700 hover:bg-red-200'
    : 'bg-surface-container text-on-surface hover:bg-outline-variant/30';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${size} ${colors}`}>
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

function ModalWrap({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/30">
          <h3 className="font-semibold text-on-surface text-base">{title}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-outline-variant/30 flex justify-end gap-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-surface-container border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary';

const EMPTY_FORM = {
  propertyName: '',
  insurer: '',
  policyNumber: '',
  type: 'Habitation',
  startDate: '',
  endDate: '',
  amount: '',
  notes: '',
};

/* ── Main component ── */
export default function Insurance() {
  const { state, dispatch } = useApp();
  const { insurances = [], properties = [] } = state;

  /* ── Build flat property options ── */
  const propertyOptions = useMemo(() => {
    const opts = [];
    (properties || []).forEach(prop => {
      if (prop.isBuilding && prop.units?.length > 0) {
        prop.units.forEach(unit => {
          const label = unit.floor
            ? `${prop.name} — ${unit.number} (${unit.floor})`
            : `${prop.name} — ${unit.number}`;
          opts.push(label);
        });
      } else {
        opts.push(prop.name);
      }
    });
    return opts;
  }, [properties]);

  /* ── Modal state ── */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  /* ── Sorted insurances ── */
  const sorted = useMemo(() =>
    [...insurances].sort((a, b) => {
      // Expired last, expiring soon first, active after
      const order = { 'Expirée': 2, 'Expire bientôt': 0, 'Active': 1 };
      const sa = order[getStatus(a.endDate)] ?? 1;
      const sb = order[getStatus(b.endDate)] ?? 1;
      if (sa !== sb) return sa - sb;
      return (a.endDate || '').localeCompare(b.endDate || '');
    }),
  [insurances]);

  /* ── Alert: policies expiring or expired ── */
  const alertPolicies = useMemo(() =>
    insurances.filter(ins => {
      const s = getStatus(ins.endDate);
      return s === 'Expirée' || s === 'Expire bientôt';
    }),
  [insurances]);

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = insurances.length;
    const actives = insurances.filter(i => getStatus(i.endDate) === 'Active').length;
    const expiring = insurances.filter(i => getStatus(i.endDate) === 'Expire bientôt').length;
    const expired = insurances.filter(i => getStatus(i.endDate) === 'Expirée').length;
    const totalPremium = insurances.reduce((s, i) => s + Number(i.amount || 0), 0);
    return { total, actives, expiring, expired, totalPremium };
  }, [insurances]);

  /* ── Handlers ── */
  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(ins) {
    setEditingId(ins.id);
    setForm({
      propertyName: ins.propertyName || '',
      insurer: ins.insurer || '',
      policyNumber: ins.policyNumber || '',
      type: ins.type || 'Habitation',
      startDate: ins.startDate || '',
      endDate: ins.endDate || '',
      amount: ins.amount != null ? String(ins.amount) : '',
      notes: ins.notes || '',
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function handleSubmit() {
    const payload = {
      ...form,
      amount: Number(form.amount) || 0,
    };
    if (editingId) {
      dispatch({ type: 'UPDATE_INSURANCE', payload: { ...payload, id: editingId } });
    } else {
      dispatch({ type: 'ADD_INSURANCE', payload });
    }
    closeModal();
  }

  function handleDelete(id) {
    dispatch({ type: 'DELETE_INSURANCE', payload: id });
    setDeleteConfirm(null);
  }

  const isFormValid = form.propertyName.trim() && form.insurer.trim() && form.endDate;

  /* ── Days until expiry helper ── */
  function daysUntil(endDate) {
    if (!endDate) return null;
    const diff = new Date(endDate) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Assurances</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Suivi des polices d'assurance de vos biens</p>
        </div>
        <Btn icon="add" onClick={openAdd}>Ajouter une assurance</Btn>
      </div>

      {/* ── Alert banner ── */}
      {alertPolicies.length > 0 && (
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
          alertPolicies.some(i => getStatus(i.endDate) === 'Expirée')
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <Icon name="warning" size={20} className="mt-0.5 shrink-0" />
          <div className="text-sm">
            <span className="font-semibold">
              {alertPolicies.filter(i => getStatus(i.endDate) === 'Expirée').length > 0
                ? `${alertPolicies.filter(i => getStatus(i.endDate) === 'Expirée').length} police(s) expirée(s)`
                : ''}
              {alertPolicies.filter(i => getStatus(i.endDate) === 'Expirée').length > 0 &&
               alertPolicies.filter(i => getStatus(i.endDate) === 'Expire bientôt').length > 0 ? ' · ' : ''}
              {alertPolicies.filter(i => getStatus(i.endDate) === 'Expire bientôt').length > 0
                ? `${alertPolicies.filter(i => getStatus(i.endDate) === 'Expire bientôt').length} police(s) expirant dans moins de 30 jours`
                : ''}
            </span>
            {' — '}
            {alertPolicies.map(i => i.insurer || i.propertyName).join(', ')}
          </div>
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total polices',         value: stats.total,        color: 'text-on-surface' },
          { label: 'Actives',               value: stats.actives,      color: 'text-green-700' },
          { label: 'Expirant bientôt',      value: stats.expiring,     color: 'text-amber-700' },
          { label: 'Expirées',              value: stats.expired,      color: 'text-red-700' },
          { label: 'Prime annuelle totale', value: fmt(stats.totalPremium), color: 'text-primary', wide: true },
        ].map((s, i) => (
          <div key={i} className={`bg-surface-container rounded-xl p-4 ${s.wide ? 'col-span-2 sm:col-span-3 lg:col-span-1' : ''}`}>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-on-surface-variant mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Table ── */}
      {sorted.length === 0 ? (
        <div className="bg-surface-container rounded-2xl p-12 text-center">
          <Icon name="shield" size={48} className="text-on-surface-variant mx-auto mb-3" />
          <p className="text-on-surface-variant font-medium">Aucune assurance enregistrée</p>
          <p className="text-sm text-on-surface-variant/70 mt-1">Cliquez sur "Ajouter une assurance" pour commencer</p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-outline-variant/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-container">
                  {['Propriété', 'Assureur', 'Type', 'N° Police', 'Échéance', 'Prime annuelle', 'Statut', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-on-surface-variant uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {sorted.map(ins => {
                  const status = getStatus(ins.endDate);
                  const days = daysUntil(ins.endDate);
                  return (
                    <tr key={ins.id} className="hover:bg-surface-container/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-on-surface">{ins.propertyName || '—'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{ins.insurer || '—'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{ins.type || '—'}</td>
                      <td className="px-4 py-3 text-on-surface-variant font-mono text-xs">{ins.policyNumber || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-on-surface">
                          {ins.endDate ? new Date(ins.endDate).toLocaleDateString('fr-CI') : '—'}
                        </span>
                        {days !== null && days >= 0 && days <= 30 && (
                          <span className="ml-1.5 text-xs text-amber-600">({days}j)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{fmt(ins.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyle[status]}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(ins)}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Modifier"
                          >
                            <Icon name="edit" size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(ins)}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Supprimer"
                          >
                            <Icon name="delete" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add / Edit Modal ── */}
      <ModalWrap
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Modifier l\'assurance' : 'Ajouter une assurance'}
        footer={
          <>
            <Btn variant="secondary" onClick={closeModal}>Annuler</Btn>
            <Btn onClick={handleSubmit} disabled={!isFormValid}>
              {editingId ? 'Enregistrer' : 'Ajouter'}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Propriété / Appartement" required>
            {propertyOptions.length > 0 ? (
              <>
                <select
                  value={propertyOptions.includes(form.propertyName) ? form.propertyName : (form.propertyName ? '__other__' : '')}
                  onChange={e => {
                    if (e.target.value === '__other__') {
                      setForm(f => ({ ...f, propertyName: '' }));
                    } else {
                      setForm(f => ({ ...f, propertyName: e.target.value }));
                    }
                  }}
                  className={inputCls}
                >
                  <option value="">— Sélectionner —</option>
                  {propertyOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                  <option value="__other__">Autre (saisir manuellement)</option>
                </select>
                {!propertyOptions.includes(form.propertyName) && (
                  <input
                    name="propertyName"
                    value={form.propertyName}
                    onChange={handleChange}
                    placeholder="Nom de la propriété"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </>
            ) : (
              <input
                name="propertyName"
                value={form.propertyName}
                onChange={handleChange}
                placeholder="Ex: Appartement A1"
                className={inputCls}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Compagnie d'assurance" required>
              <input
                name="insurer"
                value={form.insurer}
                onChange={handleChange}
                placeholder="Ex: NSIA Assurances"
                className={inputCls}
              />
            </Field>
            <Field label="N° de police">
              <input
                name="policyNumber"
                value={form.policyNumber}
                onChange={handleChange}
                placeholder="Ex: POL-2024-001"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Type d'assurance">
            <select
              name="type"
              value={form.type}
              onChange={handleChange}
              className={inputCls}
            >
              {INSURANCE_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Date de début">
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
                className={inputCls}
              />
            </Field>
            <Field label="Date d'échéance" required>
              <input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Prime annuelle (FCFA)">
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              placeholder="0"
              min="0"
              className={inputCls}
            />
          </Field>

          <Field label="Notes">
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Informations complémentaires..."
              className={`${inputCls} resize-none`}
            />
          </Field>
        </div>
      </ModalWrap>

      {/* ── Delete Confirm Modal ── */}
      <ModalWrap
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Supprimer l'assurance"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setDeleteConfirm(null)}>Annuler</Btn>
            <Btn variant="danger" icon="delete" onClick={() => handleDelete(deleteConfirm.id)}>
              Supprimer
            </Btn>
          </>
        }
      >
        <p className="text-sm text-on-surface">
          Êtes-vous sûr de vouloir supprimer la police d'assurance{' '}
          <strong>{deleteConfirm?.insurer}</strong> pour{' '}
          <strong>{deleteConfirm?.propertyName}</strong> ? Cette action est irréversible.
        </p>
      </ModalWrap>
    </div>
  );
}
