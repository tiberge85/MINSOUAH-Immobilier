import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import Modal from '../components/ui/Modal';

const SPECIALTIES = ['Plomberie', 'Électricité', 'HVAC', 'Maçonnerie', 'Peinture', 'Menuiserie', 'Jardinage', 'Nettoyage', 'Sécurité', 'Autre'];

const EMPTY_FORM = {
  name: '', company: '', phone: '', email: '',
  specialty: 'Plomberie', rate: '', rateType: 'forfait', notes: '',
};

const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary';
const selectCls = inputCls;

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const SPECIALTY_ICON = {
  'Plomberie': 'water_drop', 'Électricité': 'bolt', 'HVAC': 'ac_unit',
  'Maçonnerie': 'construction', 'Peinture': 'format_paint', 'Menuiserie': 'carpenter',
  'Jardinage': 'yard', 'Nettoyage': 'cleaning_services', 'Sécurité': 'security', 'Autre': 'handyman',
};

export default function Prestataires() {
  const { state, dispatch } = useApp();
  const prestataires = state.prestataires || [];
  const tickets = state.tickets || [];

  const [search, setSearch]       = useState('');
  const [filterSpec, setFilterSpec] = useState('Tous');
  const [form, setForm]           = useState(EMPTY_FORM);
  const [editing, setEditing]     = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [detail, setDetail]       = useState(null);
  const [saving, setSaving]       = useState(false);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const bySpec = {};
    SPECIALTIES.forEach(s => { bySpec[s] = 0; });
    prestataires.forEach(p => { bySpec[p.specialty] = (bySpec[p.specialty] || 0) + 1; });
    const totalSpent = tickets.reduce((s, t) => s + (parseFloat(t.devisAmount) || 0), 0);
    return { total: prestataires.length, bySpec, totalSpent };
  }, [prestataires, tickets]);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return prestataires.filter(p => {
      const matchSpec = filterSpec === 'Tous' || p.specialty === filterSpec;
      const matchSearch = !search ||
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.company?.toLowerCase().includes(search.toLowerCase()) ||
        p.phone?.includes(search) ||
        p.specialty?.toLowerCase().includes(search.toLowerCase());
      return matchSpec && matchSearch;
    });
  }, [prestataires, search, filterSpec]);

  // ── Ticket count per prestataire ───────────────────────────────────────────
  const ticketCount = (name) =>
    tickets.filter(t => t.prestataire === name || t.prestataireId === name).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAdd  = () => { setForm(EMPTY_FORM); setEditing(null); setShowForm(true); };
  const openEdit = (p) => { setForm({ ...p }); setEditing(p); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await dispatch({ type: 'UPDATE_PRESTATAIRE', payload: { ...editing, ...form } });
      } else {
        await dispatch({ type: 'ADD_PRESTATAIRE', payload: form });
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce prestataire ?')) return;
    await dispatch({ type: 'DELETE_PRESTATAIRE', payload: id });
    if (detail?.id === id) setDetail(null);
  };

  const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

  // ── Tickets linked to selected prestataire ────────────────────────────────
  const detailTickets = detail
    ? tickets.filter(t => t.prestataire === detail.name || t.prestataireId === detail.id)
    : [];

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* ── KPI bar ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        {[
          { label: 'Prestataires', value: stats.total, icon: 'handyman', color: 'text-primary bg-primary/10' },
          { label: 'Spécialités actives', value: Object.values(stats.bySpec).filter(v => v > 0).length, icon: 'category', color: 'text-tertiary bg-tertiary/10' },
          { label: 'Tickets liés', value: tickets.filter(t => t.prestataire).length, icon: 'engineering', color: 'text-amber-700 bg-amber-100' },
          { label: 'Budget total travaux', value: fmt(stats.totalSpent), icon: 'payments', color: 'text-green-700 bg-green-100' },
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

      {/* ── Filtres spécialité ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {['Tous', ...SPECIALTIES.filter(s => (stats.bySpec[s] || 0) > 0 || filterSpec === s)].map(s => (
          <button key={s} onClick={() => setFilterSpec(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 ${filterSpec === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}`}>
            {s !== 'Tous' && <Icon name={SPECIALTY_ICON[s] || 'handyman'} size={12} />}
            {s}
            {s !== 'Tous' && stats.bySpec[s] > 0 && <span className="ml-0.5 opacity-70">({stats.bySpec[s]})</span>}
          </button>
        ))}
      </div>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un prestataire…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-outline-variant rounded-lg bg-surface-container-lowest focus:outline-none focus:border-primary"
          />
        </div>
        <button onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors">
          <Icon name="person_add" size={16} /> Ajouter un prestataire
        </button>
      </div>

      {/* ── Grille prestataires ──────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Icon name="handyman" size={48} className="opacity-30 mb-3" />
          <p className="text-sm">{search || filterSpec !== 'Tous' ? 'Aucun résultat' : 'Aucun prestataire. Cliquez sur « Ajouter » pour commencer.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
          {filtered.map(p => {
            const tc = ticketCount(p.name);
            return (
              <div key={p.id}
                className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-card p-md cursor-pointer hover:shadow-modal transition-all group"
                onClick={() => setDetail(p)}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Icon name={SPECIALTY_ICON[p.specialty] || 'handyman'} size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-on-surface text-sm truncate">{p.name}</p>
                      {p.company && <p className="text-xs text-on-surface-variant truncate">{p.company}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant">
                      <Icon name="edit" size={14} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-error/10 text-error">
                      <Icon name="delete" size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-xs text-on-surface-variant mt-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="category" size={12} />
                    <span className="font-semibold text-primary">{p.specialty}</span>
                  </span>
                  {p.phone && <span className="flex items-center gap-1.5"><Icon name="phone" size={12} />{p.phone}</span>}
                  {p.email && <span className="flex items-center gap-1.5 truncate"><Icon name="mail" size={12} /><span className="truncate">{p.email}</span></span>}
                  {p.rate && (
                    <span className="flex items-center gap-1.5 font-semibold text-amber-700">
                      <Icon name="payments" size={12} />
                      {Number(p.rate).toLocaleString('fr-CI')} FCFA {p.rateType === 'horaire' ? '/h' : '(forfait)'}
                    </span>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-outline-variant/20 flex justify-between text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1"><Icon name="engineering" size={12} />{tc} ticket{tc !== 1 ? 's' : ''}</span>
                  {p.notes && <span className="italic truncate max-w-[120px]">{p.notes}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Ajout/Édition ──────────────────────────────────────────────── */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Modifier le prestataire' : 'Nouveau prestataire'}
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-outline-variant rounded-lg text-on-surface hover:bg-surface-container">Annuler</button>
            <button onClick={handleSave} disabled={!form.name.trim() || saving}
              className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2">
              {saving && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {editing ? 'Enregistrer' : 'Ajouter'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom complet *">
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Kouassi Électricité" className={inputCls} />
            </Field>
            <Field label="Société / Entreprise">
              <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Ex: KE Services" className={inputCls} />
            </Field>
            <Field label="Téléphone *">
              <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+225 07 00 00 00" className={inputCls} />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="contact@exemple.com" className={inputCls} />
            </Field>
            <Field label="Spécialité">
              <select value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} className={selectCls}>
                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Type de tarif">
              <select value={form.rateType} onChange={e => setForm(f => ({ ...f, rateType: e.target.value }))} className={selectCls}>
                <option value="forfait">Forfait (prix fixe)</option>
                <option value="horaire">Taux horaire</option>
              </select>
            </Field>
            <Field label={`Tarif (FCFA${form.rateType === 'horaire' ? '/h' : ''})`}>
              <input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                placeholder="Ex: 50000" className={inputCls} />
            </Field>
          </div>
          <Field label="Notes / Observations">
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Disponibilité, zone d'intervention, remarques…" className={inputCls + ' resize-none'} />
          </Field>
        </div>
      </Modal>

      {/* ── Modal détail prestataire ─────────────────────────────────────────── */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.name}${detail.company ? ' — ' + detail.company : ''}` : ''}
        size="md"
      >
        {detail && (
          <div className="flex flex-col gap-4">
            {/* Badge spécialité */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon name={SPECIALTY_ICON[detail.specialty] || 'handyman'} size={22} className="text-primary" />
              </div>
              <div>
                <p className="font-bold text-on-surface">{detail.specialty}</p>
                {detail.rate && (
                  <p className="text-sm text-amber-700 font-semibold">
                    {Number(detail.rate).toLocaleString('fr-CI')} FCFA {detail.rateType === 'horaire' ? '/ heure' : '(forfait)'}
                  </p>
                )}
              </div>
            </div>

            {/* Contacts */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {detail.phone && (
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">Téléphone</p>
                  <a href={`tel:${detail.phone}`} className="font-semibold text-on-surface hover:text-primary flex items-center gap-1">
                    <Icon name="phone" size={14} />{detail.phone}
                  </a>
                </div>
              )}
              {detail.email && (
                <div className="bg-surface-container rounded-xl p-3">
                  <p className="text-xs text-on-surface-variant">Email</p>
                  <a href={`mailto:${detail.email}`} className="font-semibold text-on-surface hover:text-primary truncate block text-sm">
                    {detail.email}
                  </a>
                </div>
              )}
            </div>

            {detail.notes && (
              <div className="bg-surface-container rounded-xl p-3 text-sm text-on-surface-variant italic">
                {detail.notes}
              </div>
            )}

            {/* Tickets liés */}
            <div>
              <p className="font-semibold text-on-surface text-sm mb-2 flex items-center gap-2">
                <Icon name="engineering" size={16} className="text-primary" />
                Tickets de maintenance liés ({detailTickets.length})
              </p>
              {detailTickets.length === 0 ? (
                <p className="text-sm text-on-surface-variant italic text-center py-3">Aucun ticket associé</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {detailTickets.map(t => (
                    <div key={t.id} className="flex items-start justify-between gap-2 bg-surface-container rounded-xl p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-on-surface truncate">{t.title}</p>
                        <p className="text-xs text-on-surface-variant">{t.property} {t.unit && `— ${t.unit}`}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          t.status === 'Résolu' ? 'bg-green-100 text-green-700' :
                          t.status === 'En cours' ? 'bg-tertiary/10 text-tertiary' :
                          'bg-amber-100 text-amber-700'}`}>
                          {t.status}
                        </span>
                        {t.devisAmount && (
                          <span className="text-xs font-semibold text-amber-700">
                            {parseFloat(t.devisAmount).toLocaleString('fr-CI')} FCFA
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setDetail(null); openEdit(detail); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-outline-variant rounded-lg text-on-surface hover:bg-surface-container">
                <Icon name="edit" size={15} /> Modifier
              </button>
              <button onClick={() => handleDelete(detail.id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-error/10 text-error rounded-lg hover:bg-error/20">
                <Icon name="delete" size={15} /> Supprimer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
