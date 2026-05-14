import { useState } from 'react';
import { useApp } from '../context/AppContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input, { Select } from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Icon from '../components/Icon';

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
};

export default function Maintenance() {
  const { state, dispatch } = useApp();
  const tickets = state.tickets || [];
  const [priorityFilter, setPriorityFilter] = useState('Tous');
  const [typeFilter, setTypeFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [technicianName, setTechnicianName] = useState('');
  const [form, setForm] = useState(newTicketForm0);

  const filtered = tickets.filter((t) => {
    const matchPriority = priorityFilter === 'Tous' || t.priority === priorityFilter;
    const matchType = !typeFilter || t.type === typeFilter;
    const matchSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.property.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase());
    return matchPriority && matchType && matchSearch;
  });

  const stats = [
    { label: 'Urgent', value: tickets.filter((t) => t.priority === 'Urgent').length, icon: 'priority_high', color: 'bg-error/10 text-error' },
    { label: 'En Attente', value: tickets.filter((t) => t.status === 'En attente').length, icon: 'pending_actions', color: 'bg-primary-container/20 text-on-primary-container' },
    { label: 'En Cours', value: tickets.filter((t) => t.status === 'En cours').length, icon: 'engineering', color: 'bg-tertiary/10 text-tertiary' },
    { label: 'Résolu', value: tickets.filter((t) => t.status === 'Résolu').length, icon: 'check_circle', color: 'bg-green-100 text-green-700' },
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

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-gutter">
        {stats.map((s) => (
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

        <Button icon="add_circle" onClick={() => setModalOpen(true)} className="ml-auto flex-shrink-0">
          Nouveau Ticket
        </Button>
      </div>

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
                  <span className="text-label-sm text-on-surface-variant">{ticket.id}</span>
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
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setAssignModal(ticket); setTechnicianName(''); }}
                        className="px-sm py-xs bg-primary-container text-on-primary-container rounded-lg text-label-sm font-label-sm hover:brightness-95 transition-all flex items-center gap-1"
                      >
                        <Icon name="person_add" size={14} />
                        Assigner
                      </button>
                    )}
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
            <Button icon="add_circle" onClick={handleSubmit}>Créer le Ticket</Button>
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
            {detailTicket?.status !== 'Résolu' && (
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

            {/* Progress tracker */}
            <div className="flex items-center justify-between mt-sm">
              {STATUS_STEPS.map((step, i) => {
                const active = STATUS_STEPS.indexOf(detailTicket.status) >= i;
                return (
                  <div key={step} className="flex items-center flex-1">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                        {active ? <Icon name="check" size={14} /> : <span className="text-xs">{i + 1}</span>}
                      </div>
                      <span className={`text-[10px] text-center font-medium ${active ? 'text-primary' : 'text-on-surface-variant'}`}>{step}</span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 transition-colors ${STATUS_STEPS.indexOf(detailTicket.status) > i ? 'bg-primary' : 'bg-outline-variant/40'}`} />
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
            <Button icon="person_add" onClick={handleAssign} disabled={!technicianName.trim()}>
              Assigner
            </Button>
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
