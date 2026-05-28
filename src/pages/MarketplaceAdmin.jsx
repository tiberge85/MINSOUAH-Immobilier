import { useState, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

/* ── Constants ─────────────────────────────────────────────────────────────── */
const TYPES = [
  { value: 'maison',            label: 'Maison' },
  { value: 'appartement',       label: 'Appartement' },
  { value: 'villa',             label: 'Villa' },
  { value: 'terrain',           label: 'Terrain' },
  { value: 'bureau',            label: 'Bureau' },
  { value: 'residence_meublee', label: 'Résidence Meublée' },
];

const AMENITY_LIST = [
  'piscine', 'parking', 'gardien', 'climatisation', 'balcon', 'terrasse',
  'ascenseur', 'garage', 'jardin', 'meublé', 'wifi', 'eau', 'électricité',
  'générateur', 'interphone', 'digicode',
];

const STATUS_COLORS = {
  publié:   'bg-green-100 text-green-700',
  suspendu: 'bg-amber-100 text-amber-700',
  brouillon:'bg-surface-container text-on-surface-variant',
  vendu:    'bg-red-100 text-red-700',
  loué:     'bg-blue-100 text-blue-700',
};

const TYPE_LABELS = Object.fromEntries(TYPES.map(t => [t.value, t.label]));
const fmt = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

const EMPTY_FORM = {
  type: 'appartement', transaction: 'location', title: '', description: '',
  price: '', pricePeriod: 'mois', zone: '', city: '', surface: '', rooms: '',
  bedrooms: '', bathrooms: '', floor: '', amenities: [], images: [],
  contactPhone: '', contactWhatsApp: '', status: 'brouillon', featured: false,
  unlockPrice: 500,
};

/* ── Thumbnail with error state ─────────────────────────────────────────────── */
function ImageThumb({ url }) {
  const [err, setErr] = useState(false);
  if (err) return (
    <div className="w-full h-full bg-amber-50 flex flex-col items-center justify-center gap-1 p-1">
      <Icon name="broken_image" size={18} className="text-amber-500" />
      <span className="text-[8px] text-amber-600 text-center leading-tight">URL inaccessible</span>
    </div>
  );
  return <img src={url} alt="" className="w-full h-full object-cover" onError={() => setErr(true)} />;
}

/* ── Image uploader ────────────────────────────────────────────────────────── */
async function compressToDataUrl(file, maxPx = 600, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width  * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadToImgbb(file, apiKey) {
  const dataUrl = await compressToDataUrl(file);
  const b64 = dataUrl.split(',')[1];
  const body = new FormData();
  body.append('key', apiKey);
  body.append('image', b64);
  const resp = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body });
  if (!resp.ok) throw new Error(`imgbb ${resp.status}`);
  const json = await resp.json();
  if (!json.success) throw new Error(json.error?.message || 'imgbb error');
  return json.data.url;
}

function ImageUploader({ images, onChange, listingId, imgbbApiKey }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [uploadError, setUploadError] = useState('');

  const upload = async (files) => {
    setUploading(true);
    setUploadError('');
    const urls = [...images];
    for (const file of Array.from(files)) {
      setProgress(`${urls.length + 1}/${Array.from(files).length}…`);
      try {
        let url;
        if (imgbbApiKey) {
          url = await uploadToImgbb(file, imgbbApiKey);
        } else {
          // No external service configured — compress locally and store as data URL
          url = await compressToDataUrl(file);
        }
        urls.push(url);
      } catch (err) {
        console.error('Upload error:', err);
        setUploadError(imgbbApiKey
          ? 'Erreur imgbb — vérifiez votre clé API dans Paramètres → Marketplace.'
          : 'Erreur de compression. Réessayez avec un autre fichier.'
        );
        setUploading(false);
        setProgress('');
        return;
      }
    }
    setUploading(false);
    setProgress('');
    onChange(urls);
  };

  const addByUrl = () => {
    const raw = urlInput.trim();
    if (!raw) return;
    try { new URL(raw); } catch { alert('URL invalide'); return; }
    onChange([...images, raw]);
    setUrlInput('');
  };

  const remove = (idx) => onChange(images.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-3">
      {uploadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-800 flex items-start gap-2">
          <Icon name="error" size={14} className="flex-shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {images.map((url, idx) => (
          <div key={idx} className="relative w-24 h-20 rounded-xl overflow-hidden border border-outline-variant group">
            <ImageThumb url={url} />
            <button onClick={() => remove(idx)}
              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Icon name="delete" size={18} />
            </button>
            {idx === 0 && (
              <span className="absolute top-1 left-1 text-[9px] bg-primary text-on-primary px-1 py-0.5 rounded font-bold">Principale</span>
            )}
          </div>
        ))}
        {/* File upload — always enabled, uses canvas compression when no imgbb key */}
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-24 h-20 rounded-xl border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-1 text-on-surface-variant hover:border-primary hover:text-primary transition-colors disabled:opacity-40">
          {uploading
            ? <><Icon name="progress_activity" size={18} className="animate-spin" /><span className="text-[10px]">{progress}</span></>
            : <><Icon name="add_photo_alternate" size={20} /><span className="text-[10px] font-semibold">Fichier</span></>
          }
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
      <p className="text-[10px] text-on-surface-variant">
        Cliquez <strong>Fichier</strong> pour uploader directement depuis votre appareil (recommandé).
      </p>
    </div>
  );
}

/* ── Listing form modal ─────────────────────────────────────────────────────── */
function ListingFormModal({ initial, onSave, onClose }) {
  const { state } = useApp();
  const imgbbApiKey = state.systemSettings?.imgbbApiKey || '';
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // Keep a ref that's always current — needed because onBlur + click save
  // happen in the same event loop tick and React state updates are batched
  const latestImagesRef = useRef(form.images);
  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const toggleAmenity = (a) => set('amenities', form.amenities.includes(a)
    ? form.amenities.filter(x => x !== a)
    : [...form.amenities, a]
  );

  const handleSave = async () => {
    if (!form.title || !form.price || !form.zone) { alert('Titre, prix et zone sont obligatoires.'); return; }
    setSaving(true);
    try {
      await onSave({ ...form, images: latestImagesRef.current, price: parseFloat(form.price) || 0, unlockPrice: parseFloat(form.unlockPrice) ?? 500, surface: parseFloat(form.surface) || 0, rooms: parseInt(form.rooms) || 0, bedrooms: parseInt(form.bedrooms) || 0, bathrooms: parseInt(form.bathrooms) || 0, floor: form.floor ? parseInt(form.floor) : null });
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      alert(`Erreur: ${err?.code || err?.message || 'inconnue'}.\n\nSi "permission-denied" → reconnectez-vous. Si "resource-exhausted" → supprimez des images.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-surface w-full max-w-2xl rounded-3xl shadow-2xl my-8" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <h3 className="font-bold text-on-surface text-base">{initial?.id ? 'Modifier l\'annonce' : 'Nouvelle annonce'}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" size={20} /></button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto max-h-[80vh]">
          {/* Type + Transaction */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Type de bien *</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} className="form-input">
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Transaction *</label>
              <select value={form.transaction} onChange={e => set('transaction', e.target.value)} className="form-input">
                <option value="location">Location</option>
                <option value="vente">Vente</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="form-label">Titre de l'annonce *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className="form-input"
              placeholder="Ex: Bel appartement 3 pièces à Cocody" />
          </div>

          {/* Price */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="form-label">Prix (FCFA) *</label>
              <input type="number" value={form.price} onChange={e => set('price', e.target.value)} className="form-input" placeholder="Ex: 150000" />
            </div>
            {form.transaction === 'location' && (
              <div>
                <label className="form-label">Période</label>
                <select value={form.pricePeriod} onChange={e => set('pricePeriod', e.target.value)} className="form-input">
                  <option value="mois">/ mois</option>
                  <option value="an">/ an</option>
                  <option value="nuit">/ nuit</option>
                  <option value="semaine">/ semaine</option>
                </select>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Zone / Quartier *</label>
              <input value={form.zone} onChange={e => set('zone', e.target.value)} className="form-input" placeholder="Ex: Cocody, Marcory…" />
            </div>
            <div>
              <label className="form-label">Ville</label>
              <input value={form.city} onChange={e => set('city', e.target.value)} className="form-input" placeholder="Ex: Abidjan" />
            </div>
          </div>

          {/* Characteristics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: 'surface',   label: 'Surface (m²)',   placeholder: '80' },
              { key: 'rooms',     label: 'Nb pièces',      placeholder: '3' },
              { key: 'bedrooms',  label: 'Chambres',       placeholder: '2' },
              { key: 'bathrooms', label: 'Sdb.',           placeholder: '1' },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="form-label">{label}</label>
                <input type="number" value={form[key]} onChange={e => set(key, e.target.value)} className="form-input" placeholder={placeholder} />
              </div>
            ))}
          </div>

          {/* Description */}
          <div>
            <label className="form-label">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} className="form-input" rows={4}
              placeholder="Décrivez le bien : état, environnement, atouts, conditions de location/vente…" />
          </div>

          {/* Amenities */}
          <div>
            <label className="form-label">Équipements & caractéristiques</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {AMENITY_LIST.map(a => (
                <button key={a} type="button" onClick={() => toggleAmenity(a)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${form.amenities.includes(a) ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Photos */}
          <div>
            <label className="form-label">Photos ({form.images.length})</label>
            <ImageUploader images={form.images} onChange={urls => { latestImagesRef.current = urls; set('images', urls); }} listingId={initial?.id} imgbbApiKey={imgbbApiKey} />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Téléphone contact</label>
              <input value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} className="form-input" placeholder="+225 07 00 00 00 00" />
            </div>
            <div>
              <label className="form-label">Numéro WhatsApp</label>
              <input value={form.contactWhatsApp} onChange={e => set('contactWhatsApp', e.target.value)} className="form-input" placeholder="+225 07 00 00 00 00" />
            </div>
          </div>

          {/* Status + Unlock Price + Featured */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Statut</label>
              <select value={form.status} onChange={e => set('status', e.target.value)} className="form-input">
                <option value="brouillon">Brouillon</option>
                <option value="publié">Publié</option>
                <option value="suspendu">Suspendu</option>
                <option value="vendu">Vendu</option>
                <option value="loué">Loué</option>
              </select>
            </div>
            <div>
              <label className="form-label">Déblocage contact (FCFA)</label>
              <input type="number" min="0" value={form.unlockPrice ?? 500} onChange={e => set('unlockPrice', e.target.value)} className="form-input" placeholder="500" />
              <p className="text-[10px] text-on-surface-variant mt-1">0 = contact gratuit</p>
            </div>
            <div className="flex flex-col justify-start pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => set('featured', !form.featured)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${form.featured ? 'bg-amber-500' : 'bg-outline-variant'}`}>
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.featured ? 'left-6' : 'left-1'}`} />
                </div>
                <span className="text-sm text-on-surface font-semibold">Annonce vedette</span>
                <Icon name="star" size={14} className={form.featured ? 'text-amber-500' : 'text-on-surface-variant'} />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high">Annuler</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2.5 text-sm font-bold text-on-primary bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-40 flex items-center gap-2">
            {saving ? <><Icon name="progress_activity" size={16} className="animate-spin" />Enregistrement…</> : <><Icon name="save" size={16} />{initial?.id ? 'Enregistrer les modifications' : 'Publier l\'annonce'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function MarketplaceAdmin() {
  const { state, dispatch } = useApp();
  const { listings = [] } = state;

  const [modal,         setModal]         = useState(null); // 'add' | 'edit'
  const [editTarget,    setEditTarget]    = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [statusFilter,  setStatusFilter]  = useState('all');
  const [search,        setSearch]        = useState('');

  const filtered = listings
    .filter(l => statusFilter === 'all' || l.status === statusFilter)
    .filter(l => !search || l.title?.toLowerCase().includes(search.toLowerCase()) || l.zone?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const handleSave = useCallback(async (form) => {
    if (editTarget) {
      await dispatch({ type: 'UPDATE_LISTING', payload: { ...editTarget, ...form } });
    } else {
      await dispatch({ type: 'ADD_LISTING', payload: form });
    }
    setEditTarget(null);
  }, [dispatch, editTarget]);

  const confirmDelete = async () => {
    await dispatch({ type: 'DELETE_LISTING', payload: deleteConfirm.id });
    setDeleteConfirm(null);
  };

  const quickStatus = async (listing, status) => {
    await dispatch({ type: 'UPDATE_LISTING', payload: { ...listing, status } });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-black text-on-surface text-xl">Marketplace — Annonces immobilières</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">{listings.filter(l => l.status === 'publié').length} publiées · {listings.length} total</p>
        </div>
        <div className="flex gap-3">
          <a href="/#/marketplace" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container transition-colors">
            <Icon name="open_in_new" size={15} /> Voir la marketplace
          </a>
          <button onClick={() => { setEditTarget(null); setModal('add'); }}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-primary text-on-primary rounded-xl hover:bg-primary/90 transition-colors">
            <Icon name="add_circle" size={16} /> Nouvelle annonce
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Publiées',   value: listings.filter(l => l.status === 'publié').length,   cls: 'bg-green-100 text-green-700' },
          { label: 'Brouillons', value: listings.filter(l => l.status === 'brouillon').length, cls: 'bg-surface-container text-on-surface-variant' },
          { label: 'Suspendues', value: listings.filter(l => l.status === 'suspendu').length,  cls: 'bg-amber-100 text-amber-700' },
          { label: 'Vendus',     value: listings.filter(l => l.status === 'vendu').length,     cls: 'bg-red-100 text-red-700' },
          { label: 'Loués',      value: listings.filter(l => l.status === 'loué').length,      cls: 'bg-blue-100 text-blue-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-4 py-3 flex items-center justify-between ${s.cls}`}>
            <span className="text-sm font-semibold">{s.label}</span>
            <span className="text-2xl font-black">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-outline-variant rounded-xl bg-surface-container-lowest focus:outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all','publié','brouillon','suspendu','vendu','loué'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
              {s === 'all' ? 'Tous' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-on-surface-variant">{filtered.length} annonce(s)</span>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-primary text-on-primary">
              <tr>
                {['Photo','Annonce','Type / Zone','Prix','Statut','Stats','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-on-surface-variant">
                  <Icon name="store" size={40} className="opacity-30 mx-auto mb-2" />
                  <p>Aucune annonce — cliquez sur "Nouvelle annonce" pour commencer</p>
                </td></tr>
              )}
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-surface-container-low transition-colors group">
                  {/* Thumb */}
                  <td className="px-4 py-3">
                    {l.images?.[0]
                      ? <img src={l.images[0]} alt="" className="w-14 h-10 object-cover rounded-lg border border-outline-variant/20" />
                      : <div className="w-14 h-10 rounded-lg bg-surface-container flex items-center justify-center">
                          <Icon name="image" size={16} className="text-outline-variant" />
                        </div>
                    }
                  </td>
                  {/* Title */}
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="font-semibold text-sm text-on-surface truncate">{l.title}</p>
                    <p className="text-xs text-on-surface-variant capitalize">{l.transaction}</p>
                    {l.featured && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">★ Vedette</span>}
                  </td>
                  {/* Type / Zone */}
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-on-surface">{TYPE_LABELS[l.type] || l.type}</p>
                    <p className="text-xs text-on-surface-variant flex items-center gap-0.5">
                      <Icon name="location_on" size={10} />{l.zone}{l.city ? `, ${l.city}` : ''}
                    </p>
                  </td>
                  {/* Price */}
                  <td className="px-4 py-3 font-bold text-primary text-sm whitespace-nowrap">
                    {fmt(l.price)}{l.pricePeriod && l.transaction === 'location' ? `/${l.pricePeriod}` : ''}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <select value={l.status}
                      onChange={e => quickStatus(l, e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 ${STATUS_COLORS[l.status] || ''}`}>
                      {['brouillon','publié','suspendu','vendu','loué'].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  {/* Stats */}
                  <td className="px-4 py-3 text-xs text-on-surface-variant">
                    <div className="flex gap-3">
                      <span className="flex items-center gap-0.5"><Icon name="visibility" size={11} />{l.views || 0}</span>
                      <span className="flex items-center gap-0.5"><Icon name="thumb_up" size={11} />{l.reactions || 0}</span>
                      <span className="flex items-center gap-0.5"><Icon name="photo_library" size={11} />{l.images?.length || 0}</span>
                    </div>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditTarget(l); setModal('edit'); }}
                        className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="Modifier">
                        <Icon name="edit" size={14} />
                      </button>
                      <button onClick={() => quickStatus(l, l.status === 'publié' ? 'suspendu' : 'publié')}
                        className={`p-1.5 rounded-lg transition-colors ${l.status === 'publié' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                        title={l.status === 'publié' ? 'Suspendre' : 'Publier'}>
                        <Icon name={l.status === 'publié' ? 'pause_circle' : 'play_circle'} size={14} />
                      </button>
                      <button onClick={() => setDeleteConfirm(l)}
                        className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors" title="Supprimer">
                        <Icon name="delete" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Listing form modal */}
      {(modal === 'add' || modal === 'edit') && (
        <ListingFormModal
          initial={modal === 'edit' ? editTarget : null}
          onSave={handleSave}
          onClose={() => { setModal(null); setEditTarget(null); }}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
              <Icon name="delete" size={24} className="text-red-700" />
            </div>
            <h3 className="font-bold text-on-surface text-lg mb-2">Supprimer cette annonce ?</h3>
            <p className="text-sm text-on-surface-variant mb-5">
              <strong>{deleteConfirm.title}</strong> — {deleteConfirm.zone}<br />
              <span className="text-xs">Cette action est irréversible. Les images ne seront pas supprimées du stockage.</span>
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 font-semibold text-sm text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high">
                Annuler
              </button>
              <button onClick={confirmDelete}
                className="flex-1 py-2.5 font-bold text-sm text-white bg-red-600 rounded-xl hover:bg-red-700 flex items-center justify-center gap-2">
                <Icon name="delete" size={14} /> Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
