import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const TABS = ['Contrats', 'Locataires', 'Propriétaires'];
const CONTRACT_STATUSES = ['Tous', 'Actif', 'Expirant', 'Brouillon', 'Résilié'];
const COLORS = ['bg-primary-container text-on-primary-container', 'bg-secondary-container text-on-secondary-container', 'bg-tertiary-container text-on-tertiary-container', 'bg-error-container text-on-error-container'];
const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

const STATUS_BADGE = {
  Actif:    'bg-green-100 text-green-800',
  Expirant: 'bg-amber-100 text-amber-800',
  Brouillon:'bg-surface-container text-on-surface-variant',
  Résilié:  'bg-error-container text-on-error-container',
  'En cours':'bg-amber-100 text-amber-800',
  Inactif:  'bg-surface-container text-on-surface-variant',
};

export default function Rental() {
  const { state, dispatch } = useApp();
  const { contracts, tenants, owners, properties } = state;

  const [tab, setTab] = useState('Contrats');
  const [cFilter, setCFilter] = useState('Tous');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [target, setTarget] = useState(null);
  const [step, setStep] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // ── Formulaires ────────────────────────────────────────────────────────────
  const [cForm, setCForm] = useState({});
  const [tForm, setTForm] = useState({});
  const [oForm, setOForm] = useState({});

  // Sélection du bien + unité dans le formulaire locataire
  const [selectedPropId, setSelectedPropId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  // Toutes les options de propriétés pour les dropdowns
  const allPropertyOptions = useMemo(() => {
    const opts = [];
    properties.forEach(p => {
      if (p.isBuilding) {
        (p.units || []).forEach(u => {
          opts.push({ label: `${p.name} — ${u.number} (${u.floor})`, value: `${p.id}::${u.id}`, rent: u.rent, buildingName: p.name, unitNumber: u.number, buildingId: p.id, unitId: u.id });
        });
      } else {
        opts.push({ label: p.name, value: `${p.id}::`, rent: p.rent, buildingName: p.name, unitNumber: '', buildingId: p.id, unitId: '' });
      }
    });
    return opts;
  }, [properties]);

  // ── Données filtrées ───────────────────────────────────────────────────────
  const q = search.toLowerCase();
  const filteredContracts = contracts.filter(c =>
    (cFilter === 'Tous' || c.status === cFilter) &&
    (c.tenant.toLowerCase().includes(q) || c.propertyName.toLowerCase().includes(q))
  );
  const filteredTenants = tenants.filter(t => t.name.toLowerCase().includes(q) || (t.property || '').toLowerCase().includes(q));
  const filteredOwners = owners.filter(o => o.name.toLowerCase().includes(q));

  // ── Ouvrir les modales ─────────────────────────────────────────────────────
  const openAddContract = () => {
    setCForm({ propertyName: '', tenant: '', rent: '', endDate: '', status: 'Brouillon', propertyType: 'Résidentiel', propertyIcon: 'apartment' });
    setModal('contract'); setTarget(null); setStep(1);
  };
  const openEditContract = (c) => { setCForm({ ...c, rent: String(c.rent) }); setModal('contract'); setTarget(c); setStep(1); };

  const openAddTenant = () => {
    setTForm({ name: '', email: '', phone: '', property: '', since: '', status: 'Actif', color: COLORS[0] });
    setSelectedPropId(''); setSelectedUnitId('');
    setModal('tenant'); setTarget(null); setStep(1);
  };
  const openEditTenant = (t) => {
    setTForm(t);
    // Retrouver la sélection
    const opt = allPropertyOptions.find(o => o.label === t.property || o.buildingName === t.property);
    setSelectedPropId(opt ? opt.value : '');
    setSelectedUnitId('');
    setModal('tenant'); setTarget(t); setStep(1);
  };

  const openAddOwner = () => {
    setOForm({ name: '', initials: '', email: '', phone: '', bank: '', iban: '', status: 'Actif', properties: 0, revenue: 0, color: COLORS[0] });
    setModal('owner'); setTarget(null);
  };
  const openEditOwner = (o) => { setOForm(o); setModal('owner'); setTarget(o); };

  // ── Sauvegardes ────────────────────────────────────────────────────────────
  const saveContract = () => {
    const payload = { ...cForm, rent: Number(cForm.rent) || 0 };
    if (target) dispatch({ type: 'UPDATE_CONTRACT', payload: { ...payload, id: target.id } });
    else dispatch({ type: 'ADD_CONTRACT', payload });
    setModal(null);
  };

  const saveTenant = () => {
    const initials = tForm.initials || tForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    // Résoudre le bien sélectionné
    const opt = allPropertyOptions.find(o => o.value === selectedPropId);
    const propertyLabel = opt ? opt.label : (tForm.property || '');
    const payload = { ...tForm, initials, property: propertyLabel, color: tForm.color || COLORS[0] };
    if (target) dispatch({ type: 'UPDATE_TENANT', payload: { ...payload, id: target.id } });
    else dispatch({ type: 'ADD_TENANT', payload });
    setModal(null);
  };

  const saveOwner = () => {
    const initials = oForm.initials || oForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const payload = { ...oForm, initials };
    if (target) dispatch({ type: 'UPDATE_OWNER', payload: { ...payload, id: target.id } });
    else dispatch({ type: 'ADD_OWNER', payload });
    setModal(null);
  };

  // ── Quand propriété sélectionnée → pré-remplir loyer dans contrat ──────────
  const onContractPropChange = (e) => {
    const opt = allPropertyOptions.find(o => o.value === e.target.value);
    if (opt) setCForm(f => ({ ...f, propertyName: opt.label, rent: String(opt.rent) }));
  };

  // ── Quand propriété sélectionnée → auto loyer dans tenant form ────────────
  const onTenantPropChange = (e) => {
    setSelectedPropId(e.target.value);
    setSelectedUnitId('');
  };

  const confirmDelete = () => {
    const { type, data } = deleteTarget;
    dispatch({ type: `DELETE_${type.toUpperCase()}`, payload: data.id });
    setDeleteTarget(null);
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="px-4 md:px-6 pt-6 pb-20 max-w-7xl mx-auto">

      {/* Onglets */}
      <div className="flex items-center gap-1 border-b border-outline-variant/30 mb-6 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setSearch(''); setCFilter('Tous'); }}
            className={`py-3 px-5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 ${tab === t ? 'text-primary border-primary' : 'text-on-surface-variant border-transparent hover:text-on-surface'}`}>
            {t}
          </button>
        ))}
        <div className="ml-auto pb-1 flex gap-2">
          {tab === 'Contrats' && <Btn icon="note_add" onClick={openAddContract}>Nouveau Contrat</Btn>}
          {tab === 'Locataires' && <Btn icon="person_add" onClick={openAddTenant}>Ajouter Locataire</Btn>}
          {tab === 'Propriétaires' && <Btn icon="add_business" onClick={openAddOwner}>Ajouter Propriétaire</Btn>}
        </div>
      </div>

      {/* Recherche */}
      <div className="relative mb-5 max-w-sm">
        <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
          className="pl-9 pr-4 py-2.5 w-full bg-surface border border-outline-variant/30 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      {/* ── CONTRATS ────────────────────────────────────────────────────── */}
      {tab === 'Contrats' && (
        <div>
          <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
            {CONTRACT_STATUSES.map(s => (
              <button key={s} onClick={() => setCFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${cFilter === s ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-primary text-on-primary">
                  <tr>
                    {['Propriété', 'Locataire', 'Loyer', 'Fin de bail', 'Statut', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${h === 'Loyer' ? 'text-right' : h === 'Fin de bail' ? 'text-center' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filteredContracts.map(c => (
                    <tr key={c.id} className="hover:bg-surface-container-low group">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-on-surface text-sm">{c.propertyName}</p>
                        <p className="text-xs text-on-surface-variant">{c.propertyType}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface">{c.tenant}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary text-sm">{fmt(c.rent)}</td>
                      <td className="px-4 py-3 text-center text-xs text-on-surface-variant">{c.endDate || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[c.status] || ''}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                          <IconBtn icon="edit" color="text-primary" onClick={() => openEditContract(c)} />
                          <IconBtn icon="delete" color="text-error" onClick={() => setDeleteTarget({ type: 'contract', data: c })} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredContracts.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-on-surface-variant text-sm">Aucun contrat trouvé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATAIRES ──────────────────────────────────────────────────── */}
      {tab === 'Locataires' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTenants.map(t => (
            <div key={t.id} className="bg-surface rounded-2xl p-4 border border-outline-variant/20 shadow-sm group hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${t.color}`}>{t.initials}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-on-surface truncate">{t.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[t.status] || ''}`}>{t.status}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <IconBtn icon="edit" color="text-primary" onClick={() => openEditTenant(t)} />
                  <IconBtn icon="delete" color="text-error" onClick={() => setDeleteTarget({ type: 'tenant', data: t })} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-xs text-on-surface-variant">
                <span className="flex items-center gap-1.5"><Icon name="mail" size={12} />{t.email || '—'}</span>
                <span className="flex items-center gap-1.5"><Icon name="phone" size={12} />{t.phone || '—'}</span>
                <span className="flex items-center gap-1.5"><Icon name="apartment" size={12} /><span className="truncate">{t.property || '—'}</span></span>
                <span className="flex items-center gap-1.5"><Icon name="calendar_today" size={12} />Depuis : {t.since || '—'}</span>
              </div>
            </div>
          ))}
          {filteredTenants.length === 0 && (
            <div className="col-span-3 text-center py-12 text-on-surface-variant text-sm">Aucun locataire trouvé</div>
          )}
        </div>
      )}

      {/* ── PROPRIÉTAIRES ───────────────────────────────────────────────── */}
      {tab === 'Propriétaires' && (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-primary text-on-primary">
                <tr>
                  {['Propriétaire', 'Contact', 'Biens', 'Revenu/mois', 'Statut', ''].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider ${h === 'Revenu/mois' ? 'text-right' : h === 'Biens' ? 'text-center' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {filteredOwners.map(o => (
                  <tr key={o.id} className="hover:bg-surface-container-low group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${o.color}`}>{o.initials}</div>
                        <span className="font-semibold text-on-surface text-sm">{o.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-on-surface">{o.email}</p>
                      <p className="text-xs text-on-surface-variant">{o.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary-container text-on-primary-container text-xs font-bold">{o.properties}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary text-sm">{fmt(o.revenue)}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[o.status] || ''}`}>{o.status}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                        <IconBtn icon="edit" color="text-primary" onClick={() => openEditOwner(o)} />
                        <IconBtn icon="delete" color="text-error" onClick={() => setDeleteTarget({ type: 'owner', data: o })} />
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredOwners.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-on-surface-variant text-sm">Aucun propriétaire trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALES
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── Contrat ─────────────────────────────────────────────────────── */}
      {modal === 'contract' && (
        <ModalWrap title={target ? 'Modifier le Contrat' : 'Nouveau Contrat'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="form-label">Propriété *</label>
              <select value={allPropertyOptions.find(o => o.label === cForm.propertyName)?.value || ''}
                onChange={onContractPropChange}
                className="form-input">
                <option value="">— Sélectionner un bien —</option>
                {allPropertyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Locataire *</label>
              <select value={tenants.find(t => t.name === cForm.tenant)?.id || ''}
                onChange={e => { const t = tenants.find(x => x.id === Number(e.target.value)); if (t) setCForm(f => ({ ...f, tenant: t.name })); }}
                className="form-input">
                <option value="">— Sélectionner un locataire —</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Loyer mensuel (FCFA) *</label>
                <input type="number" value={cForm.rent} onChange={e => setCForm(f => ({ ...f, rent: e.target.value }))} className="form-input" placeholder="150000" />
              </div>
              <div>
                <label className="form-label">Fin de bail</label>
                <input type="date" value={cForm.endDate} onChange={e => setCForm(f => ({ ...f, endDate: e.target.value }))} className="form-input" />
              </div>
            </div>
            <div>
              <label className="form-label">Statut</label>
              <select value={cForm.status} onChange={e => setCForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                {['Actif', 'Expirant', 'Brouillon', 'Résilié'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <ModalFooter onCancel={() => setModal(null)} onSave={saveContract} disabled={!cForm.propertyName || !cForm.tenant} />
        </ModalWrap>
      )}

      {/* ── Locataire ───────────────────────────────────────────────────── */}
      {modal === 'tenant' && (
        <ModalWrap title={target ? 'Modifier le Locataire' : 'Ajouter un Locataire'} onClose={() => setModal(null)}>
          {/* Steps */}
          <div className="flex gap-4 mb-5">
            {[{ n: 1, l: 'Identité' }, { n: 2, l: 'Logement' }].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step >= s.n ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>{s.n}</div>
                <span className={`text-sm ${step >= s.n ? 'text-primary font-semibold' : 'text-on-surface-variant'}`}>{s.l}</span>
                {i < 1 && <Icon name="chevron_right" size={14} className="text-outline-variant" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="form-label">Nom complet *</label>
                  <input value={tForm.name} onChange={e => setTForm(f => ({ ...f, name: e.target.value }))} className="form-input" placeholder="Prénom Nom" />
                </div>
                <div>
                  <label className="form-label">Email</label>
                  <input type="email" value={tForm.email} onChange={e => setTForm(f => ({ ...f, email: e.target.value }))} className="form-input" placeholder="email@exemple.com" />
                </div>
                <div>
                  <label className="form-label">Téléphone</label>
                  <input value={tForm.phone} onChange={e => setTForm(f => ({ ...f, phone: e.target.value }))} className="form-input" placeholder="+225 07 00 00 00 00" />
                </div>
              </div>
              <div>
                <label className="form-label">Statut</label>
                <select value={tForm.status} onChange={e => setTForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                  {['Actif', 'En cours', 'Inactif'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="form-label">Bien / Immeuble *</label>
                <select value={selectedPropId} onChange={onTenantPropChange} className="form-input">
                  <option value="">— Sélectionner un bien —</option>
                  {properties.filter(p => !p.isBuilding).map(p => (
                    <option key={p.id} value={`${p.id}::`}>{p.name} — {p.address}</option>
                  ))}
                  {properties.filter(p => p.isBuilding).map(p => (
                    <optgroup key={p.id} label={`🏢 ${p.name}`}>
                      {(p.units || []).map(u => (
                        <option key={u.id} value={`${p.id}::${u.id}`}>{u.number} ({u.floor}) — {Number(u.rent).toLocaleString('fr-CI')} FCFA</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Date d'entrée</label>
                <input type="date" value={tForm.since} onChange={e => setTForm(f => ({ ...f, since: e.target.value }))} className="form-input" />
              </div>
              {selectedPropId && (
                <div className="bg-primary-container/30 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-primary">{allPropertyOptions.find(o => o.value === selectedPropId)?.label}</p>
                  <p className="text-on-surface-variant text-xs mt-0.5">
                    Loyer : <strong className="text-on-surface">{fmt(allPropertyOptions.find(o => o.value === selectedPropId)?.rent)}/mois</strong>
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-xl">Annuler</button>
            <div className="flex gap-2">
              {step > 1 && <button onClick={() => setStep(1)} className="px-4 py-2 text-sm bg-surface-container rounded-xl">← Précédent</button>}
              {step < 2
                ? <button onClick={() => setStep(2)} disabled={!tForm.name} className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40">Suivant →</button>
                : <button onClick={saveTenant} className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold">Enregistrer</button>
              }
            </div>
          </div>
        </ModalWrap>
      )}

      {/* ── Propriétaire ────────────────────────────────────────────────── */}
      {modal === 'owner' && (
        <ModalWrap title={target ? 'Modifier le Propriétaire' : 'Ajouter un Propriétaire'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <div>
              <label className="form-label">Nom complet *</label>
              <input value={oForm.name} onChange={e => setOForm(f => ({ ...f, name: e.target.value }))} className="form-input" placeholder="Prénom Nom" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Email</label>
                <input type="email" value={oForm.email} onChange={e => setOForm(f => ({ ...f, email: e.target.value }))} className="form-input" />
              </div>
              <div>
                <label className="form-label">Téléphone</label>
                <input value={oForm.phone} onChange={e => setOForm(f => ({ ...f, phone: e.target.value }))} className="form-input" placeholder="+225 07 00 00 00 00" />
              </div>
              <div>
                <label className="form-label">Banque</label>
                <input value={oForm.bank || ''} onChange={e => setOForm(f => ({ ...f, bank: e.target.value }))} className="form-input" placeholder="Ex: BICICI" />
              </div>
              <div>
                <label className="form-label">RIB / IBAN</label>
                <input value={oForm.iban || ''} onChange={e => setOForm(f => ({ ...f, iban: e.target.value }))} className="form-input" />
              </div>
            </div>
            <div>
              <label className="form-label">Statut</label>
              <select value={oForm.status} onChange={e => setOForm(f => ({ ...f, status: e.target.value }))} className="form-input">
                {['Actif', 'Inactif'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <ModalFooter onCancel={() => setModal(null)} onSave={saveOwner} disabled={!oForm.name} />
        </ModalWrap>
      )}

      {/* ── Confirmation suppression ─────────────────────────────────────── */}
      {deleteTarget && (
        <ModalWrap title="Confirmer la suppression" onClose={() => setDeleteTarget(null)}>
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center mx-auto mb-4">
              <Icon name="warning" size={32} className="text-error" />
            </div>
            <p className="text-sm text-on-surface-variant">Supprimer <strong className="text-on-surface">"{deleteTarget.data?.name || deleteTarget.data?.propertyName}"</strong> ?</p>
            <p className="text-xs text-on-surface-variant mt-1">Cette action est irréversible.</p>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface text-sm font-semibold">Annuler</button>
            <button onClick={confirmDelete} className="flex-1 py-2.5 rounded-xl bg-error text-on-error text-sm font-bold">Supprimer</button>
          </div>
        </ModalWrap>
      )}
    </div>
  );
}

// ── Micro-composants ──────────────────────────────────────────────────────────
function Btn({ icon, onClick, children }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors whitespace-nowrap">
      <Icon name={icon} size={16} />{children}
    </button>
  );
}
function IconBtn({ icon, color, onClick }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} className={`w-7 h-7 rounded-full flex items-center justify-center ${color} hover:bg-surface-container transition-colors`}>
      <Icon name={icon} size={14} />
    </button>
  );
}
function ModalWrap({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-outline-variant/20 px-6 py-4 flex justify-between items-center rounded-t-3xl">
          <h2 className="font-bold text-on-surface">{title}</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function ModalFooter({ onCancel, onSave, disabled, saveLabel = 'Enregistrer' }) {
  return (
    <div className="flex justify-between mt-6">
      <button onClick={onCancel} className="px-4 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high rounded-xl">Annuler</button>
      <button onClick={onSave} disabled={disabled} className="px-5 py-2 text-sm bg-primary text-on-primary rounded-xl font-bold disabled:opacity-40">{saveLabel}</button>
    </div>
  );
}

// Styles inline pour les formulaires (tailwind via className)
const _css = `
  .form-label { display: block; font-size: 0.75rem; font-weight: 500; color: var(--color-on-surface-variant); margin-bottom: 4px; }
  .form-input { width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.15); background: var(--color-surface-container); font-size: 0.875rem; color: var(--color-on-surface); outline: none; }
  .form-input:focus { box-shadow: 0 0 0 2px rgba(120,90,0,0.25); }
`;
