import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Icon from '../components/Icon';
import SearchSelect from '../components/SearchSelect';
import { openEDLReport, openSynthesisReport } from '../lib/inspectionReport';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'ENTREE', label: 'Entrée / Hall' },
  { id: 'SALON', label: 'Salon / Séjour' },
  { id: 'CUISINE', label: 'Cuisine' },
  { id: 'CHAMBRE', label: 'Chambre(s)' },
  { id: 'BAIN', label: 'Salle de bain / WC' },
  { id: 'EXTERIEUR', label: 'Extérieur / Garage' },
  { id: 'AUTRE', label: 'Autre' },
];

const CONDITIONS = [
  { id: 'NEUF', label: 'Neuf', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { id: 'BON', label: 'Bon', cls: 'bg-green-100 text-green-800 border-green-300' },
  { id: 'USAGE', label: 'Usé', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  { id: 'MAUVAIS', label: 'Mauvais', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  { id: 'HS', label: 'Hors service', cls: 'bg-red-100 text-red-800 border-red-300' },
];

const SEVERITIES = [
  { id: 'MINOR', label: 'Mineur', cls: 'bg-amber-100 text-amber-800' },
  { id: 'MODERATE', label: 'Modéré', cls: 'bg-orange-100 text-orange-800' },
  { id: 'MAJOR', label: 'Majeur', cls: 'bg-red-100 text-red-800' },
];

const STATUS_CFG = {
  DRAFT:           { label: 'Brouillon',           cls: 'bg-slate-100 text-slate-700',   icon: 'edit_note' },
  IN_PROGRESS:     { label: 'En cours',             cls: 'bg-blue-100 text-blue-800',     icon: 'pending_actions' },
  PENDING_SIGNATURE: { label: 'Att. signature',     cls: 'bg-amber-100 text-amber-800',   icon: 'draw' },
  COMPLETED:       { label: 'Complété',             cls: 'bg-green-100 text-green-800',   icon: 'task_alt' },
};

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';
const fmtMoney = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

// ─── Signature pad ─────────────────────────────────────────────────────────
function SignaturePad({ onSave, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  const pt = (e, cvs) => {
    const r = cvs.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - r.left) * (cvs.width / r.width),
      y: (src.clientY - r.top) * (cvs.height / r.height),
    };
  };

  const down = (e) => { e.preventDefault(); drawing.current = true; last.current = pt(e, canvasRef.current); };
  const move = (e) => {
    e.preventDefault();
    if (!drawing.current) return;
    const cvs = canvasRef.current;
    const ctx = cvs.getContext('2d');
    const p = pt(e, cvs);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; };

  const clear = () => {
    const cvs = canvasRef.current;
    cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height);
  };

  const save = () => {
    const cvs = canvasRef.current;
    const px = cvs.getContext('2d').getImageData(0, 0, cvs.width, cvs.height).data;
    if (!px.some((v, i) => i % 4 === 3 && v > 0)) {
      alert('Veuillez signer avant de valider.');
      return;
    }
    onSave(cvs.toDataURL('image/png'));
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-on-surface-variant">
        Signez dans la zone ci-dessous avec votre doigt ou votre souris
      </p>
      <div className="border-2 border-dashed border-outline-variant rounded-2xl bg-white overflow-hidden shadow-inner">
        <canvas
          ref={canvasRef}
          width={560}
          height={200}
          className="w-full touch-none cursor-crosshair"
          onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
          onTouchStart={down} onTouchMove={move} onTouchEnd={up}
        />
      </div>
      <div className="flex gap-3 justify-end">
        <Button variant="ghost" icon="refresh" onClick={clear}>Effacer</Button>
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button icon="draw" onClick={save}>Valider la signature</Button>
      </div>
    </div>
  );
}

// ─── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, cls: 'bg-gray-100 text-gray-700', icon: 'help' };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-label-sm font-bold ${cfg.cls}`}>
      <span className="material-symbols-outlined text-[13px]">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

// ─── Condition badge ─────────────────────────────────────────────────────────
function CondBadge({ cond }) {
  const c = CONDITIONS.find(c => c.id === cond);
  if (!c) return null;
  return (
    <span className={`px-2 py-0.5 rounded-full text-label-sm font-bold border ${c.cls}`}>{c.label}</span>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function Inspections() {
  const { state, dispatch } = useApp();
  const inspections = state.inspections || [];
  const { properties = [], tenants = [], contracts = [], currentUser } = state;

  // ── Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Tous');
  const [typeFilter, setTypeFilter] = useState('Tous');

  // ── Group-by toggle
  const [groupBy, setGroupBy] = useState('none');

  // ── Modals / views
  const [createModal, setCreateModal] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailTab, setDetailTab] = useState('inventaire');
  const [itemModal, setItemModal] = useState(false);
  const [damageModal, setDamageModal] = useState(false);
  const [signModal, setSignModal] = useState(null); // 'manager' | 'tenant'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [viewPhoto, setViewPhoto] = useState(null); // { data, name }

  // ── Photo capture
  const photoInputRef = useRef(null);
  const photoTargetItem = useRef(null);

  const triggerPhoto = (itemId) => {
    photoTargetItem.current = itemId;
    photoInputRef.current?.click();
  };

  const handlePhotoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file || !photoTargetItem.current || !detail) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const photo = { id: Date.now(), data: ev.target.result, name: file.name, takenAt: new Date().toISOString() };
      const items = detail.items.map(i =>
        i.id === photoTargetItem.current ? { ...i, photos: [...(i.photos || []), photo] } : i
      );
      update({ ...detail, items });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDeletePhoto = (itemId, photoId) => {
    const items = detail.items.map(i =>
      i.id === itemId ? { ...i, photos: (i.photos || []).filter(p => p.id !== photoId) } : i
    );
    update({ ...detail, items });
  };

  // ── All property/unit options (same pattern as Rental)
  const allPropertyOptions = useMemo(() => {
    const opts = [];
    properties.forEach(p => {
      if (p.isBuilding) {
        (p.units || []).forEach(u => {
          opts.push({ label: `${p.name} — ${u.number} (${u.floor})`, value: `${p.id}::${u.id}`, buildingId: p.id, buildingName: p.name, unitNumber: u.number, unitId: u.id });
        });
      } else {
        opts.push({ label: p.name, value: `${p.id}::`, buildingId: p.id, buildingName: p.name, unitNumber: '', unitId: '' });
      }
    });
    return opts;
  }, [properties]);

  // ── Forms
  const blankForm = { type: 'ENTRY', propertyKey: '', propertyId: '', propertyName: '', unitRef: '', tenantId: '', scheduledDate: '', notes: '' };
  const [form, setForm] = useState(blankForm);
  const blankItem = { category: 'SALON', label: '', condition: 'BON', notes: '', price: '' };
  const [itemForm, setItemForm] = useState(blankItem);
  const blankDmg = { itemLabel: '', description: '', severity: 'MINOR', cost: '' };
  const [dmgForm, setDmgForm] = useState(blankDmg);

  // Keep detail in sync with store
  useEffect(() => {
    if (!detail) return;
    const fresh = inspections.find(i => i.id === detail.id);
    if (fresh) setDetail(fresh);
  }, [inspections]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stats
  const stats = useMemo(() => [
    { label: 'Total', value: inspections.length, icon: 'home_work', color: 'bg-primary/10 text-primary' },
    { label: 'En cours', value: inspections.filter(i => ['DRAFT','IN_PROGRESS'].includes(i.status)).length, icon: 'pending_actions', color: 'bg-blue-100 text-blue-700' },
    { label: 'Att. signature', value: inspections.filter(i => i.status === 'PENDING_SIGNATURE').length, icon: 'draw', color: 'bg-amber-100 text-amber-700' },
    { label: 'Complétés', value: inspections.filter(i => i.status === 'COMPLETED').length, icon: 'task_alt', color: 'bg-green-100 text-green-700' },
  ], [inspections]);

  // ── Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return inspections.filter(insp => {
      const mStatus = statusFilter === 'Tous' || insp.status === statusFilter;
      const mType = typeFilter === 'Tous' || insp.type === typeFilter;
      const mSearch = !q
        || (insp.propertyName || '').toLowerCase().includes(q)
        || (insp.tenantName || '').toLowerCase().includes(q)
        || (insp.ref || '').toLowerCase().includes(q);
      return mStatus && mType && mSearch;
    });
  }, [inspections, statusFilter, typeFilter, search]);

  // ── Handlers
  const update = (updated) => {
    dispatch({ type: 'UPDATE_INSPECTION', payload: updated });
    setDetail(updated);
  };

  const handleCreate = () => {
    if (!form.propertyId || !form.tenantId || !form.scheduledDate) return;
    const tenant = tenants.find(t => String(t.id) === String(form.tenantId));
    const payload = {
      id: Date.now(),
      ref: `EDL-${String(inspections.length + 1).padStart(3, '0')}`,
      type: form.type,
      status: 'DRAFT',
      propertyId: form.propertyId,
      propertyName: form.propertyName,
      unitRef: form.unitRef,
      tenantId: tenant?.id,
      tenantName: tenant?.name,
      scheduledDate: form.scheduledDate,
      completedDate: null,
      managerId: currentUser?.id,
      managerName: currentUser?.name,
      managerSignature: null,
      tenantSignature: null,
      entryInspectionId: null,
      items: [],
      damages: [],
      notes: form.notes,
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_INSPECTION', payload });
    setCreateModal(false);
    setForm(blankForm);
  };

  const handleAddItem = () => {
    if (!itemForm.label.trim()) return;
    const item = { id: Date.now(), ...itemForm };
    update({ ...detail, items: [...(detail.items || []), item] });
    setItemModal(false);
    setItemForm(blankItem);
  };

  const handleConditionChange = (itemId, condition) => {
    update({ ...detail, items: detail.items.map(i => i.id === itemId ? { ...i, condition } : i) });
  };

  const handleDeleteItem = (itemId) => {
    update({ ...detail, items: detail.items.filter(i => i.id !== itemId) });
  };

  const handleAddDamage = () => {
    if (!dmgForm.description.trim()) return;
    const damage = { id: Date.now(), ...dmgForm, cost: Number(dmgForm.cost) || 0 };
    update({ ...detail, damages: [...(detail.damages || []), damage] });
    setDamageModal(false);
    setDmgForm(blankDmg);
  };

  const handleDeleteDamage = (id) => {
    update({ ...detail, damages: detail.damages.filter(d => d.id !== id) });
  };

  const handleSign = (type, dataURL) => {
    const sig = { data: dataURL, signedAt: new Date().toISOString(), signerName: type === 'manager' ? currentUser?.name : detail?.tenantName };
    const key = type === 'manager' ? 'managerSignature' : 'tenantSignature';
    const patched = { ...detail, [key]: sig };
    let status = patched.status;
    if (patched.managerSignature && !patched.tenantSignature) status = 'PENDING_SIGNATURE';
    if (patched.managerSignature && patched.tenantSignature) {
      status = 'COMPLETED';
      patched.completedDate = new Date().toLocaleDateString('fr-FR');
    }
    update({ ...patched, status });
    setSignModal(null);
  };

  const advanceStatus = () => {
    const ORDER = ['DRAFT', 'IN_PROGRESS', 'PENDING_SIGNATURE', 'COMPLETED'];
    const idx = ORDER.indexOf(detail.status);
    if (idx >= ORDER.length - 1) return;
    update({ ...detail, status: ORDER[idx + 1] });
  };

  const handleDelete = (id) => {
    dispatch({ type: 'DELETE_INSPECTION', payload: id });
    setDeleteConfirm(null);
    if (detail?.id === id) setDetail(null);
  };

  const generatePDF = useCallback((insp) => { openEDLReport(insp); }, []);

  // ── Inspections grouped by tenant or property
  const groups = useMemo(() => {
    if (groupBy === 'none') return null;
    const g = {};
    filtered.forEach(insp => {
      const key = groupBy === 'tenant' ? (insp.tenantName || '—') : (insp.propertyName || '—');
      if (!g[key]) g[key] = [];
      g[key].push(insp);
    });
    return Object.fromEntries(Object.entries(g).sort(([a], [b]) => a.localeCompare(b, 'fr')));
  }, [filtered, groupBy]);

  // ── Card renderer (shared between flat and grouped views)
  const renderInspCard = (insp) => {
    const isEntry = insp.type === 'ENTRY';
    const totalDmg = (insp.damages || []).reduce((s, d) => s + (d.cost || 0), 0);
    return (
      <div
        key={insp.id}
        onClick={() => { setDetail(insp); setDetailTab('inventaire'); }}
        className="bg-surface-container-lowest rounded-2xl shadow-card border border-outline-variant/20 p-md cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all group"
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full ${isEntry ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error'}`}>
                {isEntry ? 'Entrée' : 'Sortie'}
              </span>
              <StatusBadge status={insp.status} />
            </div>
            <p className="font-bold text-on-surface text-label-md">{insp.ref}</p>
          </div>
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-all">
            <button
              onClick={e => { e.stopPropagation(); generatePDF(insp); }}
              className="w-8 h-8 rounded-full hover:bg-primary/10 text-on-surface-variant hover:text-primary flex items-center justify-center transition-all"
              title="Télécharger PDF"
            >
              <Icon name="picture_as_pdf" size={16} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); setDeleteConfirm(insp.id); }}
              className="w-8 h-8 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error flex items-center justify-center transition-all"
              title="Supprimer"
            >
              <Icon name="delete" size={16} />
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <Icon name="apartment" size={15} />
            <span className="truncate">{insp.propertyName || '—'} {insp.unitRef ? `• ${insp.unitRef}` : ''}</span>
          </div>
          <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <Icon name="person" size={15} />
            <span>{insp.tenantName || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
            <Icon name="calendar_today" size={15} />
            <span>{insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString('fr-FR') : '—'}</span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-outline-variant/20 flex items-center justify-between">
          <span className="text-label-sm text-on-surface-variant">{(insp.items || []).length} éléments</span>
          {totalDmg > 0 && (
            <span className="text-label-sm font-bold text-error">{fmtMoney(totalDmg)} dommages</span>
          )}
          {totalDmg === 0 && (insp.damages || []).length === 0 && insp.status === 'COMPLETED' && (
            <span className="text-label-sm text-green-700 font-bold flex items-center gap-1">
              <Icon name="check_circle" size={14} /> Signé
            </span>
          )}
        </div>
      </div>
    );
  };

  // ── Items grouped by category
  const itemsByCategory = useMemo(() => {
    if (!detail) return {};
    return (detail.items || []).reduce((acc, item) => {
      const k = item.category;
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    }, {});
  }, [detail]);

  const totalDamageCost = useMemo(() =>
    (detail?.damages || []).reduce((s, d) => s + (d.cost || 0), 0), [detail]);

  const isAdmin = ['ORGANIZATION_ADMIN', 'AGENT', 'ADMIN', 'MANAGER', 'CONCIERGE'].includes(currentUser?.role);

  // For EXIT inspections in detail view — find matching ENTRY for synthesis
  const matchingEntry = useMemo(() => {
    if (!detail || detail.type !== 'EXIT') return null;
    return inspections.find(i =>
      i.type === 'ENTRY' &&
      (i.tenantId === detail.tenantId || (i.tenantName && i.tenantName === detail.tenantName)) &&
      (i.propertyId === detail.propertyId || (i.propertyName && i.propertyName === detail.propertyName))
    ) || null;
  }, [detail, inspections]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        {stats.map(s => (
          <div key={s.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex items-center gap-md">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${s.color}`}>
              <Icon name={s.icon} size={22} />
            </div>
            <div>
              <p className="text-on-surface-variant text-label-sm font-label-sm uppercase tracking-wider">{s.label}</p>
              <p className="font-h2 text-h2 text-on-surface font-bold">{s.value}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Toolbar */}
      <div className="bg-surface-container-lowest rounded-xl p-sm shadow-card border border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center gap-md">
        <div className="relative w-full sm:w-80">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
          <input
            type="text"
            placeholder="Référence, propriété, locataire..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-md py-xs border border-outline-variant rounded-lg bg-surface-container-low text-body-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex flex-wrap gap-xs flex-1">
          {['Tous', 'DRAFT', 'IN_PROGRESS', 'PENDING_SIGNATURE', 'COMPLETED'].map(s => {
            const lbl = s === 'Tous' ? 'Tous' : (STATUS_CFG[s]?.label || s);
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}`}
              >{lbl}</button>
            );
          })}
          <div className="w-px h-5 bg-outline-variant/40 mx-1 hidden sm:block" />
          {['Tous', 'ENTRY', 'EXIT'].map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${typeFilter === t ? 'bg-secondary text-on-secondary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}`}
            >{t === 'Tous' ? 'Tous types' : t === 'ENTRY' ? 'Entrée' : 'Sortie'}</button>
          ))}
          <div className="w-px h-5 bg-outline-variant/40 mx-1 hidden sm:block" />
          {[['none', 'Toutes', 'grid_view'], ['tenant', 'Par locataire', 'person'], ['property', 'Par bien', 'apartment']].map(([val, lbl, ico]) => (
            <button
              key={val}
              onClick={() => setGroupBy(val)}
              className={`flex items-center gap-1 px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${groupBy === val ? 'bg-tertiary/80 text-white' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined text-[14px]">{ico}</span>
              {lbl}
            </button>
          ))}
        </div>
        {isAdmin && (
          <Button icon="add_circle" onClick={() => setCreateModal(true)} className="ml-auto flex-shrink-0">
            Nouvel état des lieux
          </Button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-xl text-on-surface-variant">
          <Icon name="home_work" size={48} className="mb-md opacity-40" />
          <p className="font-bold text-on-surface mb-1">Aucun état des lieux</p>
          <p className="text-body-sm">Créez votre premier état des lieux pour commencer</p>
        </div>
      )}

      {/* Inspection cards — flat or grouped */}
      {groupBy === 'none' ? (
        <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(renderInspCard)}
        </div>
      ) : (
        <div className="flex flex-col gap-lg">
          {Object.entries(groups || {}).map(([groupKey, items]) => {
            const entryInsp = items.find(i => i.type === 'ENTRY');
            const exitInsp  = items.find(i => i.type === 'EXIT');
            const canSynth  = !!(entryInsp && exitInsp);
            return (
              <div key={groupKey}>
                <div className="flex items-center justify-between mb-sm px-xs">
                  <div className="flex items-center gap-sm">
                    <Icon name={groupBy === 'tenant' ? 'person' : 'apartment'} size={18} className="text-primary" />
                    <h3 className="font-h3 text-h3 text-on-surface">{groupKey}</h3>
                    <span className="text-label-sm text-on-surface-variant bg-surface-container px-sm py-0.5 rounded-full">{items.length} EDL</span>
                  </div>
                  {canSynth && (
                    <button
                      onClick={() => openSynthesisReport(entryInsp, exitInsp)}
                      className="flex items-center gap-1.5 px-sm py-xs rounded-lg bg-primary/10 text-primary text-label-sm font-label-sm hover:bg-primary/20 transition-colors"
                    >
                      <Icon name="compare_arrows" size={16} />
                      Rapport de synthèse
                    </button>
                  )}
                </div>
                <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(renderInspCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      <Modal
        open={createModal}
        onClose={() => { setCreateModal(false); setForm(blankForm); }}
        title="Nouvel état des lieux"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setCreateModal(false); setForm(blankForm); }}>Annuler</Button>
            <Button icon="add" onClick={handleCreate} disabled={!form.propertyId || !form.tenantId || !form.scheduledDate}>
              Créer
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          {/* Type */}
          <div>
            <label className="text-label-sm text-on-surface-variant mb-2 block font-bold">Type d'état des lieux</label>
            <div className="grid grid-cols-2 gap-3">
              {[{ id: 'ENTRY', label: "Entrée", icon: 'login', sub: 'Début de bail' }, { id: 'EXIT', label: "Sortie", icon: 'logout', sub: 'Fin de bail' }].map(t => (
                <button
                  key={t.id}
                  onClick={() => setForm(f => ({ ...f, type: t.id }))}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${form.type === t.id ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-primary/40'}`}
                >
                  <Icon name={t.icon} size={24} className={form.type === t.id ? 'text-primary' : 'text-on-surface-variant'} />
                  <span className="font-bold text-label-md">{t.label}</span>
                  <span className="text-body-sm text-on-surface-variant">{t.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Property/Unit unified dropdown */}
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Référence logement / appartement *</label>
            <SearchSelect
              value={form.propertyKey}
              onChange={v => {
                const opt = allPropertyOptions.find(o => o.value === v);
                if (!opt) { setForm(f => ({ ...f, propertyKey: '', propertyId: '', propertyName: '', unitRef: '' })); return; }
                const norm = s => (s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                const linked = tenants.find(t => norm(t.property) === norm(opt.label));
                setForm(f => ({
                  ...f,
                  propertyKey: opt.value,
                  propertyId: String(opt.buildingId),
                  propertyName: opt.label,
                  unitRef: opt.unitNumber || '',
                  ...(linked ? { tenantId: String(linked.id) } : {}),
                }));
              }}
              options={allPropertyOptions.map(o => ({ value: o.value, label: o.label }))}
              placeholder="— Rechercher un logement —"
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary pr-8"
            />
            {form.propertyKey && form.tenantId && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">person_check</span>
                Locataire auto-détecté
              </p>
            )}
          </div>

          {/* Tenant */}
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Locataire *</label>
            <SearchSelect
              value={form.tenantId}
              onChange={v => {
                const tenant = tenants.find(t => String(t.id) === v);
                if (tenant?.property) {
                  const opt = allPropertyOptions.find(o => o.label === tenant.property);
                  if (opt) {
                    setForm(f => ({
                      ...f,
                      tenantId: v,
                      propertyKey: opt.value,
                      propertyId: String(opt.buildingId),
                      propertyName: opt.label,
                      unitRef: opt.unitNumber || '',
                    }));
                    return;
                  }
                }
                setForm(f => ({ ...f, tenantId: v }));
              }}
              options={tenants.map(t => ({ value: String(t.id), label: t.name + (t.property ? ` — ${t.property}` : '') }))}
              placeholder="— Rechercher un locataire —"
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary pr-8"
            />
            {form.tenantId && form.propertyKey && (
              <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">apartment</span>
                Logement auto-détecté : {form.propertyName}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Date prévue *</label>
            <input
              type="date"
              value={form.scheduledDate}
              onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Observations générales</label>
            <textarea
              rows={3}
              placeholder="Notes générales sur l'inspection..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* ── DELETE CONFIRM ── */}
      <Modal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Supprimer l'état des lieux"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Annuler</Button>
            <Button variant="danger" icon="delete" onClick={() => handleDelete(deleteConfirm)}>Supprimer</Button>
          </>
        }
      >
        <p className="text-body-md text-on-surface-variant">Cette action est irréversible. Toutes les données (éléments, dommages, signatures) seront perdues.</p>
      </Modal>

      {/* ── DETAIL MODAL ── */}
      {detail && (
        <Modal
          open={!!detail}
          onClose={() => setDetail(null)}
          title=""
          size="lg"
        >
          {/* Detail header */}
          <div className="-mx-lg -mt-md mb-0 px-lg py-md bg-gradient-to-r from-primary/5 to-tertiary/5 border-b border-outline-variant/20 rounded-t-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-label-sm font-bold px-2.5 py-0.5 rounded-full ${detail.type === 'ENTRY' ? 'bg-tertiary/15 text-tertiary' : 'bg-error/15 text-error'}`}>
                    {detail.type === 'ENTRY' ? '→ Entrée' : '← Sortie'}
                  </span>
                  <StatusBadge status={detail.status} />
                </div>
                <h2 className="font-h2 text-h2 font-black text-on-surface">{detail.ref}</h2>
                <p className="text-body-sm text-on-surface-variant">
                  {detail.propertyName} {detail.unitRef ? `• ${detail.unitRef}` : ''} — {detail.tenantName}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" icon="picture_as_pdf" onClick={() => generatePDF(detail)}>
                  PDF
                </Button>
                {matchingEntry && (
                  <Button size="sm" icon="compare_arrows" onClick={() => openSynthesisReport(matchingEntry, detail)}>
                    Synthèse
                  </Button>
                )}
                {isAdmin && detail.status !== 'COMPLETED' && (
                  <>
                    {detail.status !== 'PENDING_SIGNATURE' && (
                      <Button size="sm" variant="secondary" icon="arrow_forward" onClick={advanceStatus}>
                        {detail.status === 'DRAFT' ? 'Démarrer' : 'Avancer'}
                      </Button>
                    )}
                    {detail.status === 'IN_PROGRESS' && !detail.managerSignature && (
                      <Button size="sm" icon="draw" onClick={() => setSignModal('manager')}>Ma signature</Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mt-4 bg-surface-container/60 rounded-xl p-1 w-fit">
              {[
                { id: 'inventaire', label: 'Inventaire', icon: 'checklist' },
                { id: 'dommages', label: 'Dommages', icon: 'warning' },
                { id: 'signatures', label: 'Signatures', icon: 'draw' },
                { id: 'resume', label: 'Résumé', icon: 'summarize' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label-sm font-bold transition-all ${detailTab === tab.id ? 'bg-surface-container-lowest shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  <Icon name={tab.icon} size={16} />
                  {tab.label}
                  {tab.id === 'dommages' && (detail.damages || []).length > 0 && (
                    <span className="w-4 h-4 bg-error text-on-error rounded-full text-[10px] flex items-center justify-center">
                      {(detail.damages || []).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-md">
            {/* ── INVENTAIRE TAB ── */}
            {detailTab === 'inventaire' && (
              <div className="flex flex-col gap-md">
                {isAdmin && (
                  <div className="flex justify-end">
                    <Button size="sm" icon="add" variant="secondary" onClick={() => { setItemForm(blankItem); setItemModal(true); }}>
                      Ajouter un élément
                    </Button>
                  </div>
                )}

                {(detail.items || []).length === 0 ? (
                  <div className="text-center py-lg text-on-surface-variant">
                    <Icon name="checklist" size={40} className="opacity-30 mb-2" />
                    <p className="font-bold">Aucun élément inventorié</p>
                    <p className="text-body-sm">Ajoutez des éléments pour constituer l'inventaire</p>
                  </div>
                ) : (
                  CATEGORIES.map(cat => {
                    const items = itemsByCategory[cat.id] || [];
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.id}>
                        <h3 className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2 flex items-center gap-2">
                          <span className="w-6 h-px bg-outline-variant flex-1" />
                          {cat.label}
                          <span className="w-6 h-px bg-outline-variant flex-1" />
                        </h3>
                        <div className="space-y-2">
                          {items.map(item => (
                            <div key={item.id} className="bg-surface-container rounded-xl p-3">
                              <div className="flex items-start gap-3">
                                <div className="flex-1">
                                  <p className="font-bold text-on-surface text-label-md">{item.label}</p>
                                  {item.price > 0 && <p className="text-body-sm text-primary font-semibold mt-0.5">{fmtMoney(item.price)}</p>}
                                  {item.notes && <p className="text-body-sm text-on-surface-variant mt-0.5">{item.notes}</p>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {isAdmin ? (
                                    <select
                                      value={item.condition}
                                      onChange={e => handleConditionChange(item.id, e.target.value)}
                                      className="border border-outline-variant rounded-lg px-2 py-1 text-label-sm bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                      {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                  ) : (
                                    <CondBadge cond={item.condition} />
                                  )}
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleDeleteItem(item.id)}
                                      className="w-7 h-7 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error flex items-center justify-center transition-colors"
                                    >
                                      <Icon name="close" size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Photos */}
                              {(item.photos || []).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(item.photos || []).map(photo => (
                                    <div key={photo.id} className="relative group/photo">
                                      <img
                                        src={photo.data}
                                        alt={photo.name}
                                        onClick={() => setViewPhoto(photo)}
                                        className="w-20 h-16 object-cover rounded-lg border border-outline-variant cursor-pointer hover:opacity-90 transition-opacity"
                                      />
                                      {isAdmin && (
                                        <button
                                          onClick={() => handleDeletePhoto(item.id, photo.id)}
                                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error text-on-error rounded-full text-[11px] font-bold flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity shadow-sm"
                                        >×</button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => triggerPhoto(item.id)}
                                  className="mt-2 flex items-center gap-1.5 text-label-sm text-primary hover:text-primary/70 transition-colors"
                                >
                                  <Icon name="add_a_photo" size={15} />
                                  Ajouter une photo
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── DOMMAGES TAB ── */}
            {detailTab === 'dommages' && (
              <div className="flex flex-col gap-md">
                {isAdmin && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-label-sm text-on-surface-variant">Total des dommages estimés</p>
                      <p className="font-h2 text-h2 font-black text-error">{fmtMoney(totalDamageCost)}</p>
                    </div>
                    <Button size="sm" icon="add" variant="secondary" onClick={() => { setDmgForm(blankDmg); setDamageModal(true); }}>
                      Signaler un dommage
                    </Button>
                  </div>
                )}

                {(detail.damages || []).length === 0 ? (
                  <div className="text-center py-lg text-on-surface-variant">
                    <Icon name="sentiment_satisfied" size={40} className="opacity-30 mb-2" />
                    <p className="font-bold">Aucun dommage signalé</p>
                    <p className="text-body-sm">Le logement est en bon état</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {detail.damages.map(d => {
                      const sev = SEVERITIES.find(s => s.id === d.severity);
                      return (
                        <div key={d.id} className="bg-surface-container rounded-xl p-md flex items-start gap-3">
                          <div className={`w-2 h-full min-h-10 rounded-full flex-shrink-0 ${d.severity === 'MAJOR' ? 'bg-red-500' : d.severity === 'MODERATE' ? 'bg-orange-500' : 'bg-amber-400'}`} />
                          <div className="flex-1">
                            {d.itemLabel && <p className="text-label-sm text-on-surface-variant">{d.itemLabel}</p>}
                            <p className="font-bold text-on-surface">{d.description}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full ${sev?.cls}`}>{sev?.label}</span>
                              {d.cost > 0 && <span className="text-label-sm font-bold text-error">{fmtMoney(d.cost)}</span>}
                            </div>
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteDamage(d.id)}
                              className="w-7 h-7 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error flex items-center justify-center transition-colors"
                            >
                              <Icon name="close" size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── SIGNATURES TAB ── */}
            {detailTab === 'signatures' && (
              <div className="flex flex-col gap-md">
                {/* Manager signature */}
                <div className="bg-surface-container rounded-2xl p-md">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-bold text-on-surface">Signature gestionnaire</p>
                      <p className="text-body-sm text-on-surface-variant">{detail.managerName || 'Gestionnaire'}</p>
                    </div>
                    {detail.managerSignature ? (
                      <span className="flex items-center gap-1.5 text-green-700 text-label-sm font-bold">
                        <Icon name="verified" size={18} className="text-green-600" />
                        Signé le {fmtDate(detail.managerSignature.signedAt)}
                      </span>
                    ) : isAdmin ? (
                      <Button size="sm" icon="draw" onClick={() => setSignModal('manager')}>Signer</Button>
                    ) : (
                      <span className="text-label-sm text-on-surface-variant">En attente</span>
                    )}
                  </div>
                  {detail.managerSignature && (
                    <div className="border border-outline-variant/30 rounded-xl overflow-hidden bg-white">
                      <img src={detail.managerSignature.data} alt="Signature gestionnaire" className="max-h-24 mx-auto" />
                    </div>
                  )}
                </div>

                {/* Tenant signature */}
                <div className="bg-surface-container rounded-2xl p-md">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-bold text-on-surface">Signature locataire</p>
                      <p className="text-body-sm text-on-surface-variant">{detail.tenantName}</p>
                    </div>
                    {detail.tenantSignature ? (
                      <span className="flex items-center gap-1.5 text-green-700 text-label-sm font-bold">
                        <Icon name="verified" size={18} className="text-green-600" />
                        Signé le {fmtDate(detail.tenantSignature.signedAt)}
                      </span>
                    ) : detail.status === 'PENDING_SIGNATURE' ? (
                      <Button size="sm" icon="draw" variant="secondary" onClick={() => setSignModal('tenant')}>
                        Signer (locataire)
                      </Button>
                    ) : (
                      <span className="text-label-sm text-on-surface-variant">
                        {detail.managerSignature ? 'En attente' : 'Après signature gestionnaire'}
                      </span>
                    )}
                  </div>
                  {detail.tenantSignature && (
                    <div className="border border-outline-variant/30 rounded-xl overflow-hidden bg-white">
                      <img src={detail.tenantSignature.data} alt="Signature locataire" className="max-h-24 mx-auto" />
                    </div>
                  )}
                </div>

                {detail.status === 'COMPLETED' && (
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-md flex items-center gap-3">
                    <Icon name="task_alt" size={28} className="text-green-600" />
                    <div>
                      <p className="font-bold text-green-800">État des lieux complété</p>
                      <p className="text-body-sm text-green-700">Document signé par les deux parties le {detail.completedDate}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── RÉSUMÉ TAB ── */}
            {detailTab === 'resume' && (
              <div className="flex flex-col gap-md">
                <div className="grid grid-cols-2 gap-md">
                  {[
                    { label: 'Référence', value: detail.ref },
                    { label: 'Type', value: detail.type === 'ENTRY' ? 'Entrée' : 'Sortie' },
                    { label: 'Propriété', value: detail.propertyName },
                    { label: 'Logement', value: detail.unitRef || '—' },
                    { label: 'Locataire', value: detail.tenantName },
                    { label: 'Gestionnaire', value: detail.managerName },
                    { label: 'Date prévue', value: detail.scheduledDate ? new Date(detail.scheduledDate).toLocaleDateString('fr-FR') : '—' },
                    { label: 'Date complétée', value: detail.completedDate || '—' },
                    { label: 'Éléments inventoriés', value: (detail.items || []).length },
                    { label: 'Dommages signalés', value: (detail.damages || []).length },
                    { label: 'Coût total dommages', value: fmtMoney(totalDamageCost) },
                    { label: 'Statut', value: STATUS_CFG[detail.status]?.label || detail.status },
                  ].map(row => (
                    <div key={row.label} className="bg-surface-container rounded-xl p-3">
                      <p className="text-label-sm text-on-surface-variant">{row.label}</p>
                      <p className="font-bold text-on-surface mt-0.5">{row.value}</p>
                    </div>
                  ))}
                </div>
                {detail.notes && (
                  <div className="bg-surface-container rounded-xl p-md">
                    <p className="text-label-sm font-bold text-on-surface-variant mb-1">Observations générales</p>
                    <p className="text-body-sm text-on-surface">{detail.notes}</p>
                  </div>
                )}

                {/* Condition summary per category */}
                {(detail.items || []).length > 0 && (
                  <div>
                    <p className="text-label-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">Récapitulatif conditions</p>
                    <div className="space-y-2">
                      {CATEGORIES.map(cat => {
                        const items = itemsByCategory[cat.id] || [];
                        if (items.length === 0) return null;
                        return (
                          <div key={cat.id} className="flex items-center justify-between bg-surface-container rounded-xl px-md py-sm">
                            <span className="text-body-sm text-on-surface">{cat.label}</span>
                            <div className="flex gap-1 flex-wrap justify-end">
                              {items.map(item => <CondBadge key={item.id} cond={item.condition} />)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── ADD ITEM MODAL ── */}
      <Modal
        open={itemModal}
        onClose={() => { setItemModal(false); setItemForm(blankItem); }}
        title="Ajouter un élément"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setItemModal(false)}>Annuler</Button>
            <Button icon="add" onClick={handleAddItem} disabled={!itemForm.label.trim()}>Ajouter</Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Catégorie</label>
            <select
              value={itemForm.category}
              onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Désignation *</label>
            <input
              type="text"
              placeholder="Ex: Porte d'entrée, Fenêtre salon, Robinet cuisine..."
              value={itemForm.label}
              onChange={e => setItemForm(f => ({ ...f, label: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-2 block font-bold">État</label>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map(c => (
                <button
                  key={c.id}
                  onClick={() => setItemForm(f => ({ ...f, condition: c.id }))}
                  className={`px-3 py-1.5 rounded-full text-label-sm font-bold border-2 transition-all ${itemForm.condition === c.id ? c.cls + ' border-current' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/40'}`}
                >{c.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Valeur estimée (FCFA)</label>
            <input
              type="number"
              placeholder="Ex: 25000"
              value={itemForm.price}
              onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Observations</label>
            <textarea
              rows={2}
              placeholder="Précisions sur l'état..."
              value={itemForm.notes}
              onChange={e => setItemForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* ── ADD DAMAGE MODAL ── */}
      <Modal
        open={damageModal}
        onClose={() => { setDamageModal(false); setDmgForm(blankDmg); }}
        title="Signaler un dommage"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDamageModal(false)}>Annuler</Button>
            <Button variant="danger" icon="warning" onClick={handleAddDamage} disabled={!dmgForm.description.trim()}>
              Signaler
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Élément concerné</label>
            <input
              type="text"
              placeholder="Ex: Porte chambre, Carrelage cuisine..."
              value={dmgForm.itemLabel}
              onChange={e => setDmgForm(f => ({ ...f, itemLabel: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Description du dommage *</label>
            <textarea
              rows={3}
              placeholder="Décrivez le dommage constaté..."
              value={dmgForm.description}
              onChange={e => setDmgForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-2 block font-bold">Gravité</label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setDmgForm(f => ({ ...f, severity: s.id }))}
                  className={`flex-1 py-2 rounded-xl text-label-sm font-bold border-2 transition-all ${dmgForm.severity === s.id ? s.cls + ' border-current' : 'border-outline-variant/30 text-on-surface-variant hover:border-primary/40'}`}
                >{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block font-bold">Coût estimé de réparation (FCFA)</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              value={dmgForm.cost}
              onChange={e => setDmgForm(f => ({ ...f, cost: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-3 py-3 bg-surface-container text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </Modal>

      {/* ── SIGNATURE MODAL ── */}
      <Modal
        open={!!signModal}
        onClose={() => setSignModal(null)}
        title={signModal === 'manager' ? 'Signature du gestionnaire' : 'Signature du locataire'}
        size="md"
      >
        {signModal && (
          <SignaturePad
            onSave={(dataURL) => handleSign(signModal, dataURL)}
            onCancel={() => setSignModal(null)}
          />
        )}
      </Modal>

      {/* ── PHOTO VIEWER ── */}
      {viewPhoto && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            onClick={() => setViewPhoto(null)}
          >
            <Icon name="close" size={20} />
          </button>
          <img
            src={viewPhoto.data}
            alt={viewPhoto.name}
            className="max-w-full max-h-[85vh] rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Hidden file input for photo capture */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoFile}
      />
    </div>
  );
}
