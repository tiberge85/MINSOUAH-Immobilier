import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

// ── Constantes ────────────────────────────────────────────────────────────────
const CATEGORIES = ['Tous', 'Immeuble', 'Villa', 'Appartement', 'Commerce'];
const STATUS_COLORS = {
  Loué:        'bg-green-100 text-green-800',
  Disponible:  'bg-surface-container text-on-surface-variant',
  Maintenance: 'bg-error-container text-on-error-container',
};
const UNIT_STATUS_COLORS = {
  Loué:        'bg-green-100 text-green-700 border-green-200',
  Disponible:  'bg-blue-50 text-blue-700 border-blue-200',
  Maintenance: 'bg-red-50 text-red-700 border-red-200',
};
const FLOOR_OPTIONS = ['RDC', '1er étage', '2ème étage', '3ème étage', '4ème étage', '5ème étage', '6ème étage+'];
const EMPTY_UNIT = { number: '', floor: 'RDC', surface: '', rooms: '', rent: '', status: 'Disponible' };
const EMPTY_FORM = {
  name: '', address: '', type: 'Appartement', status: 'Disponible',
  rent: '', surface: '', rooms: '', owner: '', ownerInitials: '', image: '',
  isBuilding: false, units: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const buildingRevenue = (units = []) =>
  units.filter(u => u.status === 'Loué').reduce((s, u) => s + Number(u.rent || 0), 0);

// ── Sous-composants ───────────────────────────────────────────────────────────
function UnitRow({ unit, onEdit, onDelete }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${UNIT_STATUS_COLORS[unit.status] || 'bg-surface-container border-outline-variant/20'} group`}>
      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
        <div>
          <p className="font-bold text-on-surface">{unit.number}</p>
          <p className="text-xs text-on-surface-variant">{unit.floor}</p>
        </div>
        <div>
          <p className="text-on-surface">{unit.surface ? `${unit.surface} m²` : '—'}</p>
          <p className="text-xs text-on-surface-variant">{unit.rooms ? `${unit.rooms} pièces` : ''}</p>
        </div>
        <div>
          <p className="font-bold text-primary">{fmt(unit.rent)}/mois</p>
        </div>
        <div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${UNIT_STATUS_COLORS[unit.status]}`}>
            {unit.status}
          </span>
        </div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => onEdit(unit)} className="w-7 h-7 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-primary shadow-sm">
          <Icon name="edit" size={13} />
        </button>
        <button onClick={() => onDelete(unit.id)} className="w-7 h-7 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-error shadow-sm">
          <Icon name="delete" size={13} />
        </button>
      </div>
    </div>
  );
}

function UnitForm({ unit, onChange, onSave, onCancel }) {
  return (
    <div className="bg-surface-container rounded-xl p-4 border border-outline-variant/30">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-1 block">Numéro / Nom</label>
          <input value={unit.number} onChange={e => onChange({ ...unit, number: e.target.value })}
            placeholder="Ex: Appt 01" className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-1 block">Étage</label>
          <select value={unit.floor} onChange={e => onChange({ ...unit, floor: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm">
            {FLOOR_OPTIONS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-1 block">Statut</label>
          <select value={unit.status} onChange={e => onChange({ ...unit, status: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm">
            {['Disponible', 'Loué', 'Maintenance'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-1 block">Surface (m²)</label>
          <input type="number" value={unit.surface} onChange={e => onChange({ ...unit, surface: e.target.value })}
            placeholder="65" className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-1 block">Pièces</label>
          <input type="number" value={unit.rooms} onChange={e => onChange({ ...unit, rooms: e.target.value })}
            placeholder="2" className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-on-surface-variant mb-1 block">Loyer (FCFA)</label>
          <input type="number" value={unit.rent} onChange={e => onChange({ ...unit, rent: e.target.value })}
            placeholder="150000" className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={!unit.number}
          className="px-4 py-1.5 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-40">
          Enregistrer l'appartement
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 bg-surface-container-high rounded-lg text-sm text-on-surface-variant hover:text-on-surface">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────
export default function Assets() {
  const { state, dispatch } = useApp();
  const properties = state.properties || [];

  const [filter, setFilter]         = useState('Tous');
  const [search, setSearch]         = useState('');
  const [modal, setModal]           = useState(null); // 'add' | 'edit' | 'detail' | 'delete'
  const [target, setTarget]         = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [step, setStep]             = useState(1);
  const [editingUnit, setEditingUnit] = useState(null); // unit being edited in building form
  const [addingUnit, setAddingUnit]  = useState(false);
  const [newUnit, setNewUnit]        = useState(EMPTY_UNIT);
  const [detailUnitEdit, setDetailUnitEdit] = useState(null);
  const [addingUnitToDetail, setAddingUnitToDetail] = useState(false);
  const [newDetailUnit, setNewDetailUnit] = useState(EMPTY_UNIT);
  const photoInputRef = useRef();

  // ── Filtres ────────────────────────────────────────────────────────────────
  const filtered = properties.filter(p => {
    const matchCat = filter === 'Tous' || p.type === filter;
    const q = search.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q) || (p.owner || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const totalUnits = properties.reduce((s, p) => s + (p.isBuilding ? (p.units?.length || 0) : 1), 0);
  const loued = properties.reduce((s, p) => {
    if (p.isBuilding) return s + (p.units?.filter(u => u.status === 'Loué').length || 0);
    return p.status === 'Loué' ? s + 1 : s;
  }, 0);
  const revenue = properties.reduce((s, p) => {
    if (p.isBuilding) return s + buildingRevenue(p.units);
    return p.status === 'Loué' ? s + Number(p.rent || 0) : s;
  }, 0);
  const maintenance = properties.reduce((s, p) => {
    if (p.isBuilding) return s + (p.units?.filter(u => u.status === 'Maintenance').length || 0);
    return p.status === 'Maintenance' ? s + 1 : s;
  }, 0);

  // ── Gestion formulaire ─────────────────────────────────────────────────────
  const openAdd = () => { setForm(EMPTY_FORM); setStep(1); setAddingUnit(false); setModal('add'); };
  const openEdit = (p) => {
    setForm({ ...p, rent: String(p.rent), surface: String(p.surface), rooms: String(p.rooms), units: p.units ? [...p.units] : [] });
    setStep(1); setAddingUnit(false); setTarget(p); setModal('edit');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'type') {
      setForm(f => ({ ...f, type: value, isBuilding: value === 'Immeuble' }));
    } else {
      setForm(f => ({ ...f, [name]: value }));
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setForm(f => ({ ...f, image: canvas.toDataURL('image/jpeg', 0.82) }));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Ajouter un appartement dans le formulaire
  const addUnitToForm = () => {
    if (!newUnit.number) return;
    const unit = { ...newUnit, id: `u${Date.now()}`, rent: Number(newUnit.rent) || 0, surface: Number(newUnit.surface) || 0, rooms: Number(newUnit.rooms) || 0 };
    setForm(f => ({ ...f, units: [...f.units, unit] }));
    setNewUnit(EMPTY_UNIT);
    setAddingUnit(false);
  };

  const removeUnitFromForm = (id) => setForm(f => ({ ...f, units: f.units.filter(u => u.id !== id) }));

  const handleSave = () => {
    const payload = {
      ...form,
      rent: form.isBuilding ? 0 : (Number(form.rent) || 0),
      surface: Number(form.surface) || 0,
      rooms: Number(form.rooms) || 0,
    };
    if (modal === 'edit') {
      dispatch({ type: 'UPDATE_PROPERTY', payload: { ...payload, id: target.id } });
    } else {
      dispatch({ type: 'ADD_PROPERTY', payload });
      // Auto-create owner if name provided and not already in owners list
      if (form.owner && form.owner.trim()) {
        const ownerName = form.owner.trim();
        const exists = (state.owners || []).some(o =>
          o.name?.toLowerCase() === ownerName.toLowerCase()
        );
        if (!exists) {
          const parts = ownerName.split(' ');
          const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
          const COLORS = [
            'bg-primary-container text-on-primary-container',
            'bg-secondary-container text-on-secondary-container',
            'bg-tertiary-container text-on-tertiary-container',
          ];
          dispatch({
            type: 'ADD_OWNER',
            payload: {
              name: ownerName,
              initials: form.ownerInitials || initials,
              email: '',
              phone: '',
              status: 'Actif',
              color: COLORS[Math.floor(Math.random() * COLORS.length)],
              revenue: Number(form.rent) || 0,
            },
          });
        }
      }
    }
    setModal(null); setTarget(null); setForm(EMPTY_FORM); setStep(1);
  };

  const handleDelete = () => {
    dispatch({ type: 'DELETE_PROPERTY', payload: target.id });
    setModal(null); setTarget(null);
  };

  // Ajouter une unité directement dans la fiche immeuble (détail)
  const addUnitToBuilding = (building) => {
    if (!newDetailUnit.number) return;
    const unit = { ...newDetailUnit, id: `u${Date.now()}`, rent: Number(newDetailUnit.rent) || 0, surface: Number(newDetailUnit.surface) || 0, rooms: Number(newDetailUnit.rooms) || 0 };
    const updated = { ...building, units: [...(building.units || []), unit] };
    dispatch({ type: 'UPDATE_PROPERTY', payload: updated });
    setTarget(updated);
    setNewDetailUnit(EMPTY_UNIT); setAddingUnitToDetail(false);
  };

  const updateUnitInBuilding = (building, updatedUnit) => {
    const updated = { ...building, units: building.units.map(u => u.id === updatedUnit.id ? updatedUnit : u) };
    dispatch({ type: 'UPDATE_PROPERTY', payload: updated });
    setTarget(updated); setDetailUnitEdit(null);
  };

  const deleteUnitFromBuilding = (building, unitId) => {
    const updated = { ...building, units: building.units.filter(u => u.id !== unitId) };
    dispatch({ type: 'UPDATE_PROPERTY', payload: updated });
    setTarget(updated);
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 md:px-6 pt-6 pb-20 max-w-7xl mx-auto">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Unités totales',  value: totalUnits, icon: 'apartment',      color: 'text-primary' },
          { label: 'Louées',          value: loued,      icon: 'check_circle',   color: 'text-green-600' },
          { label: 'En maintenance',  value: maintenance, icon: 'build',         color: 'text-error' },
          { label: 'Revenus mensuels', value: fmt(revenue), icon: 'trending_up', color: 'text-on-primary-container', highlight: true },
        ].map(s => (
          <div key={s.label} className={`p-4 rounded-2xl border border-outline-variant/20 flex flex-col gap-2 ${s.highlight ? 'bg-primary-container' : 'bg-surface'}`}>
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{s.label}</span>
              <Icon name={s.icon} size={20} className={s.color} />
            </div>
            <p className={`text-2xl font-black ${s.highlight ? 'text-on-primary-container' : 'text-on-surface'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filtres + Recherche */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${filter === c ? 'bg-primary text-on-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/20'}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1 md:w-64">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
              className="w-full pl-9 pr-4 py-2 rounded-full border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-full text-sm font-bold hover:bg-primary/90 transition-colors whitespace-nowrap">
            <Icon name="add" size={18} /> Nouveau bien
          </button>
        </div>
      </div>

      {/* Grille des biens */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <Icon name="search_off" size={48} className="mb-4 opacity-30 mx-auto" />
          <p>Aucun bien trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(p => (
            p.isBuilding ? (
              <BuildingCard key={p.id} building={p}
                onDetail={() => { setTarget(p); setModal('detail'); setAddingUnitToDetail(false); setDetailUnitEdit(null); }}
                onEdit={() => openEdit(p)}
                onDelete={() => { setTarget(p); setModal('delete'); }}
              />
            ) : (
              <PropertyCard key={p.id} property={p}
                onDetail={() => { setTarget(p); setModal('detail'); }}
                onEdit={() => openEdit(p)}
                onDelete={() => { setTarget(p); setModal('delete'); }}
              />
            )
          ))}
        </div>
      )}

      {/* ── Modal Ajouter / Modifier ──────────────────────────────────────── */}
      {(modal === 'add' || modal === 'edit') && (
        <ModalOverlay onClose={() => { setModal(null); setTarget(null); }}>
          <div className="bg-surface rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <h2 className="font-bold text-lg text-on-surface">
                {modal === 'edit' ? `Modifier — ${target?.name}` : 'Nouveau bien'}
              </h2>
              <button onClick={() => { setModal(null); setTarget(null); }} className="text-on-surface-variant hover:text-on-surface">
                <Icon name="close" size={22} />
              </button>
            </div>

            <div className="p-6">
              {/* Steps */}
              <div className="flex gap-4 mb-6">
                {[{ n: 1, l: 'Informations' }, { n: 2, l: form.isBuilding ? 'Appartements' : 'Détails' }].map((s, i) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= s.n ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{s.n}</div>
                    <span className={`text-sm ${step >= s.n ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>{s.l}</span>
                    {i < 1 && <Icon name="chevron_right" size={16} className="text-outline-variant" />}
                  </div>
                ))}
              </div>

              {/* Step 1 — Infos générales */}
              {step === 1 && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Nom du bien *</label>
                      <input name="name" value={form.name} onChange={handleChange} placeholder="Ex: Résidence Les Palmiers"
                        className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Type *</label>
                      <select name="type" value={form.type} onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30">
                        {['Immeuble', 'Villa', 'Appartement', 'Commerce'].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    {!form.isBuilding && (
                      <div>
                        <label className="text-sm font-medium text-on-surface-variant mb-1 block">Statut</label>
                        <select name="status" value={form.status} onChange={handleChange}
                          className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30">
                          {['Disponible', 'Loué', 'Maintenance'].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Adresse *</label>
                      <input name="address" value={form.address} onChange={handleChange} placeholder="Abidjan, Cocody Angré"
                        className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Propriétaire</label>
                      <input name="owner" value={form.owner} onChange={handleChange} placeholder="Nom complet"
                        className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Initiales (2 lettres)</label>
                      <input name="ownerInitials" value={form.ownerInitials} onChange={handleChange} placeholder="JD" maxLength={2}
                        className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    {!form.isBuilding && (
                      <div>
                        <label className="text-sm font-medium text-on-surface-variant mb-1 block">Loyer mensuel (FCFA) *</label>
                        <input name="rent" type="number" value={form.rent} onChange={handleChange} placeholder="150000"
                          className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Photo du bien</label>
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                      {form.image ? (
                        <div className="relative rounded-xl overflow-hidden border border-outline-variant/40 h-36">
                          <img src={form.image} alt="aperçu" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))}
                            className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-7 h-7 flex items-center justify-center hover:bg-black/70">
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => photoInputRef.current?.click()}
                          className="w-full h-24 rounded-xl border-2 border-dashed border-outline-variant/40 bg-surface-container flex flex-col items-center justify-center gap-1 hover:border-primary/40 hover:bg-primary/5 transition-colors text-on-surface-variant">
                          <Icon name="add_photo_alternate" size={24} />
                          <span className="text-sm">Choisir une photo</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {form.isBuilding && (
                    <div className="bg-primary-container/30 rounded-xl p-4 flex gap-3">
                      <Icon name="info" size={18} className="text-primary flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-on-surface-variant">
                        Un <strong className="text-on-surface">Immeuble</strong> contient plusieurs appartements.
                        À l'étape suivante, vous pourrez ajouter chaque appartement avec son loyer et son statut individuel.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2 — Appartements (immeuble) ou détails (bien simple) */}
              {step === 2 && !form.isBuilding && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Surface (m²)</label>
                      <input name="surface" type="number" value={form.surface} onChange={handleChange} placeholder="85"
                        className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-on-surface-variant mb-1 block">Nombre de pièces</label>
                      <input name="rooms" type="number" value={form.rooms} onChange={handleChange} placeholder="3"
                        className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  {form.name && (
                    <div className="bg-surface-container rounded-xl p-4 text-sm">
                      <p className="font-bold text-on-surface mb-2">{form.name}</p>
                      <p className="text-on-surface-variant">{form.address}</p>
                      <p className="text-primary font-bold mt-1">{fmt(form.rent)}/mois</p>
                    </div>
                  )}
                </div>
              )}

              {step === 2 && form.isBuilding && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-on-surface">
                      Appartements <span className="text-primary">({form.units.length})</span>
                    </p>
                    {!addingUnit && (
                      <button onClick={() => { setNewUnit(EMPTY_UNIT); setAddingUnit(true); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:bg-primary/90">
                        <Icon name="add" size={16} /> Ajouter un appartement
                      </button>
                    )}
                  </div>

                  {addingUnit && (
                    <UnitForm unit={newUnit} onChange={setNewUnit} onSave={addUnitToForm} onCancel={() => setAddingUnit(false)} />
                  )}

                  {form.units.length === 0 && !addingUnit && (
                    <div className="text-center py-8 text-on-surface-variant border-2 border-dashed border-outline-variant/30 rounded-xl">
                      <Icon name="apartment" size={32} className="mb-2 opacity-30 mx-auto" />
                      <p className="text-sm">Aucun appartement ajouté</p>
                      <p className="text-xs mt-1">Cliquez sur "Ajouter un appartement" pour commencer</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                    {form.units.map(u => (
                      editingUnit?.id === u.id ? (
                        <UnitForm key={u.id} unit={editingUnit} onChange={setEditingUnit}
                          onSave={() => { setForm(f => ({ ...f, units: f.units.map(x => x.id === editingUnit.id ? editingUnit : x) })); setEditingUnit(null); }}
                          onCancel={() => setEditingUnit(null)} />
                      ) : (
                        <UnitRow key={u.id} unit={u}
                          onEdit={u => setEditingUnit(u)}
                          onDelete={id => removeUnitFromForm(id)} />
                      )
                    ))}
                  </div>

                  {form.units.length > 0 && (
                    <div className="bg-surface-container rounded-xl p-3 flex justify-between text-sm">
                      <span className="text-on-surface-variant">Revenu total potentiel</span>
                      <span className="font-bold text-primary">{fmt(form.units.reduce((s, u) => s + Number(u.rent || 0), 0))}/mois</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-surface border-t border-outline-variant/20 px-6 py-4 flex justify-between rounded-b-3xl">
              <button onClick={() => { setModal(null); setTarget(null); }}
                className="px-4 py-2 rounded-xl text-on-surface-variant hover:bg-surface-container-high text-sm font-medium">
                Annuler
              </button>
              <div className="flex gap-3">
                {step > 1 && (
                  <button onClick={() => setStep(1)} className="px-4 py-2 rounded-xl bg-surface-container text-on-surface text-sm font-semibold">
                    ← Précédent
                  </button>
                )}
                {step < 2 ? (
                  <button onClick={() => setStep(2)} disabled={!form.name || !form.address}
                    className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 disabled:opacity-40">
                    Suivant →
                  </button>
                ) : (
                  <button onClick={handleSave} disabled={!form.name || (!form.isBuilding && !form.rent)}
                    className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2">
                    <Icon name="save" size={16} /> Enregistrer
                  </button>
                )}
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal Détail bien simple ──────────────────────────────────────── */}
      {modal === 'detail' && target && !target.isBuilding && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div className="bg-surface rounded-3xl w-full max-w-md">
            <div className="relative h-48 rounded-t-3xl overflow-hidden bg-surface-container">
              {target.image
                ? <img src={target.image} alt={target.name} className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
                : <div className="w-full h-full flex items-center justify-center"><Icon name="apartment" size={48} className="text-outline-variant" /></div>
              }
              <button onClick={() => setModal(null)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="font-bold text-xl text-on-surface">{target.name}</h2>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[target.status]}`}>{target.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mb-6">
                {[
                  ['Adresse', target.address], ['Type', target.type],
                  ['Loyer', fmt(target.rent) + '/mois'], ['Propriétaire', target.owner || '—'],
                  ['Surface', target.surface ? `${target.surface} m²` : '—'], ['Pièces', target.rooms || '—'],
                ].map(([l, v]) => (
                  <div key={l} className="bg-surface-container rounded-xl p-3">
                    <p className="text-xs text-on-surface-variant mb-0.5">{l}</p>
                    <p className={`font-semibold ${l === 'Loyer' ? 'text-primary' : 'text-on-surface'}`}>{v}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setModal('delete'); }}
                  className="flex-1 py-2.5 rounded-xl border border-error text-error font-semibold text-sm hover:bg-error-container/30">
                  Supprimer
                </button>
                <button onClick={() => { openEdit(target); }}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary/90">
                  Modifier
                </button>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal Détail immeuble ─────────────────────────────────────────── */}
      {modal === 'detail' && target?.isBuilding && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div className="bg-surface rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <div>
                <h2 className="font-bold text-lg text-on-surface">{target.name}</h2>
                <p className="text-sm text-on-surface-variant flex items-center gap-1 mt-0.5">
                  <Icon name="location_on" size={14} />{target.address}
                </p>
              </div>
              <button onClick={() => setModal(null)} className="text-on-surface-variant hover:text-on-surface">
                <Icon name="close" size={22} />
              </button>
            </div>

            <div className="p-6">
              {/* Stats immeuble */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { l: 'Total', v: target.units?.length || 0, c: 'text-primary' },
                  { l: 'Loués', v: target.units?.filter(u => u.status === 'Loué').length || 0, c: 'text-green-600' },
                  { l: 'Libres', v: target.units?.filter(u => u.status === 'Disponible').length || 0, c: 'text-blue-600' },
                  { l: 'Maintenance', v: target.units?.filter(u => u.status === 'Maintenance').length || 0, c: 'text-error' },
                ].map(s => (
                  <div key={s.l} className="bg-surface-container rounded-xl p-3 text-center">
                    <p className={`text-2xl font-black ${s.c}`}>{s.v}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{s.l}</p>
                  </div>
                ))}
              </div>

              <div className="bg-primary-container/30 rounded-xl p-3 mb-6 flex justify-between items-center">
                <span className="text-sm text-on-surface-variant font-medium">Revenu mensuel total</span>
                <span className="font-black text-primary">{fmt(buildingRevenue(target.units))}/mois</span>
              </div>

              {/* Liste des unités */}
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-on-surface">Liste des appartements</p>
                {!addingUnitToDetail && (
                  <button onClick={() => { setNewDetailUnit(EMPTY_UNIT); setAddingUnitToDetail(true); setDetailUnitEdit(null); }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-sm font-semibold hover:bg-primary/90">
                    <Icon name="add" size={16} /> Ajouter
                  </button>
                )}
              </div>

              {addingUnitToDetail && (
                <div className="mb-3">
                  <UnitForm unit={newDetailUnit} onChange={setNewDetailUnit}
                    onSave={() => addUnitToBuilding(target)}
                    onCancel={() => setAddingUnitToDetail(false)} />
                </div>
              )}

              <div className="flex flex-col gap-2">
                {(target.units || []).map(u => (
                  detailUnitEdit?.id === u.id ? (
                    <UnitForm key={u.id} unit={detailUnitEdit} onChange={setDetailUnitEdit}
                      onSave={() => updateUnitInBuilding(target, detailUnitEdit)}
                      onCancel={() => setDetailUnitEdit(null)} />
                  ) : (
                    <UnitRow key={u.id} unit={u}
                      onEdit={u => { setDetailUnitEdit(u); setAddingUnitToDetail(false); }}
                      onDelete={id => deleteUnitFromBuilding(target, id)} />
                  )
                ))}
                {(target.units || []).length === 0 && !addingUnitToDetail && (
                  <div className="text-center py-8 text-on-surface-variant border-2 border-dashed border-outline-variant/30 rounded-xl">
                    <p className="text-sm">Aucun appartement enregistré</p>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-surface border-t border-outline-variant/20 px-6 py-4 flex gap-3 rounded-b-3xl">
              <button onClick={() => { setModal('delete'); }}
                className="px-4 py-2 rounded-xl border border-error text-error font-semibold text-sm hover:bg-error-container/30">
                Supprimer l'immeuble
              </button>
              <button onClick={() => openEdit(target)}
                className="flex-1 py-2 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary/90">
                Modifier les infos
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal Confirmation suppression ───────────────────────────────── */}
      {modal === 'delete' && target && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div className="bg-surface rounded-3xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mx-auto mb-4">
              <Icon name="warning" size={32} className="text-error" />
            </div>
            <h3 className="font-bold text-lg text-on-surface mb-2">Supprimer ce bien ?</h3>
            <p className="text-sm text-on-surface-variant mb-2">
              <strong className="text-on-surface">"{target.name}"</strong>
            </p>
            <p className="text-xs text-on-surface-variant mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface font-semibold text-sm">
                Annuler
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl bg-error text-on-error font-bold text-sm">
                Supprimer
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Cartes ────────────────────────────────────────────────────────────────────
function BuildingCard({ building, onDetail, onEdit, onDelete }) {
  const units = building.units || [];
  const loued = units.filter(u => u.status === 'Loué').length;
  const libres = units.filter(u => u.status === 'Disponible').length;
  const maint = units.filter(u => u.status === 'Maintenance').length;
  const revenue = buildingRevenue(units);
  const rate = units.length > 0 ? Math.round((loued / units.length) * 100) : 0;

  return (
    <div onClick={onDetail} className="bg-surface rounded-2xl overflow-hidden border border-outline-variant/20 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
      <div className="relative h-44 overflow-hidden bg-surface-container">
        {building.image
          ? <img src={building.image} alt={building.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => e.target.style.display = 'none'} />
          : <div className="w-full h-full flex items-center justify-center"><Icon name="domain" size={48} className="text-outline-variant" /></div>
        }
        <div className="absolute top-3 left-3">
          <span className="bg-primary text-on-primary text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Icon name="domain" size={12} /> Immeuble · {units.length} appts
          </span>
        </div>
        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onEdit(); }} className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-primary shadow hover:bg-white">
            <Icon name="edit" size={14} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-error shadow hover:bg-white">
            <Icon name="delete" size={14} />
          </button>
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-bold text-on-surface mb-1">{building.name}</h3>
        <p className="text-xs text-on-surface-variant flex items-center gap-1 mb-3">
          <Icon name="location_on" size={12} />{building.address}
        </p>

        {/* Barre de taux */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-on-surface-variant">Occupation</span>
            <span className="font-bold text-green-600">{rate}%</span>
          </div>
          <div className="h-1.5 bg-surface-container-high rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${rate}%` }} />
          </div>
        </div>

        {/* Stats unités */}
        <div className="flex gap-2 mb-3">
          {[
            { v: loued,  l: 'Loués',  c: 'bg-green-100 text-green-700' },
            { v: libres, l: 'Libres', c: 'bg-blue-50 text-blue-700' },
            { v: maint,  l: 'Maint.', c: 'bg-red-50 text-red-700' },
          ].map(s => (
            <div key={s.l} className={`flex-1 text-center py-1 rounded-lg text-xs font-semibold ${s.c}`}>
              <p className="font-black text-base leading-tight">{s.v}</p>
              <p>{s.l}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container text-xs font-bold">
              {building.ownerInitials || '?'}
            </div>
            <span className="text-xs text-on-surface-variant">{building.owner}</span>
          </div>
          <span className="font-bold text-primary text-sm">{fmt(revenue)}/mois</span>
        </div>
      </div>
    </div>
  );
}

function PropertyCard({ property, onDetail, onEdit, onDelete }) {
  return (
    <div onClick={onDetail} className="bg-surface rounded-2xl overflow-hidden border border-outline-variant/20 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
      <div className="relative h-44 overflow-hidden bg-surface-container">
        {property.image
          ? <img src={property.image} alt={property.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={e => e.target.style.display = 'none'} />
          : <div className="w-full h-full flex items-center justify-center"><Icon name="apartment" size={48} className="text-outline-variant" /></div>
        }
        <div className="absolute top-3 left-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_COLORS[property.status] || 'bg-surface-container text-on-surface'}`}>{property.status}</span>
        </div>
        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onEdit(); }} className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-primary shadow hover:bg-white">
            <Icon name="edit" size={14} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-error shadow hover:bg-white">
            <Icon name="delete" size={14} />
          </button>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-on-surface mb-1">{property.name}</h3>
        <p className="text-xs text-on-surface-variant flex items-center gap-1 mb-3">
          <Icon name="location_on" size={12} />{property.address}
        </p>
        {(property.surface > 0 || property.rooms > 0) && (
          <div className="flex gap-3 text-xs text-on-surface-variant mb-3">
            {property.surface > 0 && <span className="flex items-center gap-1"><Icon name="straighten" size={12} />{property.surface} m²</span>}
            {property.rooms > 0 && <span className="flex items-center gap-1"><Icon name="door_open" size={12} />{property.rooms} pièces</span>}
          </div>
        )}
        <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container text-xs font-bold">
              {property.ownerInitials || '?'}
            </div>
            <span className="text-xs text-on-surface-variant">{property.owner}</span>
          </div>
          <span className="font-bold text-primary text-sm">{fmt(property.rent)}/mois</span>
        </div>
      </div>
    </div>
  );
}

function ModalOverlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}
