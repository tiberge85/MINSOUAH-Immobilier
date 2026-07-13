import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Icon from '../components/Icon';
import { can } from '../lib/permissions';

const PRIORITY_FILTERS = ['Tous', 'Urgent', 'Moyen', 'Bas'];
const TYPE_FILTERS = ['Plomberie', 'HVAC', 'Électricité', 'Autre'];
const STATUS_STEPS = ['En attente', 'En cours', 'Résolu'];

const priorityBorderColor = {
  Urgent: 'border-t-4 border-error',
  Moyen: 'border-t-4 border-amber-400',
  Bas: 'border-t-4 border-outline-variant',
};

const statusIconMap = {
  'En attente': { icon: 'pending_actions', color: 'text-amber-600 bg-amber-100' },
  'En cours': { icon: 'engineering', color: 'text-tertiary bg-tertiary-container/20' },
  Résolu: { icon: 'check_circle', color: 'text-green-700 bg-green-100' },
};

const newTicketForm0 = {
  title: '', description: '', priority: 'Moyen', type: 'Plomberie',
  property: '', unit: '',
  prestataire: '', prestatairePhone: '', devisAmount: '',
};

export default function Maintenance() {
  const { state, dispatch } = useApp();
  const canCreate = can(state.currentUser, 'maintenance', 'create');
  const canEdit   = can(state.currentUser, 'maintenance', 'edit');
  const canDelete = can(state.currentUser, 'maintenance', 'delete');
  const tickets = state.tickets || [];
  const prestataires = state.prestataires || [];
  const [priorityFilter, setPriorityFilter] = useState('Tous');
  const [typeFilter, setTypeFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [technicianName, setTechnicianName] = useState('');
  const [form, setForm] = useState(newTicketForm0);

  const filtered = tickets.filter((t) => {
    const matchPriority = priorityFilter === 'Tous' || t.priority === priorityFilter;
    const matchType = !typeFilter || t.type === typeFilter;
    const matchStatus = !statusFilter || t.status === statusFilter;
    const matchSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.property.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase());
    return matchPriority && matchType && matchStatus && matchSearch;
  });

  // Cost total for currently filtered tickets
  const totalCost = filtered.reduce((sum, t) => sum + (parseFloat(t.devisAmount) || 0), 0);

  const quickStats = [
    {
      label: 'Ouverts',
      value: tickets.filter((t) => t.status === 'En attente').length,
      icon: 'pending_actions',
      color: 'bg-primary-container/20 text-on-primary-container',
      status: 'En attente',
    },
    {
      label: 'En Cours',
      value: tickets.filter((t) => t.status === 'En cours').length,
      icon: 'engineering',
      color: 'bg-tertiary/10 text-tertiary',
      status: 'En cours',
    },
    {
      label: 'Résolus',
      value: tickets.filter((t) => t.status === 'Résolu').length,
      icon: 'check_circle',
      color: 'bg-green-100 text-green-700',
      status: 'Résolu',
    },
    {
      label: 'Coût total estimé',
      value: tickets.reduce((s, t) => s + (parseFloat(t.devisAmount) || 0), 0).toLocaleString('fr-FR') + ' FCFA',
      icon: 'payments',
      color: 'bg-amber-100 text-amber-700',
      wide: true,
    },
  ];

  const handleSubmit = () => {
    const newTicket = {
      id: `MNT-${9000 + tickets.length}`,
      ...form,
      reportedAt: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      technician: null,
      status: 'En attente',
    };
    dispatch({ type: 'ADD_TICKET', payload: newTicket });
    setModalOpen(false);
    setForm(newTicketForm0);
  };

  const advanceStatus = (ticketId) => {
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    const idx = STATUS_STEPS.indexOf(ticket.status);
    const next = STATUS_STEPS[Math.min(idx + 1, STATUS_STEPS.length - 1)];
    dispatch({ type: 'UPDATE_TICKET', payload: { ...ticket, status: next } });
  };

  const handleAssign = () => {
    if (!assignModal || !technicianName.trim()) return;
    dispatch({
      type: 'UPDATE_TICKET',
      payload: { ...assignModal, technician: { name: technicianName.trim() }, status: 'En cours' },
    });
    setAssignModal(null);
    setTechnicianName('');
  };

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-7xl mx-auto flex flex-col gap-gutter">

      {/* Quick Stats Header */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        {quickStats.map((s) => {
          const clickable = !!s.status;
          const active = clickable && statusFilter === s.status;
          return (
            <div
              key={s.label}
              onClick={clickable ? () => setStatusFilter(active ? null : s.status) : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setStatusFilter(active ? null : s.status); } } : undefined}
              className={`bg-surface-container-lowest rounded-xl p-md shadow-card border flex items-center gap-md ${active ? 'border-primary ring-2 ring-primary/40' : 'border-outline-variant/20'} ${clickable ? 'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary/40' : ''}`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${s.color}`}>
                <Icon name={s.icon} size={22} />
              </div>
              <div className="min-w-0">
                <p className="text-on-surface-variant text-label-sm font-label-sm uppercase tracking-wider">{s.label}</p>
                <p className={`font-bold text-on-surface truncate ${s.wide ? 'text-body-md' : 'font-h2 text-h2'}`}>{s.value}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Filters */}
      <div className="bg-surface-container-lowest rounded-xl p-sm shadow-card border border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center gap-md">
        <div className="relative w-full sm:w-80">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
          <input
            type="text"
            placeholder="Rechercher par ID, propriété, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-md py-xs border border-outline-variant rounded-lg bg-surface-container-low text-body-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-xs flex-1">
          {PRIORITY_FILTERS.map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${
                priorityFilter === p
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {p}
            </button>
          ))}
          <div className="w-px h-5 bg-outline-variant/40 mx-1 hidden sm:block" />
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className={`px-sm py-xs rounded-full text-label-sm font-label-sm whitespace-nowrap transition-colors ${
                typeFilter === t
                  ? 'bg-secondary text-on-secondary'
                  : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {canCreate && (
          <Button icon="add_circle" onClick={() => setModalOpen(true)} className="ml-auto flex-shrink-0">
            Nouveau Ticket
          </Button>
        )}
      </div>

      {/* Filtered cost banner (shown when filter is active) */}
      {(priorityFilter !== 'Tous' || typeFilter || search) && filtered.length > 0 && totalCost > 0 && (
        <div className="flex items-center gap-sm bg-amber-50 border border-amber-200 rounded-xl px-md py-sm text-amber-800 text-body-sm">
          <Icon name="payments" size={16} />
          <span>Coût estimé pour la sélection&nbsp;: <strong>{totalCost.toLocaleString('fr-FR')} FCFA</strong></span>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-xl text-on-surface-variant">
          <Icon name="construction" size={48} className="mb-md opacity-40" />
          <p className="text-body-lg">Aucun ticket trouvé</p>
        </div>
      )}

      {/* Ticket grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
        {filtered.map((ticket) => {
          const { icon: sIcon, color: sColor } = statusIconMap[ticket.status] || {};
          return (
            <div
              key={ticket.id}
              onClick={() => setDetailTicket(ticket)}
              className={`bg-surface-container-lowest rounded-xl shadow-card overflow-hidden hover:shadow-modal transition-all duration-300 cursor-pointer ${priorityBorderColor[ticket.priority] || ''}`}
            >
              <div className="p-md">
                {/* Header */}
                <div className="flex justify-between items-start mb-sm">
                  <Badge label={ticket.priority} />
                  <div className="flex items-center gap-1">
                    <span className="text-label-sm text-on-surface-variant">{ticket.id}</span>
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Supprimer le ticket "${ticket.title}" ?`)) {
                            dispatch({ type: 'DELETE_TICKET', payload: ticket.id });
                          }
                        }}
                        className="ml-1 p-1 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"
                        title="Supprimer"
                      >
                        <Icon name="delete" size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="font-h3 text-h3 text-on-surface mb-xs">{ticket.title}</h3>
                <p className="text-body-sm text-on-surface-variant mb-md line-clamp-2">{ticket.description}</p>

                {/* Details */}
                <div className="flex flex-col gap-xs border-y border-outline-variant/20 py-sm mb-md">
                  <div className="flex items-center gap-sm text-on-surface-variant text-body-sm">
                    <Icon name="apartment" size={16} />
                    <span>{ticket.property}</span>
                  </div>
                  <div className="flex items-center gap-sm text-on-surface-variant text-body-sm">
                    <Icon name="door_front" size={16} />
                    <span>{ticket.unit}</span>
                  </div>
                  <div className="flex items-center gap-sm text-on-surface-variant text-body-sm">
                    <Icon name="calendar_today" size={16} />
                    <span>Signalé le : {ticket.reportedAt}</span>
                  </div>
                  {ticket.prestataire && (
                    <div className="flex items-center gap-sm text-on-surface-variant text-body-sm">
                      <Icon name="handyman" size={16} />
                      <span>{ticket.prestataire}</span>
                    </div>
                  )}
                  {ticket.devisAmount && (
                    <div className="flex items-center gap-sm text-amber-700 text-body-sm font-medium">
                      <Icon name="payments" size={16} />
                      <span>{parseFloat(ticket.devisAmount).toLocaleString('fr-FR')} FCFA</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-xs">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${sColor}`}>
                      <Icon name={sIcon} size={14} />
                    </div>
                    <span className="text-label-sm text-on-surface-variant">{ticket.status}</span>
                  </div>
                  <div>
                    {ticket.technician ? (
                      <div className="flex items-center gap-xs">
                        <div className="w-7 h-7 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container text-xs font-bold">
                          {ticket.technician.name.charAt(0)}
                        </div>
                        <span className="text-label-sm text-on-surface">{ticket.technician.name}</span>
                      </div>
                    ) : canEdit ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssignModal(ticket); setTechnicianName(''); }}
                        className="px-sm py-xs bg-primary-container text-on-primary-container rounded-lg text-label-sm font-label-sm hover:brightness-95 transition-all flex items-center gap-1"
                      >
                        <Icon name="person_add" size={14} />
                        Assigner
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── New Ticket Modal ────────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setForm(newTicketForm0); }}
        title="Créer un Ticket Maintenance"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Annuler</Button>
            {canCreate && (
              <Button icon="add_circle" onClick={handleSubmit}>Créer le Ticket</Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-md">
          <Input
            label="Titre du problème"
            placeholder="Ex: Fuite robinet cuisine"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
          />
          <div>
            <label className="text-label-md font-label-md text-on-surface-variant block mb-1">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Décrivez le problème en détail..."
              rows={3}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-md py-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <Select
              label="Priorité"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              options={['Urgent', 'Moyen', 'Bas'].map((p) => ({ value: p, label: p }))}
              required
            />
            <Select
              label="Type d'incident"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              options={['Plomberie', 'HVAC', 'Électricité', 'Autre'].map((t) => ({ value: t, label: t }))}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <Input
              label="Propriété"
              placeholder="Nom de la propriété"
              value={form.property}
              onChange={(e) => setForm((f) => ({ ...f, property: e.target.value }))}
              icon="apartment"
              required
            />
            <Input
              label="Unité / Appartement"
              placeholder="Ex: Apt 302"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              icon="door_front"
            />
          </div>

          {/* Prestataire section */}
          <div className="border-t border-outline-variant/30 pt-md">
            <p className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wider mb-md">Prestataire (optionnel)</p>
            <div className="flex flex-col gap-md">
              <div>
                <label className="text-label-md font-label-md text-on-surface-variant block mb-1">Prestataire</label>
                <select
                  value={form.prestataire}
                  onChange={(e) => {
                    const name = e.target.value;
                    const p = prestataires.find(x => x.name === name);
                    setForm((f) => ({
                      ...f,
                      prestataire: name,
                      prestatairePhone: p?.phone || f.prestatairePhone,
                      prestataireId: p?.id || '',
                    }));
                  }}
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">— Sélectionner un prestataire —</option>
                  {prestataires.map(p => (
                    <option key={p.id} value={p.name}>{p.name}{p.company ? ` (${p.company})` : ''} — {p.specialty}</option>
                  ))}
                  <option value="__manual__">✏️ Saisie manuelle…</option>
                </select>
                {(form.prestataire === '__manual__' || (form.prestataire && !prestataires.find(p => p.name === form.prestataire))) && (
                  <input
                    className="mt-2 w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                    placeholder="Nom du prestataire"
                    value={form.prestataire === '__manual__' ? '' : form.prestataire}
                    onChange={(e) => setForm((f) => ({ ...f, prestataire: e.target.value }))}
                  />
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                <Input
                  label="Téléphone prestataire"
                  placeholder="Ex: +225 07 00 00 00"
                  value={form.prestatairePhone}
                  onChange={(e) => setForm((f) => ({ ...f, prestatairePhone: e.target.value }))}
                  icon="phone"
                  type="tel"
                />
                <Input
                  label="Montant devis FCFA"
                  placeholder="Ex: 150000"
                  value={form.devisAmount}
                  onChange={(e) => setForm((f) => ({ ...f, devisAmount: e.target.value }))}
                  icon="payments"
                  type="number"
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Ticket Detail Modal ─────────────────────────────────────────── */}
      <Modal
        open={!!detailTicket}
        onClose={() => setDetailTicket(null)}
        title={detailTicket?.title || ''}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailTicket(null)}>Fermer</Button>
            {canDelete && (
              <Button
                variant="secondary"
                icon="delete"
                onClick={() => {
                  if (window.confirm(`Supprimer le ticket "${detailTicket?.title}" ?`)) {
                    dispatch({ type: 'DELETE_TICKET', payload: detailTicket.id });
                    setDetailTicket(null);
                  }
                }}
                className="text-error border-error/30 hover:bg-error/10"
              >
                Supprimer
              </Button>
            )}
            {canEdit && detailTicket?.status !== 'Résolu' && (
              <Button
                icon="arrow_forward"
                onClick={() => {
                  advanceStatus(detailTicket.id);
                  const idx = STATUS_STEPS.indexOf(detailTicket.status);
                  const next = STATUS_STEPS[Math.min(idx + 1, STATUS_STEPS.length - 1)];
                  setDetailTicket((prev) => prev ? { ...prev, status: next } : null);
                }}
              >
                {detailTicket?.status === 'En attente' ? 'Démarrer' : 'Marquer Résolu'}
              </Button>
            )}
          </>
        }
      >
        {detailTicket && (
          <div className="flex flex-col gap-md">
            <div className="flex flex-wrap gap-sm">
              <Badge label={detailTicket.priority} />
              <Badge label={detailTicket.type} variant="type" />
              <Badge label={detailTicket.status} />
            </div>
            <p className="text-body-md text-on-surface-variant">{detailTicket.description}</p>

            <div className="grid grid-cols-2 gap-sm text-body-sm">
              <div className="bg-surface-container rounded-xl p-sm">
                <p className="text-on-surface-variant text-label-sm mb-1">Propriété</p>
                <p className="text-on-surface font-medium">{detailTicket.property}</p>
              </div>
              <div className="bg-surface-container rounded-xl p-sm">
                <p className="text-on-surface-variant text-label-sm mb-1">Unité</p>
                <p className="text-on-surface font-medium">{detailTicket.unit}</p>
              </div>
              <div className="bg-surface-container rounded-xl p-sm">
                <p className="text-on-surface-variant text-label-sm mb-1">Signalé le</p>
                <p className="text-on-surface font-medium">{detailTicket.reportedAt}</p>
              </div>
              <div className="bg-surface-container rounded-xl p-sm">
                <p className="text-on-surface-variant text-label-sm mb-1">Technicien</p>
                <p className="text-on-surface font-medium">{detailTicket.technician?.name || 'Non assigné'}</p>
              </div>
            </div>

            {/* Prestataire info in detail — always visible */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-sm flex flex-col gap-xs">
              <p className="text-label-sm font-label-sm text-amber-800 uppercase tracking-wider mb-1">Prestataire</p>
              <div className="flex items-center gap-sm text-body-sm text-amber-900">
                <Icon name="handyman" size={15} />
                <span className="font-medium">{detailTicket.prestataire || <span className="italic opacity-60">Non défini</span>}</span>
              </div>
              <div className="flex items-center gap-sm text-body-sm text-amber-900">
                <Icon name="phone" size={15} />
                {detailTicket.prestatairePhone
                  ? <a href={`tel:${detailTicket.prestatairePhone}`} className="hover:underline">{detailTicket.prestatairePhone}</a>
                  : <span className="italic opacity-60">—</span>}
              </div>
              <div className="flex items-center gap-sm text-body-sm text-amber-900 font-semibold">
                <Icon name="payments" size={15} />
                <span>{detailTicket.devisAmount ? parseFloat(detailTicket.devisAmount).toLocaleString('fr-FR') + ' FCFA' : <span className="italic font-normal opacity-60">Aucun devis</span>}</span>
              </div>
            </div>

            {/* Progress stepper */}
            <div className="flex items-center justify-between mt-sm">
              {STATUS_STEPS.map((step, i) => {
                const currentIdx = STATUS_STEPS.indexOf(detailTicket.status);
                const active = currentIdx >= i;
                const isCurrent = currentIdx === i;
                return (
                  <div key={step} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors border-2 ${
                        active
                          ? isCurrent
                            ? 'bg-primary text-on-primary border-primary shadow-sm'
                            : 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container text-on-surface-variant border-outline-variant/40'
                      }`}>
                        {active && !isCurrent
                          ? <Icon name="check" size={15} />
                          : <span className="text-xs font-bold">{i + 1}</span>
                        }
                      </div>
                      <span className={`text-[10px] text-center font-medium leading-tight ${
                        isCurrent ? 'text-primary font-bold' : active ? 'text-primary' : 'text-on-surface-variant'
                      }`}>{step}</span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 transition-colors ${currentIdx > i ? 'bg-primary' : 'bg-outline-variant/40'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Assign Technician Modal ─────────────────────────────────────── */}
      <Modal
        open={!!assignModal}
        onClose={() => setAssignModal(null)}
        title="Assigner un Technicien"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignModal(null)}>Annuler</Button>
            {canEdit && (
              <Button icon="person_add" onClick={handleAssign} disabled={!technicianName.trim()}>
                Assigner
              </Button>
            )}
          </>
        }
      >
        {assignModal && (
          <div className="flex flex-col gap-md">
            <div className="p-md bg-surface-container rounded-xl">
              <p className="text-label-sm text-on-surface-variant">Ticket</p>
              <p className="text-label-md font-label-md text-on-surface font-bold">{assignModal.title}</p>
              <p className="text-body-sm text-on-surface-variant mt-0.5">{assignModal.property} — {assignModal.unit}</p>
            </div>
            <Input
              label="Nom du technicien"
              placeholder="Ex: Jean-Marc Diallo"
              value={technicianName}
              onChange={e => setTechnicianName(e.target.value)}
              icon="engineering"
              required
            />
            <p className="text-body-sm text-on-surface-variant">
              Le statut du ticket passera automatiquement à <strong>"En cours"</strong>.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
