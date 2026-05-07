import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Icon from '../components/Icon';

const CATEGORIES = ['Tous les biens', 'Appartement', 'Villa', 'Commerce'];
const TYPE_OPTIONS = [
  { value: 'Appartement', label: 'Appartement' },
  { value: 'Villa', label: 'Villa' },
  { value: 'Commerce', label: 'Commerce' },
];
const STATUS_OPTIONS = [
  { value: 'Disponible', label: 'Disponible' },
  { value: 'Loué', label: 'Loué' },
  { value: 'Maintenance', label: 'En Maintenance' },
];
const STATUS_COLORS = {
  Loué: 'bg-green-100 text-green-800',
  Disponible: 'bg-surface-container-highest text-on-surface',
  Maintenance: 'bg-error-container text-on-error-container',
};
const EMPTY_FORM = {
  name: '', address: '', type: 'Appartement', status: 'Disponible',
  rent: '', surface: '', rooms: '', owner: '', ownerInitials: '', image: '',
};

function PropertyForm({ form, onChange, step }) {
  return (
    <>
      {step === 1 && (
        <div className="flex flex-col gap-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Input label="Nom du bien" name="name" placeholder="Ex: Villa Azur" value={form.name} onChange={onChange} required />
            <Select label="Type" value={form.type} onChange={(e) => onChange({ target: { name: 'type', value: e.target.value } })} options={TYPE_OPTIONS} required />
          </div>
          <Input label="Adresse complète" name="address" placeholder="Abidjan, Cocody Danga" value={form.address} onChange={onChange} icon="location_on" required />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Select label="Statut" value={form.status} onChange={(e) => onChange({ target: { name: 'status', value: e.target.value } })} options={STATUS_OPTIONS} />
            <Input label="Loyer mensuel (FCFA)" name="rent" type="number" placeholder="Ex: 450000" value={form.rent} onChange={onChange} icon="payments" required />
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="flex flex-col gap-md">
          <div className="grid grid-cols-2 gap-md">
            <Input label="Surface (m²)" name="surface" type="number" placeholder="Ex: 85" value={form.surface} onChange={onChange} icon="straighten" />
            <Input label="Nombre de pièces" name="rooms" type="number" placeholder="Ex: 3" value={form.rooms} onChange={onChange} icon="door_open" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Input label="Propriétaire" name="owner" placeholder="Nom du propriétaire" value={form.owner} onChange={onChange} icon="person" />
            <Input label="Initiales (2 lettres)" name="ownerInitials" placeholder="Ex: JD" value={form.ownerInitials} onChange={onChange} />
          </div>
          <Input label="URL de l'image (optionnel)" name="image" placeholder="https://..." value={form.image} onChange={onChange} icon="image" />
          {form.name && (
            <div className="bg-surface-container rounded-xl p-md border border-outline-variant/20">
              <p className="text-label-sm text-on-surface-variant mb-sm uppercase tracking-wider">Récapitulatif</p>
              <div className="grid grid-cols-2 gap-xs text-body-sm">
                <span className="text-on-surface-variant">Nom :</span>
                <span className="font-medium text-on-surface">{form.name}</span>
                <span className="text-on-surface-variant">Adresse :</span>
                <span className="font-medium text-on-surface truncate">{form.address}</span>
                <span className="text-on-surface-variant">Loyer :</span>
                <span className="font-bold text-primary">{Number(form.rent || 0).toLocaleString('fr-FR')} FCFA/mois</span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function Assets() {
  const { state, dispatch } = useApp();
  const properties = state.properties;

  const [filter, setFilter] = useState('Tous les biens');
  const [search, setSearch] = useState('');
  const [step, setStep] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = properties.filter((p) => {
    const matchCat = filter === 'Tous les biens' || p.type === filter;
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const stats = [
    { label: 'Unités Totales', value: properties.length, icon: 'apartment', iconColor: 'text-primary', highlight: false },
    { label: 'Disponibles', value: properties.filter(p => p.status === 'Disponible').length, icon: 'check_circle', iconColor: 'text-tertiary', highlight: false },
    { label: 'Maintenance', value: properties.filter(p => p.status === 'Maintenance').length, icon: 'build', iconColor: 'text-error', highlight: false },
    {
      label: 'Revenu MTD',
      value: properties.filter(p => p.status === 'Loué').reduce((s, p) => s + Number(p.rent), 0).toLocaleString('fr-FR') + ' FCFA',
      icon: 'trending_up',
      iconColor: 'text-on-primary-container',
      highlight: true,
    },
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const openAdd = () => { setForm(EMPTY_FORM); setStep(1); setAddOpen(true); };
  const openEdit = (p, e) => {
    e?.stopPropagation();
    setForm({ ...p, rent: String(p.rent), surface: String(p.surface), rooms: String(p.rooms) });
    setStep(1);
    setEditTarget(p);
  };

  const handleSave = () => {
    const payload = {
      ...form,
      rent: Number(form.rent) || 0,
      surface: Number(form.surface) || 0,
      rooms: Number(form.rooms) || 0,
    };
    if (editTarget) {
      dispatch({ type: 'UPDATE_PROPERTY', payload: { ...payload, id: editTarget.id } });
      setEditTarget(null);
    } else {
      dispatch({ type: 'ADD_PROPERTY', payload });
      setAddOpen(false);
    }
    setForm(EMPTY_FORM);
    setStep(1);
  };

  const handleDelete = () => {
    dispatch({ type: 'DELETE_PROPERTY', payload: deleteTarget.id });
    setDeleteTarget(null);
    if (detailTarget?.id === deleteTarget?.id) setDetailTarget(null);
  };

  return (
    <div className="px-margin pt-gutter pb-xl max-w-7xl mx-auto">

      {/* Stats */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-xl">
        {stats.map(s => (
          <div key={s.label} className={`p-md rounded-xl shadow-card border border-outline-variant/20 flex flex-col justify-between h-32 ${s.highlight ? 'bg-primary-container' : 'bg-surface-container-lowest'}`}>
            <div className="flex justify-between items-start">
              <span className={`text-label-sm font-label-sm uppercase tracking-wider ${s.highlight ? 'text-on-primary-container' : 'text-on-surface-variant'}`}>{s.label}</span>
              <Icon name={s.icon} className={s.highlight ? 'text-on-primary-container' : s.iconColor} />
            </div>
            <div className={`font-h1 text-h1 font-bold ${s.highlight ? 'text-on-primary-container' : 'text-on-surface'}`}>{s.value}</div>
          </div>
        ))}
      </section>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-md mb-lg">
        <div className="flex items-center gap-xs overflow-x-auto no-scrollbar">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              className={`px-md py-sm rounded-full text-label-md font-label-md whitespace-nowrap transition-colors ${filter === cat ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-sm">
          <div className="relative flex-1 md:w-72">
            <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={18} />
            <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-sm bg-surface-container-lowest border border-outline-variant rounded-full focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-body-sm" />
          </div>
          <Button icon="add_home" onClick={openAdd}>Nouveau Bien</Button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-xl text-on-surface-variant">
          <Icon name="search_off" size={48} className="mb-md opacity-40" />
          <p className="text-body-lg">Aucun bien trouvé</p>
        </div>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {filtered.map(property => (
            <div key={property.id} onClick={() => setDetailTarget(property)}
              className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-card border border-outline-variant/20 hover:shadow-modal transition-shadow duration-300 cursor-pointer group">
              <div className="relative h-52 overflow-hidden bg-surface-container">
                {property.image ? (
                  <img src={property.image} alt={property.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="apartment" size={48} className="text-outline-variant" />
                  </div>
                )}
                <div className="absolute top-3 left-3">
                  <span className={`px-sm py-1 rounded-full text-label-sm font-bold uppercase tracking-wide ${STATUS_COLORS[property.status] || 'bg-surface-container text-on-surface'}`}>
                    {property.status}
                  </span>
                </div>
                {/* Action buttons on hover */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => openEdit(property, e)}
                    className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-primary shadow hover:bg-white transition-colors">
                    <Icon name="edit" size={15} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); setDeleteTarget(property); }}
                    className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-error shadow hover:bg-white transition-colors">
                    <Icon name="delete" size={15} />
                  </button>
                </div>
              </div>
              <div className="p-md">
                <h3 className="font-h3 text-h3 text-on-surface mb-xs">{property.name}</h3>
                <p className="text-body-sm text-on-surface-variant flex items-center gap-xs mb-md">
                  <Icon name="location_on" size={14} />{property.address}
                </p>
                {property.surface > 0 && (
                  <div className="flex gap-md mb-md text-body-sm text-on-surface-variant">
                    <span className="flex items-center gap-1"><Icon name="straighten" size={13} />{property.surface} m²</span>
                    {property.rooms > 0 && <span className="flex items-center gap-1"><Icon name="door_open" size={13} />{property.rooms} pièces</span>}
                  </div>
                )}
                <div className="flex items-center justify-between pt-md border-t border-outline-variant/20">
                  <div className="flex items-center gap-xs">
                    <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container text-xs font-bold">
                      {property.ownerInitials || '?'}
                    </div>
                    <span className="text-label-sm text-on-surface">{property.owner}</span>
                  </div>
                  <span className="text-primary font-bold text-body-sm">{Number(property.rent).toLocaleString('fr-FR')} FCFA/mois</span>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Add Modal ──────────────────────────────────────────────────── */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setStep(1); }} title="Ajouter un Nouveau Bien" size="md"
        footer={
          <>
            {step > 1 && <Button variant="secondary" onClick={() => setStep(s => s - 1)}>Précédent</Button>}
            {step < 2
              ? <Button onClick={() => setStep(2)}>Suivant <Icon name="arrow_forward" size={16} /></Button>
              : <Button icon="check" onClick={handleSave} disabled={!form.name || !form.rent}>Enregistrer</Button>}
          </>
        }>
        <StepIndicator step={step} />
        <PropertyForm form={form} onChange={handleChange} step={step} />
      </Modal>

      {/* ── Edit Modal ─────────────────────────────────────────────────── */}
      <Modal open={!!editTarget} onClose={() => { setEditTarget(null); setStep(1); }} title={`Modifier — ${editTarget?.name || ''}`} size="md"
        footer={
          <>
            {step > 1 && <Button variant="secondary" onClick={() => setStep(s => s - 1)}>Précédent</Button>}
            {step < 2
              ? <Button onClick={() => setStep(2)}>Suivant <Icon name="arrow_forward" size={16} /></Button>
              : <Button icon="save" onClick={handleSave}>Enregistrer les modifications</Button>}
          </>
        }>
        <StepIndicator step={step} />
        <PropertyForm form={form} onChange={handleChange} step={step} />
      </Modal>

      {/* ── Detail Modal ───────────────────────────────────────────────── */}
      <Modal open={!!detailTarget && !editTarget} onClose={() => setDetailTarget(null)} title={detailTarget?.name || ''} size="sm"
        footer={
          <>
            <Button variant="secondary" icon="delete" onClick={() => { setDeleteTarget(detailTarget); setDetailTarget(null); }}>Supprimer</Button>
            <Button icon="edit" onClick={() => { openEdit(detailTarget); setDetailTarget(null); }}>Modifier</Button>
          </>
        }>
        {detailTarget && (
          <div className="flex flex-col gap-md">
            <div className="h-48 rounded-xl overflow-hidden bg-surface-container">
              {detailTarget.image ? (
                <img src={detailTarget.image} alt={detailTarget.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Icon name="apartment" size={48} className="text-outline-variant" /></div>
              )}
            </div>
            <div className="flex flex-wrap gap-sm">
              <Badge label={detailTarget.status} />
              <span className="inline-flex items-center bg-surface-container px-sm py-1 rounded-full text-label-sm text-on-surface-variant gap-1">
                <Icon name="category" size={14} />{detailTarget.type}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-sm text-body-sm">
              {[
                ['Adresse', detailTarget.address],
                ['Loyer', Number(detailTarget.rent).toLocaleString('fr-FR') + ' FCFA/mois'],
                ['Surface', detailTarget.surface ? detailTarget.surface + ' m²' : '—'],
                ['Pièces', detailTarget.rooms || '—'],
              ].map(([label, val]) => (
                <div key={label} className="bg-surface-container rounded-xl p-sm">
                  <p className="text-on-surface-variant text-label-sm mb-1">{label}</p>
                  <p className={`font-medium ${label === 'Loyer' ? 'text-primary font-bold' : 'text-on-surface'}`}>{val}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Confirm Delete ─────────────────────────────────────────────── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmer la suppression" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</Button>
            <Button variant="danger" icon="delete" onClick={handleDelete}>Supprimer définitivement</Button>
          </>
        }>
        <div className="flex flex-col items-center text-center gap-md py-md">
          <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center">
            <Icon name="warning" size={32} className="text-error" />
          </div>
          <div>
            <p className="text-body-md text-on-surface">Voulez-vous vraiment supprimer</p>
            <p className="font-bold text-on-surface text-body-lg">"{deleteTarget?.name}"</p>
            <p className="text-body-sm text-on-surface-variant mt-sm">Cette action est irréversible.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-2 mb-lg">
      {[1, 2].map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{s}</div>
          <span className={`text-label-md ${step >= s ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>{s === 1 ? 'Informations' : 'Détails'}</span>
          {i < 1 && <Icon name="chevron_right" className="text-outline" size={18} />}
        </div>
      ))}
    </div>
  );
}
