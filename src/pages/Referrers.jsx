import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import Modal from '../components/ui/Modal';

const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

const EMPTY_FORM = {
  name: '', company: '', phone: '', email: '',
  commissionPct: '', notes: '',
};

const EMPTY_REFERRAL = {
  tenantName: '', propertyName: '', rentAmount: '', date: '', commissionAmount: '', paid: false,
};

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
const inputCls = 'border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary';

export default function Referrers() {
  const { state, dispatch } = useApp();
  const referrers = state.referrers || [];
  const contracts  = state.contracts  || [];
  const tenants    = state.tenants    || [];

  const [search, setSearch] = useState('');
  const [form, setForm]     = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null); // referrer being edited
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState(null); // referrer whose detail is open
  const [refForm, setRefForm]   = useState(EMPTY_REFERRAL);
  const [showRefForm, setShowRefForm] = useState(false);

  // ── Stats globaux ──────────────────────────────────────────────────────────
  const { totalCommOwed, totalCommPaid, totalReferrals } = useMemo(() => {
    let owed = 0, paid = 0, count = 0;
    referrers.forEach(r => {
      (r.referrals || []).forEach(ral => {
        count++;
        const amt = Number(ral.commissionAmount || 0);
        if (ral.paid) paid += amt; else owed += amt;
      });
    });
    return { totalCommOwed: owed, totalCommPaid: paid, totalReferrals: count };
  }, [referrers]);

  const filtered = useMemo(() =>
    referrers.filter(r =>
      !search ||
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.company?.toLowerCase().includes(search.toLowerCase()) ||
      r.phone?.includes(search)
    ), [referrers, search]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAdd = () => { setForm(EMPTY_FORM); setEditing(null); setShowForm(true); };
  const openEdit = (r) => { setForm({ ...r }); setEditing(r); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (editing) {
      await dispatch({ type: 'UPDATE_REFERRER', payload: { ...editing, ...form } });
    } else {
      await dispatch({ type: 'ADD_REFERRER', payload: form });
    }
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet apporteur d\'affaire ?')) return;
    await dispatch({ type: 'DELETE_REFERRER', payload: id });
    if (selected?.id === id) setSelected(null);
  };

  const handleAddReferral = async () => {
    if (!selected || !refForm.tenantName.trim()) return;
    const comm = refForm.commissionAmount
      ? Number(refForm.commissionAmount)
      : refForm.rentAmount && selected.commissionPct
        ? Math.round(Number(refForm.rentAmount) * Number(selected.commissionPct) / 100)
        : 0;
    await dispatch({
      type: 'ADD_REFERRAL',
      payload: { referrerId: selected.id, referral: { ...refForm, commissionAmount: comm } },
    });
    setShowRefForm(false);
    setRefForm(EMPTY_REFERRAL);
    // Refresh selected from updated state
    setTimeout(() => {
      setSelected(prev => {
        const updated = (state.referrers || []).find(r => r.id === prev?.id);
        return updated || prev;
      });
    }, 800);
  };

  const handleTogglePaid = async (referralId) => {
    if (!selected) return;
    await dispatch({ type: 'TOGGLE_REFERRAL_PAID', payload: { referrerId: selected.id, referralId } });
  };

  // ── Tenant autocomplete options ────────────────────────────────────────────
  const tenantOptions = tenants.map(t => t.name).filter(Boolean);
  const propertyOptions = contracts
    .filter(c => ['Actif', 'Expirant'].includes(c.status))
    .map(c => c.propertyName).filter(Boolean);

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* ── KPI bar ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        {[
          { label: 'Apporteurs', value: referrers.length, icon: 'group_add', color: 'text-primary bg-primary/10' },
          { label: 'Affaires apportées', value: totalReferrals, icon: 'handshake', color: 'text-tertiary bg-tertiary/10' },
          { label: 'Commissions dues', value: fmt(totalCommOwed), icon: 'pending_actions', color: 'text-amber-700 bg-amber-100' },
          { label: 'Commissions payées', value: fmt(totalCommPaid), icon: 'check_circle', color: 'text-green-700 bg-green-100' },
        ].map(k => (
          <div key={k.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-center gap-md">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${k.color}`}>
              <Icon name={k.icon} size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-on-surface-variant uppercase tracking-wide">{k.label}</p>
              <p className="font-bold text-on-surface truncate text-sm">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un apporteur…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Icon name="person_add" size={16} /> Ajouter un apporteur
        </button>
      </div>

      {/* ── Liste ───────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Icon name="group_add" size={48} className="opacity-30 mb-3" />
          <p className="text-sm">{search ? 'Aucun résultat' : 'Aucun apporteur d\'affaire. Cliquez sur « Ajouter » pour commencer.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {filtered.map(r => {
            const referrals = r.referrals || [];
            const commOwed = referrals.filter(x => !x.paid).reduce((s, x) => s + Number(x.commissionAmount || 0), 0);
            return (
              <div
                key={r.id}
                className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-card p-md cursor-pointer hover:shadow-modal transition-all"
                onClick={() => setSelected(r)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-on-surface">{r.name}</p>
                    {r.company && <p className="text-xs text-on-surface-variant">{r.company}</p>}
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant">
                      <Icon name="edit" size={15} />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-error/10 text-error">
                      <Icon name="delete" size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs text-on-surface-variant mt-2">
                  {r.phone && <span className="flex items-center gap-1"><Icon name="phone" size={12} />{r.phone}</span>}
                  {r.email && <span className="flex items-center gap-1"><Icon name="mail" size={12} />{r.email}</span>}
                </div>
                <div className="mt-3 pt-3 border-t border-outline-variant/20 flex justify-between text-xs">
                  <span className="text-on-surface-variant">{referrals.length} affaire{referrals.length !== 1 ? 's' : ''}</span>
                  {r.commissionPct && <span className="text-primary font-semibold">{r.commissionPct}% commission</span>}
                  {commOwed > 0 && <span className="text-amber-700 font-semibold">{fmt(commOwed)} dû</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Ajout/Édition apporteur ────────────────────────────────── */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? "Modifier l'apporteur" : "Nouvel apporteur d'affaire"}
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-outline-variant rounded-lg text-on-surface hover:bg-surface-container">Annuler</button>
            <button onClick={handleSave} disabled={!form.name.trim()}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-40">
              {editing ? 'Enregistrer' : 'Ajouter'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom complet *">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Kouamé Jean" className={inputCls} />
            </Field>
            <Field label="Société">
              <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Ex: Agence Immobilière XYZ" className={inputCls} />
            </Field>
            <Field label="Téléphone">
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+225 07 00 00 00" className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="contact@exemple.com" className={inputCls} />
            </Field>
            <Field label="Commission (%)">
              <input type="number" min="0" max="100" value={form.commissionPct}
                onChange={e => setForm(f => ({ ...f, commissionPct: e.target.value }))}
                placeholder="Ex: 5" className={inputCls} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informations complémentaires…" className={inputCls + ' resize-none'} />
          </Field>
        </div>
      </Modal>

      {/* ── Détail apporteur + liste des affaires ────────────────────────── */}
      <Modal
        open={!!selected}
        onClose={() => { setSelected(null); setShowRefForm(false); }}
        title={selected ? `${selected.name}${selected.company ? ' — ' + selected.company : ''}` : ''}
        size="md"
      >
        {selected && <div className="flex flex-col gap-4">
            {/* Infos */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {selected.phone && (
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">Téléphone</p>
                  <a href={`tel:${selected.phone}`} className="font-semibold text-on-surface hover:text-primary">{selected.phone}</a>
                </div>
              )}
              {selected.email && (
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">Email</p>
                  <a href={`mailto:${selected.email}`} className="font-semibold text-on-surface hover:text-primary truncate block">{selected.email}</a>
                </div>
              )}
              <div className="bg-surface-container rounded-xl p-3">
                <p className="text-xs text-on-surface-variant">Commission</p>
                <p className="font-semibold text-primary">{selected.commissionPct ? selected.commissionPct + '%' : '—'}</p>
              </div>
              <div className="bg-surface-container rounded-xl p-3">
                <p className="text-xs text-on-surface-variant">Affaires apportées</p>
                <p className="font-semibold text-on-surface">{(selected.referrals || []).length}</p>
              </div>
            </div>
            {selected.notes && <p className="text-sm text-on-surface-variant italic">{selected.notes}</p>}

            {/* Affaires */}
            <div className="flex items-center justify-between">
              <p className="font-semibold text-on-surface text-sm">Affaires apportées</p>
              <button onClick={() => { setRefForm(EMPTY_REFERRAL); setShowRefForm(true); }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary/5">
                <Icon name="add" size={14} /> Ajouter une affaire
              </button>
            </div>

            {(selected.referrals || []).length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-4 italic">Aucune affaire enregistrée</p>
            ) : (
              <div className="flex flex-col gap-2">
                {(selected.referrals || []).map(ral => (
                  <div key={ral.id} className={`rounded-xl border p-3 flex items-start justify-between gap-3 ${ral.paid ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-on-surface truncate">{ral.tenantName}</p>
                      <p className="text-xs text-on-surface-variant truncate">{ral.propertyName}</p>
                      {ral.date && <p className="text-xs text-on-surface-variant">{ral.date}</p>}
                      {ral.commissionAmount > 0 && (
                        <p className={`text-xs font-bold mt-1 ${ral.paid ? 'text-green-700' : 'text-amber-700'}`}>
                          {fmt(ral.commissionAmount)} {ral.paid ? '✓ Payé' : '— en attente'}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleTogglePaid(ral.id)}
                      title={ral.paid ? 'Marquer non payé' : 'Marquer payé'}
                      className={`flex-shrink-0 p-1.5 rounded-lg transition-colors ${ral.paid ? 'bg-green-200 text-green-800 hover:bg-green-300' : 'bg-amber-200 text-amber-800 hover:bg-amber-300'}`}
                    >
                      <Icon name={ral.paid ? 'check_circle' : 'radio_button_unchecked'} size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulaire ajout affaire inline */}
            {showRefForm && (
              <div className="border border-outline-variant/40 rounded-xl p-4 flex flex-col gap-3 bg-surface-container-low">
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wide">Nouvelle affaire</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Locataire *">
                    <input value={refForm.tenantName} onChange={e => setRefForm(f => ({ ...f, tenantName: e.target.value }))}
                      list="tenants-list" placeholder="Nom du locataire" className={inputCls} />
                    <datalist id="tenants-list">{tenantOptions.map(t => <option key={t} value={t} />)}</datalist>
                  </Field>
                  <Field label="Propriété">
                    <input value={refForm.propertyName} onChange={e => setRefForm(f => ({ ...f, propertyName: e.target.value }))}
                      list="props-list" placeholder="Nom du bien" className={inputCls} />
                    <datalist id="props-list">{propertyOptions.map(p => <option key={p} value={p} />)}</datalist>
                  </Field>
                  <Field label="Loyer mensuel (FCFA)">
                    <input type="number" value={refForm.rentAmount} onChange={e => setRefForm(f => ({ ...f, rentAmount: e.target.value }))}
                      placeholder="Ex: 200000" className={inputCls} />
                  </Field>
                  <Field label="Commission (FCFA)">
                    <input type="number" value={refForm.commissionAmount}
                      onChange={e => setRefForm(f => ({ ...f, commissionAmount: e.target.value }))}
                      placeholder={selected.commissionPct && refForm.rentAmount
                        ? `Auto: ${Math.round(Number(refForm.rentAmount) * Number(selected.commissionPct) / 100).toLocaleString('fr-CI')}`
                        : 'Montant'
                      }
                      className={inputCls} />
                  </Field>
                  <Field label="Date">
                    <input type="date" value={refForm.date} onChange={e => setRefForm(f => ({ ...f, date: e.target.value }))}
                      className={inputCls} />
                  </Field>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowRefForm(false)} className="px-3 py-1.5 text-xs border border-outline-variant rounded-lg hover:bg-surface-container">Annuler</button>
                  <button onClick={handleAddReferral} disabled={!refForm.tenantName.trim()}
                    className="px-3 py-1.5 text-xs font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-40">
                    Enregistrer
                  </button>
                </div>
              </div>
            )}
          </div>}
      </Modal>
    </div>
  );
}
