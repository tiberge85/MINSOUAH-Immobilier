import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const PRIORITY_CLS = {
  Urgent: 'bg-error/10 text-error border-error/20',
  Moyen:  'bg-amber-50 text-amber-700 border-amber-200',
  Bas:    'bg-surface-container text-on-surface-variant border-outline-variant/20',
};
const PRIORITY_DOT = {
  Urgent: 'bg-error',
  Moyen:  'bg-amber-500',
  Bas:    'bg-on-surface-variant/40',
};
const STATUS_CLS = {
  'En attente': 'bg-amber-100 text-amber-800',
  'En cours':   'bg-blue-100 text-blue-800',
  Résolu:       'bg-green-100 text-green-700',
  Fermé:        'bg-surface-container text-on-surface-variant',
};

export default function ConciergePortal() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const {
    tickets = [],
    inspections = [],
    conversations = [],
    currentUser,
    properties = [],
  } = state;

  const [activeTab, setActiveTab] = useState('overview');
  const [ticketFilter, setTicketFilter] = useState('Tous');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newTicket, setNewTicket] = useState({
    title: '', description: '', property: '', priority: 'Moyen', type: 'Autre',
  });

  const today = new Date();
  const todayStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const openTickets    = tickets.filter(t => t.status !== 'Résolu' && t.status !== 'Fermé');
  const urgentTickets  = openTickets.filter(t => t.priority === 'Urgent');
  const unreadMsgs     = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  const todayInspections = inspections.filter(i => {
    if (!i.scheduledDate) return false;
    const d = new Date(i.scheduledDate);
    return d.getFullYear() === today.getFullYear() &&
           d.getMonth()     === today.getMonth() &&
           d.getDate()       === today.getDate();
  });

  // ── Filtered tickets ───────────────────────────────────────────────────────
  const filteredTickets = useMemo(() => {
    if (ticketFilter === 'Tous') return openTickets;
    if (ticketFilter === 'Urgent') return openTickets.filter(t => t.priority === 'Urgent');
    return openTickets.filter(t => t.status === ticketFilter);
  }, [openTickets, ticketFilter]);

  // ── Create ticket ──────────────────────────────────────────────────────────
  const handleCreateTicket = () => {
    if (!newTicket.title.trim()) return;
    dispatch({
      type: 'ADD_TICKET',
      payload: {
        id: `MNT-${Date.now().toString().slice(-4)}`,
        ...newTicket,
        reportedAt: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
        status: 'En attente',
        technician: null,
        assignedTo: currentUser?.name,
      },
    });
    setNewTicket({ title: '', description: '', property: '', priority: 'Moyen', type: 'Autre' });
    setShowNewTicket(false);
  };

  // ── Update ticket status ───────────────────────────────────────────────────
  const setTicketStatus = (ticket, status) => {
    dispatch({ type: 'UPDATE_TICKET', payload: { ...ticket, status } });
  };

  const TABS = [
    { id: 'overview',     label: 'Vue d\'ensemble', icon: 'dashboard' },
    { id: 'tickets',      label: 'Tickets',          icon: 'engineering' },
    { id: 'inspections',  label: 'Inspections',      icon: 'home_work' },
    { id: 'messages',     label: 'Messages',          icon: 'mail' },
  ];

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-6xl mx-auto flex flex-col gap-gutter">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary to-primary/80 text-on-primary rounded-2xl px-6 py-5 relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10">
          <Icon name="supervised_user_circle" size={80} />
        </div>
        <div className="relative">
          <p className="text-on-primary/70 text-sm capitalize">{todayStr}</p>
          <h1 className="font-black text-2xl sm:text-3xl mt-1">
            Bonjour, {currentUser?.name?.split(' ')[0] || 'Concierge'}
          </h1>
          <p className="text-on-primary/80 text-sm mt-1">Espace de gestion concierge</p>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
        {[
          { label: 'Tickets ouverts', value: openTickets.length, icon: 'engineering', color: openTickets.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700' },
          { label: 'Urgents',         value: urgentTickets.length, icon: 'warning',    color: urgentTickets.length > 0 ? 'bg-error/10 text-error' : 'bg-green-100 text-green-700' },
          { label: 'Inspections auj.', value: todayInspections.length, icon: 'home_work', color: 'bg-primary/10 text-primary' },
          { label: 'Messages non lus', value: unreadMsgs,        icon: 'mail',         color: unreadMsgs > 0 ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant' },
        ].map(k => (
          <div key={k.label} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-sm ${k.color}`}>
              <Icon name={k.icon} size={18} />
            </div>
            <p className="font-black text-2xl text-on-surface">{k.value}</p>
            <p className="text-label-sm text-on-surface-variant">{k.label}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-surface-container rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap py-2 px-3 sm:px-4 rounded-lg text-label-sm font-bold transition-all flex-1 justify-center ${
              activeTab === t.id ? 'bg-surface-container-lowest shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}>
            <Icon name={t.icon} size={16} filled={activeTab === t.id} />
            <span className="hidden sm:inline">{t.label}</span>
            {t.id === 'tickets' && openTickets.length > 0 && (
              <span className="bg-error text-on-error text-[10px] font-black px-1.5 py-0.5 rounded-full">{openTickets.length}</span>
            )}
            {t.id === 'messages' && unreadMsgs > 0 && (
              <span className="bg-primary text-on-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{unreadMsgs}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW ════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">

          {/* Tickets urgents */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="flex items-center justify-between px-md py-md border-b border-outline-variant/10">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <Icon name="warning" className="text-error" size={18} />
                Tickets urgents
              </h3>
              <button onClick={() => { setActiveTab('tickets'); setTicketFilter('Urgent'); }}
                className="text-label-sm text-primary hover:underline">Voir tout</button>
            </div>
            {urgentTickets.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <Icon name="check_circle" size={32} className="opacity-30 mb-2 text-green-600" />
                <p className="text-sm font-medium">Aucun ticket urgent</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {urgentTickets.slice(0, 4).map(t => (
                  <div key={t.id} className="px-md py-3 flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-error mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{t.title}</p>
                      <p className="text-xs text-on-surface-variant">{t.property} {t.unit ? `• ${t.unit}` : ''}</p>
                    </div>
                    <span className={`text-label-sm px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CLS[t.status] || ''}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inspections aujourd'hui */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="flex items-center justify-between px-md py-md border-b border-outline-variant/10">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <Icon name="home_work" className="text-primary" size={18} />
                Inspections aujourd'hui
              </h3>
              <button onClick={() => navigate('/inspections')} className="text-label-sm text-primary hover:underline">Gérer</button>
            </div>
            {todayInspections.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <Icon name="event_available" size={32} className="opacity-30 mb-2" />
                <p className="text-sm font-medium">Aucune inspection prévue aujourd'hui</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {todayInspections.map(i => (
                  <div key={i.id} className="px-md py-3 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${i.type === 'ENTRY' ? 'bg-tertiary/10' : 'bg-error/10'}`}>
                      <Icon name={i.type === 'ENTRY' ? 'login' : 'logout'} size={18} className={i.type === 'ENTRY' ? 'text-tertiary' : 'text-error'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{i.propertyName}</p>
                      <p className="text-xs text-on-surface-variant">{i.tenantName} — {i.type === 'ENTRY' ? 'Entrée' : 'Sortie'}</p>
                    </div>
                    <span className="text-xs text-on-surface-variant">
                      {i.scheduledDate ? new Date(i.scheduledDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages récents */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
            <div className="flex items-center justify-between px-md py-md border-b border-outline-variant/10">
              <h3 className="font-bold text-on-surface flex items-center gap-2">
                <Icon name="mail" className="text-primary" size={18} />
                Messages récents
              </h3>
              <button onClick={() => navigate('/inbox')} className="text-label-sm text-primary hover:underline">Ouvrir</button>
            </div>
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <Icon name="mail_outline" size={32} className="opacity-30 mb-2" />
                <p className="text-sm font-medium">Aucun message</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {conversations.slice(0, 4).map(c => (
                  <button key={c.id} onClick={() => navigate('/inbox')}
                    className="w-full px-md py-3 flex items-center gap-3 hover:bg-surface-container transition-colors text-left">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                      {c.contact?.initials || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm flex items-center gap-2">
                        {c.contact?.name}
                        {(c.unread || 0) > 0 && (
                          <span className="bg-primary text-on-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{c.unread}</span>
                        )}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">{c.lastMessage}</p>
                    </div>
                    <span className="text-[10px] text-on-surface-variant flex-shrink-0">{c.time}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions rapides */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md">
            <h3 className="font-bold text-on-surface mb-md flex items-center gap-2">
              <Icon name="bolt" className="text-primary" size={18} />
              Actions rapides
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Nouveau ticket',   icon: 'add_circle',   color: 'bg-primary text-on-primary',           action: () => { setActiveTab('tickets'); setShowNewTicket(true); } },
                { label: 'Messagerie',       icon: 'chat',          color: 'bg-secondary text-on-secondary',       action: () => navigate('/inbox') },
                { label: 'Inspections',      icon: 'home_work',    color: 'bg-tertiary/10 text-tertiary',          action: () => navigate('/inspections') },
                { label: 'Maintenance',      icon: 'engineering',  color: 'bg-amber-100 text-amber-700',           action: () => navigate('/maintenance') },
              ].map(a => (
                <button key={a.label} onClick={a.action}
                  className={`flex items-center gap-3 p-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 active:scale-95 ${a.color}`}>
                  <Icon name={a.icon} size={20} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ TICKETS ═════════════════════════════════════════════════════════ */}
      {activeTab === 'tickets' && (
        <div className="flex flex-col gap-gutter">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {['Tous', 'Urgent', 'En attente', 'En cours'].map(f => (
                <button key={f} onClick={() => setTicketFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-label-sm font-semibold transition-colors ${ticketFilter === f ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewTicket(v => !v)}
              className="ml-auto flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-label-sm font-bold hover:bg-primary/90 transition-colors">
              <Icon name={showNewTicket ? 'close' : 'add'} size={16} />
              {showNewTicket ? 'Annuler' : 'Nouveau ticket'}
            </button>
          </div>

          {/* New ticket form */}
          {showNewTicket && (
            <div className="bg-surface-container-lowest rounded-xl border border-primary/30 p-md shadow-card">
              <h4 className="font-bold text-on-surface mb-md flex items-center gap-2">
                <Icon name="add_circle" className="text-primary" size={18} />
                Signaler un problème
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Titre*</label>
                  <input value={newTicket.title} onChange={e => setNewTicket(t => ({ ...t, title: e.target.value }))}
                    placeholder="Ex: Fuite d'eau dans la cuisine" maxLength={80}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Bien</label>
                  <select value={newTicket.property} onChange={e => setNewTicket(t => ({ ...t, property: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm">
                    <option value="">— Sélectionner —</option>
                    {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Priorité</label>
                  <select value={newTicket.priority} onChange={e => setNewTicket(t => ({ ...t, priority: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm">
                    {['Urgent', 'Moyen', 'Bas'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Type</label>
                  <select value={newTicket.type} onChange={e => setNewTicket(t => ({ ...t, type: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm">
                    {['Plomberie', 'Électricité', 'HVAC', 'Peinture', 'Serrurerie', 'Autre'].map(ty => <option key={ty}>{ty}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Description</label>
                  <textarea value={newTicket.description} onChange={e => setNewTicket(t => ({ ...t, description: e.target.value }))}
                    placeholder="Décrivez le problème en détail..." rows={3}
                    className="w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm resize-none" />
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowNewTicket(false)}
                  className="px-4 py-2 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors">
                  Annuler
                </button>
                <button onClick={handleCreateTicket} disabled={!newTicket.title.trim()}
                  className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2">
                  <Icon name="send" size={16} />Signaler
                </button>
              </div>
            </div>
          )}

          {/* Ticket list */}
          {filteredTickets.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/20">
              <Icon name="check_circle" size={48} className="opacity-30 mb-sm text-green-600" />
              <p className="font-bold">Aucun ticket ouvert</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTickets.map(t => (
                <div key={t.id} className={`bg-surface-container-lowest rounded-xl border p-md ${PRIORITY_CLS[t.priority] || 'border-outline-variant/20'}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-outline'}`} />
                      <span className="font-mono text-label-sm text-on-surface-variant">{t.id}</span>
                      <span className={`text-label-sm px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[t.status] || ''}`}>{t.status}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {t.status === 'En attente' && (
                        <button onClick={() => setTicketStatus(t, 'En cours')}
                          className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-semibold hover:bg-blue-200 transition-colors">
                          Prendre en charge
                        </button>
                      )}
                      {t.status === 'En cours' && (
                        <button onClick={() => setTicketStatus(t, 'Résolu')}
                          className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg font-semibold hover:bg-green-200 transition-colors">
                          Marquer résolu
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-on-surface">{t.title}</p>
                  <p className="text-body-sm text-on-surface-variant mt-1 line-clamp-2">{t.description}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-label-sm text-on-surface-variant">
                    <span className="flex items-center gap-1"><Icon name="apartment" size={13} />{t.property}{t.unit ? ` — ${t.unit}` : ''}</span>
                    <span className="flex items-center gap-1"><Icon name="calendar_today" size={13} />{t.reportedAt}</span>
                    {t.assignedTo && <span className="flex items-center gap-1"><Icon name="person" size={13} />{t.assignedTo}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ INSPECTIONS ═════════════════════════════════════════════════════ */}
      {activeTab === 'inspections' && (
        <div className="flex flex-col gap-gutter">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            {[
              { label: 'Total',     value: inspections.length,                                icon: 'checklist',   color: 'bg-primary/10 text-primary' },
              { label: "Auj.",      value: todayInspections.length,                           icon: 'today',       color: 'bg-tertiary/10 text-tertiary' },
              { label: 'Entrées',   value: inspections.filter(i => i.type === 'ENTRY').length, icon: 'login',      color: 'bg-green-100 text-green-700' },
              { label: 'Sorties',   value: inspections.filter(i => i.type === 'EXIT').length,  icon: 'logout',     color: 'bg-error/10 text-error' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-md text-center ${s.color.split(' ')[0]} border border-current/10`}>
                <Icon name={s.icon} size={20} className={s.color.split(' ')[1]} />
                <p className={`font-black text-h2 mt-1 ${s.color.split(' ')[1]}`}>{s.value}</p>
                <p className="text-label-sm text-on-surface-variant">{s.label}</p>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/inspections')}
            className="flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors">
            <Icon name="home_work" size={18} />
            Gérer les états des lieux
          </button>

          {inspections.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/20">
              <Icon name="home_work" size={40} className="opacity-30 mb-2" />
              <p className="font-bold">Aucun état des lieux</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {inspections.slice(0, 10).map(i => {
                const STATUS_L = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', PENDING_SIGNATURE: 'Att. signature', COMPLETED: 'Complété' };
                const STATUS_C = { DRAFT: 'bg-slate-100 text-slate-700', IN_PROGRESS: 'bg-blue-100 text-blue-800', PENDING_SIGNATURE: 'bg-amber-100 text-amber-800', COMPLETED: 'bg-green-100 text-green-800' };
                return (
                  <div key={i.id} className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-md flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${i.type === 'ENTRY' ? 'bg-tertiary/10' : 'bg-error/10'}`}>
                      <Icon name={i.type === 'ENTRY' ? 'login' : 'logout'} size={18} className={i.type === 'ENTRY' ? 'text-tertiary' : 'text-error'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-on-surface text-sm">{i.ref}</span>
                        <span className={`text-label-sm px-2 py-0.5 rounded-full font-semibold ${STATUS_C[i.status] || ''}`}>{STATUS_L[i.status] || i.status}</span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate">{i.propertyName} — {i.tenantName}</p>
                      <p className="text-xs text-on-surface-variant">{i.scheduledDate ? new Date(i.scheduledDate).toLocaleDateString('fr-FR') : '—'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ MESSAGES ════════════════════════════════════════════════════════ */}
      {activeTab === 'messages' && (
        <div className="flex flex-col gap-4">
          {conversations.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest rounded-2xl border border-outline-variant/20">
              <Icon name="chat" size={48} className="opacity-30 mb-sm" />
              <p className="font-bold">Aucune conversation</p>
            </div>
          ) : (
            conversations.map(c => (
              <button key={c.id} onClick={() => navigate('/inbox')}
                className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-md hover:border-primary/30 hover:shadow-card transition-all text-left flex items-center gap-md">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${c.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                  {c.contact?.initials || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-bold text-on-surface flex items-center gap-2">
                      {c.contact?.name}
                      {(c.unread || 0) > 0 && (
                        <span className="bg-primary text-on-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{c.unread}</span>
                      )}
                    </p>
                    <span className="text-xs text-on-surface-variant flex-shrink-0">{c.time}</span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant truncate">{c.lastMessage}</p>
                  <p className="text-label-sm text-on-surface-variant/60 mt-0.5">{c.contact?.role}</p>
                </div>
                <Icon name="chevron_right" size={20} className="text-outline flex-shrink-0" />
              </button>
            ))
          )}
          <button onClick={() => navigate('/inbox')}
            className="flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors">
            <Icon name="open_in_new" size={18} />
            Ouvrir la messagerie complète
          </button>
        </div>
      )}
    </div>
  );
}
