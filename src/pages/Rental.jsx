import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Icon from '../components/Icon';

const TABS = ['Contrats', 'Locataires', 'Propriétaires'];
const CONTRACT_STATUSES = ['Tous', 'Actif', 'Expirant', 'Brouillon', 'Résilié'];
const EMPTY_CONTRACT = { propertyName: '', propertyType: 'Résidentiel', propertyIcon: 'apartment', tenant: '', rent: '', endDate: '', status: 'Brouillon' };
const EMPTY_TENANT = { name: '', initials: '', email: '', phone: '', property: '', since: '', status: 'Actif', color: 'bg-primary-container text-on-primary-container' };
const EMPTY_OWNER = { name: '', initials: '', email: '', phone: '', bank: '', iban: '', status: 'Actif', properties: 0, revenue: 0, color: 'bg-primary-container text-on-primary-container' };

export default function Rental() {
  const { state, dispatch } = useApp();
  const { contracts, tenants, owners } = state;

  const [tab, setTab] = useState('Contrats');
  const [cFilter, setCFilter] = useState('Tous');
  const [search, setSearch] = useState('');

  // Modals state
  const [contractModal, setContractModal] = useState({ open: false, data: null });
  const [tenantModal, setTenantModal] = useState({ open: false, data: null, step: 1 });
  const [ownerModal, setOwnerModal] = useState({ open: false, data: null });
  const [deleteModal, setDeleteModal] = useState({ open: false, type: null, data: null });

  // Forms
  const [cForm, setCForm] = useState(EMPTY_CONTRACT);
  const [tForm, setTForm] = useState(EMPTY_TENANT);
  const [oForm, setOForm] = useState(EMPTY_OWNER);

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filteredContracts = contracts.filter(c =>
    (cFilter === 'Tous' || c.status === cFilter) &&
    (c.tenant.toLowerCase().includes(search.toLowerCase()) || c.propertyName.toLowerCase().includes(search.toLowerCase()))
  );
  const filteredTenants = tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  const filteredOwners = owners.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));

  // ── Helpers ────────────────────────────────────────────────────────────────
  const openAddContract = () => { setCForm(EMPTY_CONTRACT); setContractModal({ open: true, data: null }); };
  const openEditContract = (c, e) => { e?.stopPropagation(); setCForm({ ...c, rent: String(c.rent) }); setContractModal({ open: true, data: c }); };

  const openAddTenant = () => { setTForm(EMPTY_TENANT); setTenantModal({ open: true, data: null, step: 1 }); };
  const openEditTenant = (t, e) => { e?.stopPropagation(); setTForm(t); setTenantModal({ open: true, data: t, step: 1 }); };

  const openAddOwner = () => { setOForm(EMPTY_OWNER); setOwnerModal({ open: true, data: null }); };
  const openEditOwner = (o, e) => { e?.stopPropagation(); setOForm(o); setOwnerModal({ open: true, data: o }); };

  // ── Save handlers ──────────────────────────────────────────────────────────
  const saveContract = () => {
    const payload = { ...cForm, rent: Number(cForm.rent) || 0 };
    if (contractModal.data) dispatch({ type: 'UPDATE_CONTRACT', payload: { ...payload, id: contractModal.data.id } });
    else dispatch({ type: 'ADD_CONTRACT', payload });
    setContractModal({ open: false, data: null });
  };

  const saveTenant = () => {
    const initials = tForm.initials || tForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const payload = { ...tForm, initials };
    if (tenantModal.data) dispatch({ type: 'UPDATE_TENANT', payload: { ...payload, id: tenantModal.data.id } });
    else dispatch({ type: 'ADD_TENANT', payload });
    setTenantModal({ open: false, data: null, step: 1 });
  };

  const saveOwner = () => {
    const initials = oForm.initials || oForm.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const payload = { ...oForm, initials };
    if (ownerModal.data) dispatch({ type: 'UPDATE_OWNER', payload: { ...payload, id: ownerModal.data.id } });
    else dispatch({ type: 'ADD_OWNER', payload });
    setOwnerModal({ open: false, data: null });
  };

  const confirmDelete = () => {
    const { type, data } = deleteModal;
    if (type === 'contract') dispatch({ type: 'DELETE_CONTRACT', payload: data.id });
    if (type === 'tenant') dispatch({ type: 'DELETE_TENANT', payload: data.id });
    if (type === 'owner') dispatch({ type: 'DELETE_OWNER', payload: data.id });
    setDeleteModal({ open: false, type: null, data: null });
  };

  return (
    <div className="px-margin pt-gutter pb-xl max-w-7xl mx-auto">

      {/* Tab bar */}
      <div className="flex items-center gap-lg border-b border-outline-variant mb-lg overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setSearch(''); setCFilter('Tous'); }}
            className={`py-sm px-base text-label-md font-label-md whitespace-nowrap transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
            {t}
          </button>
        ))}
        <div className="ml-auto pb-sm flex gap-sm">
          {tab === 'Contrats' && <Button icon="note_add" onClick={openAddContract}>Nouveau Contrat</Button>}
          {tab === 'Locataires' && <Button icon="person_add" onClick={openAddTenant}>Ajouter Locataire</Button>}
          {tab === 'Propriétaires' && <Button icon="add_business" onClick={openAddOwner}>Ajouter Propriétaire</Button>}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-md max-w-sm">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
        <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-md py-sm w-full bg-surface-container-lowest border border-outline-variant rounded-full text-body-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
      </div>

      {/* ── CONTRACTS ───────────────────────────────────────────────────── */}
      {tab === 'Contrats' && (
        <div className="grid grid-cols-12 gap-gutter">
          <div className="col-span-12 lg:col-span-9">
            <div className="flex gap-xs overflow-x-auto no-scrollbar mb-md">
              {CONTRACT_STATUSES.map(s => (
                <button key={s} onClick={() => setCFilter(s)}
                  className={`px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${cFilter === s ? 'bg-primary text-on-primary' : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high'}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="bg-surface-container-lowest rounded-xl shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-secondary text-on-primary">
                    <tr>
                      <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider">Propriété</th>
                      <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider">Locataire</th>
                      <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider text-right">Loyer</th>
                      <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider text-center">Fin de bail</th>
                      <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider">Statut</th>
                      <th className="px-md py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {filteredContracts.map(c => (
                      <tr key={c.id} className="hover:bg-surface-container-low transition-colors group">
                        <td className="px-md py-4">
                          <div className="flex items-center gap-sm">
                            <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center">
                              <Icon name={c.propertyIcon || 'apartment'} className="text-primary" size={18} />
                            </div>
                            <div>
                              <p className="text-label-md font-label-md text-on-surface">{c.propertyName}</p>
                              <p className="text-body-sm text-on-surface-variant">{c.propertyType}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-md py-4 text-body-md text-on-surface">{c.tenant}</td>
                        <td className="px-md py-4 text-label-md font-label-md text-right text-primary">{Number(c.rent).toLocaleString('fr-FR')} FCFA</td>
                        <td className="px-md py-4 text-body-md text-center text-on-surface-variant">{c.endDate || '—'}</td>
                        <td className="px-md py-4"><Badge label={c.status} /></td>
                        <td className="px-md py-4">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={e => openEditContract(c, e)} className="p-1.5 text-primary hover:bg-surface-container rounded-full transition-colors">
                              <Icon name="edit" size={16} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); setDeleteModal({ open: true, type: 'contract', data: c }); }}
                              className="p-1.5 text-error hover:bg-error-container/30 rounded-full transition-colors">
                              <Icon name="delete" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredContracts.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-xl text-on-surface-variant">Aucun contrat trouvé</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-md py-4 bg-surface-container-low border-t border-outline-variant/20 text-body-sm text-on-surface-variant">
                {filteredContracts.length} contrat(s) affiché(s)
              </div>
            </div>
          </div>

          {/* Sidebar insights */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-gutter">
            <div className="bg-surface-container-highest rounded-xl p-md shadow-card border border-outline-variant/20">
              <h3 className="font-h3 text-h3 text-on-surface mb-md">Indicateurs</h3>
              <div className="flex flex-col gap-md">
                <div className="flex justify-between"><span className="text-body-md text-on-surface-variant">Expirant 30j</span><span className="text-primary font-bold text-label-md">{contracts.filter(c => c.status === 'Expirant').length}</span></div>
                <div className="flex justify-between"><span className="text-body-md text-on-surface-variant">Loyer moyen</span><span className="text-on-surface font-bold text-label-md">{contracts.length ? Math.round(contracts.reduce((s, c) => s + Number(c.rent), 0) / contracts.length).toLocaleString('fr-FR') : 0} FCFA</span></div>
                <div className="flex justify-between"><span className="text-body-md text-on-surface-variant">Actifs</span><span className="text-green-700 font-bold text-label-md">{contracts.filter(c => c.status === 'Actif').length}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOCATAIRES ──────────────────────────────────────────────────── */}
      {tab === 'Locataires' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {filteredTenants.map(t => (
            <div key={t.id} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 hover:shadow-modal transition-shadow group">
              <div className="flex items-center gap-md mb-md">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${t.color}`}>{t.initials}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-label-md font-label-md text-on-surface truncate">{t.name}</h3>
                  <Badge label={t.status} />
                </div>
                {/* Actions */}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => openEditTenant(t, e)} className="p-1.5 text-primary hover:bg-surface-container rounded-full"><Icon name="edit" size={16} /></button>
                  <button onClick={() => setDeleteModal({ open: true, type: 'tenant', data: t })} className="p-1.5 text-error hover:bg-error-container/30 rounded-full"><Icon name="delete" size={16} /></button>
                </div>
              </div>
              <div className="flex flex-col gap-xs text-body-sm text-on-surface-variant">
                <div className="flex items-center gap-xs"><Icon name="mail" size={13} /><span className="truncate">{t.email}</span></div>
                <div className="flex items-center gap-xs"><Icon name="phone" size={13} /><span>{t.phone}</span></div>
                <div className="flex items-center gap-xs"><Icon name="apartment" size={13} /><span className="truncate">{t.property}</span></div>
                <div className="flex items-center gap-xs"><Icon name="calendar_today" size={13} /><span>Depuis : {t.since}</span></div>
              </div>
            </div>
          ))}
          {filteredTenants.length === 0 && (
            <div className="col-span-3 text-center py-xl text-on-surface-variant">Aucun locataire trouvé</div>
          )}
        </div>
      )}

      {/* ── PROPRIÉTAIRES ───────────────────────────────────────────────── */}
      {tab === 'Propriétaires' && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-secondary text-on-primary">
              <tr>
                <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider">Propriétaire</th>
                <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider">Contact</th>
                <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider text-center">Biens</th>
                <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider text-right">Revenu/mois</th>
                <th className="px-md py-4 text-label-sm font-label-sm uppercase tracking-wider">Statut</th>
                <th className="px-md py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredOwners.map(o => (
                <tr key={o.id} className="hover:bg-surface-container-low transition-colors group">
                  <td className="px-md py-4">
                    <div className="flex items-center gap-sm">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${o.color}`}>{o.initials}</div>
                      <span className="text-label-md font-label-md text-on-surface">{o.name}</span>
                    </div>
                  </td>
                  <td className="px-md py-4">
                    <p className="text-body-sm text-on-surface">{o.email}</p>
                    <p className="text-body-sm text-on-surface-variant">{o.phone}</p>
                  </td>
                  <td className="px-md py-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-container text-on-primary-container text-label-sm font-bold">{o.properties}</span>
                  </td>
                  <td className="px-md py-4 text-right text-label-md font-label-md text-primary">{Number(o.revenue).toLocaleString('fr-FR')} FCFA</td>
                  <td className="px-md py-4"><Badge label={o.status} /></td>
                  <td className="px-md py-4">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => openEditOwner(o, e)} className="p-1.5 text-primary hover:bg-surface-container rounded-full"><Icon name="edit" size={16} /></button>
                      <button onClick={() => setDeleteModal({ open: true, type: 'owner', data: o })} className="p-1.5 text-error hover:bg-error-container/30 rounded-full"><Icon name="delete" size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOwners.length === 0 && (
                <tr><td colSpan={6} className="text-center py-xl text-on-surface-variant">Aucun propriétaire trouvé</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Contract Modal (Add/Edit) ──────────────────────────────────── */}
      <Modal open={contractModal.open} onClose={() => setContractModal({ open: false, data: null })}
        title={contractModal.data ? 'Modifier le Contrat' : 'Nouveau Contrat'} size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setContractModal({ open: false, data: null })}>Annuler</Button>
            <Button icon={contractModal.data ? 'save' : 'note_add'} onClick={saveContract} disabled={!cForm.propertyName || !cForm.tenant}>
              {contractModal.data ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }>
        <div className="flex flex-col gap-md">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Input label="Propriété" name="propertyName" placeholder="Nom du bien" value={cForm.propertyName} onChange={e => setCForm(f => ({ ...f, propertyName: e.target.value }))} required />
            <Input label="Locataire" name="tenant" placeholder="Nom du locataire" value={cForm.tenant} onChange={e => setCForm(f => ({ ...f, tenant: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Input label="Loyer mensuel (FCFA)" name="rent" type="number" placeholder="Ex: 350000" value={cForm.rent} onChange={e => setCForm(f => ({ ...f, rent: e.target.value }))} icon="payments" required />
            <Input label="Fin de bail" name="endDate" type="date" value={cForm.endDate} onChange={e => setCForm(f => ({ ...f, endDate: e.target.value }))} icon="event" />
          </div>
          <Select label="Statut" value={cForm.status} onChange={e => setCForm(f => ({ ...f, status: e.target.value }))}
            options={['Actif', 'Expirant', 'Brouillon', 'Résilié'].map(s => ({ value: s, label: s }))} />
        </div>
      </Modal>

      {/* ── Tenant Modal (Add/Edit) ────────────────────────────────────── */}
      <Modal open={tenantModal.open} onClose={() => setTenantModal({ open: false, data: null, step: 1 })}
        title={tenantModal.data ? 'Modifier le Locataire' : 'Ajouter un Locataire'} size="md"
        footer={
          <>
            {tenantModal.step > 1 && <Button variant="secondary" onClick={() => setTenantModal(s => ({ ...s, step: 1 }))}>Précédent</Button>}
            {tenantModal.step < 2
              ? <Button onClick={() => setTenantModal(s => ({ ...s, step: 2 }))}>Suivant <Icon name="arrow_forward" size={16} /></Button>
              : <Button icon={tenantModal.data ? 'save' : 'person_add'} onClick={saveTenant} disabled={!tForm.name}>
                  {tenantModal.data ? 'Enregistrer' : 'Créer'}
                </Button>
            }
          </>
        }>
        {tenantModal.step === 1 && (
          <div className="flex flex-col gap-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Input label="Nom complet" name="name" placeholder="Prénom Nom" value={tForm.name} onChange={e => setTForm(f => ({ ...f, name: e.target.value }))} icon="person" required />
              <Input label="Email" name="email" type="email" value={tForm.email} onChange={e => setTForm(f => ({ ...f, email: e.target.value }))} icon="mail" />
            </div>
            <Input label="Téléphone" name="phone" value={tForm.phone} onChange={e => setTForm(f => ({ ...f, phone: e.target.value }))} icon="phone" />
            <Select label="Statut" value={tForm.status} onChange={e => setTForm(f => ({ ...f, status: e.target.value }))}
              options={['Actif', 'En cours', 'Inactif'].map(s => ({ value: s, label: s }))} />
          </div>
        )}
        {tenantModal.step === 2 && (
          <div className="flex flex-col gap-md">
            <Input label="Bien occupé" name="property" placeholder="Nom du bien" value={tForm.property} onChange={e => setTForm(f => ({ ...f, property: e.target.value }))} icon="apartment" />
            <Input label="Date d'entrée" name="since" type="date" value={tForm.since} onChange={e => setTForm(f => ({ ...f, since: e.target.value }))} icon="calendar_today" />
          </div>
        )}
      </Modal>

      {/* ── Owner Modal (Add/Edit) ─────────────────────────────────────── */}
      <Modal open={ownerModal.open} onClose={() => setOwnerModal({ open: false, data: null })}
        title={ownerModal.data ? 'Modifier le Propriétaire' : 'Ajouter un Propriétaire'} size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOwnerModal({ open: false, data: null })}>Annuler</Button>
            <Button icon={ownerModal.data ? 'save' : 'add_business'} onClick={saveOwner} disabled={!oForm.name}>
              {ownerModal.data ? 'Enregistrer' : 'Créer'}
            </Button>
          </>
        }>
        <div className="flex flex-col gap-md">
          <Input label="Nom complet" name="name" placeholder="Prénom Nom" value={oForm.name} onChange={e => setOForm(f => ({ ...f, name: e.target.value }))} icon="person" required />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Input label="Email" name="email" type="email" value={oForm.email} onChange={e => setOForm(f => ({ ...f, email: e.target.value }))} icon="mail" />
            <Input label="Téléphone" name="phone" value={oForm.phone} onChange={e => setOForm(f => ({ ...f, phone: e.target.value }))} icon="phone" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <Input label="Banque" name="bank" value={oForm.bank} onChange={e => setOForm(f => ({ ...f, bank: e.target.value }))} icon="account_balance" />
            <Input label="IBAN / RIB" name="iban" value={oForm.iban} onChange={e => setOForm(f => ({ ...f, iban: e.target.value }))} icon="credit_card" />
          </div>
          <Select label="Statut" value={oForm.status} onChange={e => setOForm(f => ({ ...f, status: e.target.value }))}
            options={['Actif', 'Inactif'].map(s => ({ value: s, label: s }))} />
        </div>
      </Modal>

      {/* ── Confirm Delete ─────────────────────────────────────────────── */}
      <Modal open={deleteModal.open} onClose={() => setDeleteModal({ open: false, type: null, data: null })} title="Confirmer la suppression" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteModal({ open: false, type: null, data: null })}>Annuler</Button>
            <Button variant="danger" icon="delete" onClick={confirmDelete}>Supprimer</Button>
          </>
        }>
        <div className="flex flex-col items-center text-center gap-md py-md">
          <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center">
            <Icon name="warning" size={32} className="text-error" />
          </div>
          <div>
            <p className="text-body-md text-on-surface">Supprimer <strong>"{deleteModal.data?.name || deleteModal.data?.propertyName}"</strong> ?</p>
            <p className="text-body-sm text-on-surface-variant mt-sm">Cette action est irréversible.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
