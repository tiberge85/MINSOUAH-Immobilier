import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const STATUS_OPTIONS = [
  { value: 'nouveau',  label: 'Nouveau' },
  { value: 'contacté', label: 'Contacté' },
  { value: 'visité',   label: 'Visité' },
  { value: 'converti', label: 'Converti' },
  { value: 'perdu',    label: 'Perdu' },
];

const TYPE_LABELS = {
  maison: 'Maison', appartement: 'Appartement', villa: 'Villa',
  terrain: 'Terrain', bureau: 'Bureau', residence_meublee: 'Résidence Meublée',
};

const fmt  = n => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';
const fmtDate = d => { try { return new Date(d).toLocaleDateString('fr-CI'); } catch { return '—'; } };

function scoreMatch(client, listing) {
  if (listing.status !== 'publié') return 0;
  let score = 0;
  if (client.type && listing.type === client.type) score += 35;
  if (client.zone && listing.zone) {
    const cz = client.zone.toLowerCase().trim();
    const lz = listing.zone.toLowerCase().trim();
    if (lz.includes(cz) || cz.includes(lz)) score += 25;
  }
  const budget = parseFloat(String(client.budget || '').replace(/[^0-9.]/g, '')) || 0;
  if (budget > 0 && listing.price > 0) {
    if (listing.price <= budget) score += 25;
    else if (listing.price <= budget * 1.15) score += 12;
  } else if (!budget) {
    score += 10;
  }
  const minRooms = parseInt(client.rooms) || 0;
  if (minRooms > 0 && listing.rooms >= minRooms) score += 15;
  else if (!minRooms) score += 5;
  return Math.min(score, 100);
}

function phoneForWA(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('225') ? d : '225' + (d.startsWith('0') ? d.slice(1) : d);
}

/* ── Clients Tab ────────────────────────────────────────────────────────────── */
function ClientsTab() {
  const { state, dispatch } = useApp();
  const { listingClients = [], listings = [] } = state;

  const [statusFilter, setStatusFilter] = useState('all');
  const [search,        setSearch]       = useState('');
  const [expanded,      setExpanded]     = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const filtered = useMemo(() =>
    listingClients
      .filter(c => statusFilter === 'all' || c.status === statusFilter)
      .filter(c => !search ||
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search) ||
        c.zone?.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [listingClients, statusFilter, search]
  );

  const getMatches = (client) =>
    listings
      .map(l => ({ ...l, score: scoreMatch(client, l) }))
      .filter(l => l.score >= 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

  const updateStatus = (client, status) =>
    dispatch({ type: 'UPDATE_LISTING_CLIENT', payload: { ...client, status } });

  const handleDelete = async () => {
    await dispatch({ type: 'DELETE_LISTING_CLIENT', payload: deleteConfirm.id });
    setDeleteConfirm(null);
  };

  const counts = useMemo(() => ({
    total:    listingClients.length,
    nouveau:  listingClients.filter(c => !c.status || c.status === 'nouveau').length,
    contacté: listingClients.filter(c => c.status === 'contacté').length,
    converti: listingClients.filter(c => c.status === 'converti').length,
  }), [listingClients]);

  return (
    <div className="flex flex-col gap-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: counts.total,    cls: 'bg-surface-container text-on-surface' },
          { label: 'Nouveaux',  value: counts.nouveau,  cls: 'bg-blue-100 text-blue-700' },
          { label: 'Contactés', value: counts.contacté, cls: 'bg-amber-100 text-amber-700' },
          { label: 'Convertis', value: counts.converti, cls: 'bg-green-100 text-green-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-4 py-3 flex items-center justify-between ${s.cls}`}>
            <span className="text-sm font-semibold">{s.label}</span>
            <span className="text-2xl font-black">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom, téléphone, zone…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-outline-variant rounded-xl bg-surface-container-lowest focus:outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all','nouveau','contacté','visité','converti','perdu'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${statusFilter === s ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
              {s === 'all' ? 'Tous' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-on-surface-variant">{filtered.length} client(s)</span>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-primary text-on-primary">
              <tr>
                {['Client','Contact','Intérêt','Budget','Statut','Matchs','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-on-surface-variant">
                  <Icon name="person_search" size={40} className="opacity-30 mx-auto mb-2" />
                  <p>Aucun client enregistré pour l'instant</p>
                </td></tr>
              )}
              {filtered.flatMap(client => {
                const matches  = getMatches(client);
                const isExp    = expanded === client.id;
                const waPhone  = phoneForWA(client.phone);
                const waMsg    = encodeURIComponent(`Bonjour ${client.name}, je vous contacte de la part de Minsouah Immobilier suite à votre demande. Êtes-vous toujours à la recherche d'un bien immobilier ?`);
                return [
                  <tr key={client.id} className="hover:bg-surface-container-low transition-colors group">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-sm text-on-surface">{client.name}</p>
                      <p className="text-xs text-on-surface-variant">{fmtDate(client.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-on-surface">{client.phone}</p>
                      {client.email && <p className="text-xs text-on-surface-variant truncate max-w-[130px]">{client.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-on-surface">{TYPE_LABELS[client.type] || client.type || '—'}</p>
                      <p className="text-xs text-on-surface-variant flex items-center gap-0.5">
                        <Icon name="location_on" size={10} />{client.zone || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-primary whitespace-nowrap">
                      {client.budget
                        ? Number(String(client.budget).replace(/[^0-9]/g, '')).toLocaleString('fr-CI') + ' FCFA'
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <select value={client.status || 'nouveau'} onChange={e => updateStatus(client, e.target.value)}
                        className="text-xs font-semibold px-2 py-1 rounded-full border border-outline-variant/30 bg-surface cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/20 text-on-surface">
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setExpanded(isExp ? null : client.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${matches.length > 0 ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                        <Icon name="auto_awesome" size={12} />
                        {matches.length} match{matches.length !== 1 ? 's' : ''}
                        <Icon name={isExp ? 'expand_less' : 'expand_more'} size={12} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {waPhone && (
                          <a href={`https://wa.me/${waPhone}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors" title="Contacter via WhatsApp">
                            <Icon name="chat" size={14} />
                          </a>
                        )}
                        <button onClick={() => setDeleteConfirm(client)}
                          className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors" title="Supprimer">
                          <Icon name="delete" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>,
                  ...(isExp ? [
                    <tr key={`${client.id}_exp`} className="bg-primary/5">
                      <td colSpan={7} className="px-6 py-4">
                        <p className="text-xs font-bold text-primary mb-3 flex items-center gap-1.5">
                          <Icon name="auto_awesome" size={13} />
                          Biens correspondants ({matches.length})
                          {client.notes && (
                            <span className="text-on-surface-variant font-normal ml-3">— {client.notes}</span>
                          )}
                        </p>
                        {matches.length === 0 ? (
                          <p className="text-xs text-on-surface-variant italic">
                            Aucun bien publié ne correspond aux critères actuels.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {matches.map(listing => (
                              <div key={listing.id}
                                className="flex items-center gap-2.5 bg-surface rounded-xl px-3 py-2 border border-outline-variant/20">
                                {listing.images?.[0]
                                  ? <img src={listing.images[0]} alt="" className="w-10 h-8 object-cover rounded-lg flex-shrink-0" />
                                  : <div className="w-10 h-8 bg-surface-container rounded-lg flex items-center justify-center flex-shrink-0">
                                      <Icon name="image" size={13} className="text-outline-variant" />
                                    </div>
                                }
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-on-surface truncate">{listing.title}</p>
                                  <p className="text-[10px] text-on-surface-variant">{listing.zone} · {fmt(listing.price)}</p>
                                </div>
                                <div className={`text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0 ${listing.score >= 75 ? 'bg-green-100 text-green-700' : listing.score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-surface-container text-on-surface-variant'}`}>
                                  {listing.score}%
                                </div>
                                {waPhone && (
                                  <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Bonjour ${client.name}, nous avons un bien pour vous : "${listing.title}" à ${listing.zone} — ${Number(listing.price).toLocaleString('fr-CI')} FCFA. Souhaitez-vous une visite ?`)}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="p-1 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 flex-shrink-0 transition-colors" title="Proposer ce bien">
                                    <Icon name="send" size={12} />
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ] : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-surface rounded-2xl shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4">
              <Icon name="delete" size={24} className="text-red-700" />
            </div>
            <h3 className="font-bold text-on-surface text-lg mb-2">Supprimer ce client ?</h3>
            <p className="text-sm text-on-surface-variant mb-5">
              <strong>{deleteConfirm.name}</strong> · {deleteConfirm.phone}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 font-semibold text-sm text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high">
                Annuler
              </button>
              <button onClick={handleDelete}
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

/* ── Revenus Tab ────────────────────────────────────────────────────────────── */
function RevenusTab() {
  const { state, dispatch } = useApp();
  const { listingUnlocks = [] } = state;

  const totalRevenue = listingUnlocks.reduce((sum, u) => sum + (u.amount || 0), 0);
  const pending   = listingUnlocks.filter(u => u.status === 'pending').length;
  const validated = listingUnlocks.filter(u => u.status === 'validated').length;

  const sorted = [...listingUnlocks].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const METHOD_LABELS = { orange: 'Orange Money', mtn: 'MTN MoMo', wave: 'Wave', cinetpay: 'CinetPay' };
  const STATUS_CLS    = {
    pending:   'bg-amber-100 text-amber-700',
    validated: 'bg-green-100 text-green-700',
    rejected:  'bg-red-100 text-red-700',
  };

  const validateUnlock = (u) =>
    dispatch({ type: 'UPDATE_LISTING_UNLOCK', payload: { ...u, status: 'validated' } });

  const rejectUnlock = (u) =>
    dispatch({ type: 'UPDATE_LISTING_UNLOCK', payload: { ...u, status: 'rejected' } });

  return (
    <div className="flex flex-col gap-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Revenus totaux', value: Number(totalRevenue).toLocaleString('fr-CI') + ' FCFA', icon: 'payments',  cls: 'bg-green-100 text-green-800' },
          { label: 'Déblocages',     value: listingUnlocks.length,                                  icon: 'lock_open', cls: 'bg-primary/10 text-primary' },
          { label: 'En attente',     value: pending,                                                 icon: 'pending',   cls: 'bg-amber-100 text-amber-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-5 py-4 flex items-center gap-4 ${s.cls}`}>
            <Icon name={s.icon} size={24} />
            <div>
              <p className="text-xl font-black">{s.value}</p>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-outline-variant/20 flex items-center justify-between">
          <h3 className="font-bold text-on-surface text-sm">Historique des déblocages</h3>
          <span className="text-xs text-on-surface-variant">{listingUnlocks.length} total · {validated} validés</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container">
              <tr>
                {['Date','Annonce','Méthode','Montant','Réf. transaction','Statut','Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {sorted.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-on-surface-variant">
                  <Icon name="lock_open" size={36} className="opacity-30 mx-auto mb-2" />
                  <p className="text-sm">Aucun déblocage pour l'instant</p>
                </td></tr>
              )}
              {sorted.map(u => (
                <tr key={u.id} className="hover:bg-surface-container-low group">
                  <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface max-w-[150px] truncate">{u.listingTitle || '—'}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-on-surface">{METHOD_LABELS[u.method] || u.method || '—'}</td>
                  <td className="px-4 py-3 text-sm font-bold text-primary">{fmt(u.amount)}</td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant font-mono">{u.txRef || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CLS[u.status] || 'bg-surface-container text-on-surface-variant'}`}>
                      {u.status === 'pending' ? 'En attente' : u.status === 'validated' ? 'Validé' : u.status === 'rejected' ? 'Rejeté' : u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.status === 'pending' && (
                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => validateUnlock(u)}
                          className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors" title="Valider">
                          <Icon name="check_circle" size={14} />
                        </button>
                        <button onClick={() => rejectUnlock(u)}
                          className="p-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors" title="Rejeter">
                          <Icon name="cancel" size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────────────── */
export default function MarketplaceClients() {
  const [tab, setTab] = useState('clients');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-black text-on-surface text-xl">Clients & Revenus</h2>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Gestion des prospects, matching automatique et suivi des déblocages de contacts
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-surface-container rounded-xl p-1 w-fit">
        {[
          { id: 'clients', label: 'Clients & Matching', icon: 'people' },
          { id: 'revenus', label: 'Revenus & Déblocages', icon: 'payments' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t.id ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}>
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'clients' && <ClientsTab />}
      {tab === 'revenus' && <RevenusTab />}
    </div>
  );
}
