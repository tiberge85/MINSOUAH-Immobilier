import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const PRIORITY_CLS = {
  Urgent: 'bg-error/10 text-error border-error/20',
  Moyen:  'bg-amber-50 text-amber-700 border-amber-200',
  Bas:    'bg-surface-container text-on-surface-variant border-outline-variant/20',
};
const PRIORITY_DOT = { Urgent: 'bg-error', Moyen: 'bg-amber-500', Bas: 'bg-on-surface-variant/40' };
const STATUS_CLS = {
  'En attente': 'bg-amber-100 text-amber-800',
  'En cours':   'bg-blue-100 text-blue-800',
  Résolu:       'bg-green-100 text-green-700',
  Fermé:        'bg-surface-container text-on-surface-variant',
};
const INSP_STATUS_L = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', PENDING_SIGNATURE: 'Att. signature', COMPLETED: 'Complété' };
const INSP_STATUS_C = { DRAFT: 'bg-slate-100 text-slate-700', IN_PROGRESS: 'bg-blue-100 text-blue-800', PENDING_SIGNATURE: 'bg-amber-100 text-amber-800', COMPLETED: 'bg-green-100 text-green-800' };

const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm';

export default function ConciergePortal() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { tickets = [], inspections = [], conversations = [], currentUser, properties = [] } = state;

  const [activeTab, setActiveTab] = useState('dashboard');
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [ticketFilter, setTicketFilter] = useState('Tous');
  const [newTicket, setNewTicket] = useState({ title: '', description: '', property: '', priority: 'Moyen', type: 'Autre' });

  const today = new Date();
  const todayStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const openTickets = tickets.filter(t => t.status !== 'Résolu' && t.status !== 'Fermé');
  const urgentTickets = openTickets.filter(t => t.priority === 'Urgent');
  const unreadMsgs = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  const todayInspections = inspections.filter(i => {
    if (!i.scheduledDate) return false;
    const d = new Date(i.scheduledDate);
    return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  });

  const filteredTickets = useMemo(() => {
    if (ticketFilter === 'Tous') return openTickets;
    if (ticketFilter === 'Urgent') return openTickets.filter(t => t.priority === 'Urgent');
    return openTickets.filter(t => t.status === ticketFilter);
  }, [openTickets, ticketFilter]);

  const setTicketStatus = (ticket, status) => dispatch({ type: 'UPDATE_TICKET', payload: { ...ticket, status } });

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

  const TABS = [
    { id: 'dashboard',   label: 'Tableau de bord', icon: 'dashboard' },
    { id: 'tickets',     label: 'Maintenance',      icon: 'engineering',   badge: openTickets.length > 0 ? openTickets.length : null, badgeColor: 'bg-error text-on-error' },
    { id: 'inspections', label: 'États des lieux',  icon: 'home_work',    badge: todayInspections.length > 0 ? todayInspections.length : null, badgeColor: 'bg-tertiary text-on-tertiary' },
    { id: 'messages',    label: 'Messagerie',        icon: 'support_agent', badge: unreadMsgs > 0 ? unreadMsgs : null, badgeColor: 'bg-primary text-on-primary' },
  ];

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-6xl mx-auto flex flex-col gap-gutter">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary to-primary/80 text-on-primary rounded-2xl px-6 py-5 relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10"><Icon name="supervised_user_circle" size={80} /></div>
        <div className="relative">
          <p className="text-on-primary/70 text-sm capitalize">{todayStr}</p>
          <h1 className="font-black text-2xl sm:text-3xl mt-1">
            Bonjour, {currentUser?.name?.split(' ')[0] || 'Concierge'}
          </h1>
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { v: openTickets.length,     l: 'tickets ouverts',  color: openTickets.length > 0 ? 'bg-white/20' : 'bg-white/10' },
              { v: urgentTickets.length,   l: 'urgents',          color: urgentTickets.length > 0 ? 'bg-error/40' : 'bg-white/10' },
              { v: todayInspections.length, l: "inspect. auj.",   color: 'bg-white/10' },
              { v: unreadMsgs,             l: 'non lus',          color: unreadMsgs > 0 ? 'bg-white/20' : 'bg-white/10' },
            ].map(s => (
              <span key={s.l} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.color} text-on-primary/90`}>
                {s.v} {s.l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-surface-container rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 whitespace-nowrap py-2 px-3 sm:px-4 rounded-lg text-sm font-bold transition-all flex-1 justify-center ${
              activeTab === t.id ? 'bg-surface shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}>
            <Icon name={t.icon} size={16} filled={activeTab === t.id} />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            {t.badge && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${t.badgeColor}`}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══ TABLEAU DE BORD ═════════════════════════════════════════════════ */}
      {activeTab === 'dashboard' && (
        <>
          {/* 4 section cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            <button onClick={() => setActiveTab('tickets')}
              className="flex flex-col items-start gap-3 p-4 bg-amber-50 border border-amber-200/60 rounded-2xl hover:bg-amber-100 hover:shadow-md transition-all text-left group">
              <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="engineering" size={22} className="text-amber-700" />
              </div>
              <div>
                <p className="font-bold text-amber-900 text-sm">Maintenance</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {openTickets.length > 0 ? `${openTickets.length} ticket${openTickets.length > 1 ? 's' : ''} ouvert${openTickets.length > 1 ? 's' : ''}` : 'Aucun ticket'}
                </p>
              </div>
              {urgentTickets.length > 0 && (
                <span className="text-[10px] font-black bg-error text-on-error px-1.5 py-0.5 rounded-full">{urgentTickets.length} urgent{urgentTickets.length > 1 ? 's' : ''}</span>
              )}
            </button>

            <button onClick={() => setActiveTab('inspections')}
              className="flex flex-col items-start gap-3 p-4 bg-tertiary/5 border border-tertiary/20 rounded-2xl hover:bg-tertiary/10 hover:shadow-md transition-all text-left group">
              <div className="w-11 h-11 rounded-xl bg-tertiary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="home_work" size={22} className="text-tertiary" />
              </div>
              <div>
                <p className="font-bold text-on-surface text-sm">États des lieux</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {todayInspections.length > 0 ? `${todayInspections.length} aujourd'hui` : `${inspections.length} total`}
                </p>
              </div>
              {todayInspections.length > 0 && (
                <span className="text-[10px] font-black bg-tertiary text-on-tertiary px-1.5 py-0.5 rounded-full">{todayInspections.length} auj.</span>
              )}
            </button>

            <button onClick={() => setActiveTab('messages')}
              className="flex flex-col items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-2xl hover:bg-primary/10 hover:shadow-md transition-all text-left group">
              <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="support_agent" size={22} className="text-primary" />
              </div>
              <div>
                <p className="font-bold text-on-surface text-sm">Messagerie</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {unreadMsgs > 0 ? `${unreadMsgs} non lu${unreadMsgs > 1 ? 's' : ''}` : 'Aucun nouveau message'}
                </p>
              </div>
              {unreadMsgs > 0 && <span className="text-[10px] font-black bg-primary text-on-primary px-1.5 py-0.5 rounded-full">{unreadMsgs}</span>}
            </button>

            <button onClick={() => { setActiveTab('tickets'); setShowNewTicket(true); }}
              className="flex flex-col items-start gap-3 p-4 bg-green-50 border border-green-200/60 rounded-2xl hover:bg-green-100 hover:shadow-md transition-all text-left group">
              <div className="w-11 h-11 rounded-xl bg-green-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="add_circle" size={22} className="text-green-700" />
              </div>
              <div>
                <p className="font-bold text-green-900 text-sm">Signaler</p>
                <p className="text-xs text-green-700 mt-0.5">Nouveau ticket</p>
              </div>
            </button>
          </div>

          {/* Contenu dashboard 2 colonnes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
            {/* Tickets à traiter */}
            <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant/20 shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
                <h3 className="font-bold text-on-surface flex items-center gap-2">
                  <Icon name="engineering" className="text-amber-600" size={18} />
                  Tickets à traiter
                  {openTickets.length > 0 && <span className="bg-error/10 text-error text-xs font-black px-2 py-0.5 rounded-full">{openTickets.length}</span>}
                </h3>
                <button onClick={() => setActiveTab('tickets')} className="text-xs text-primary hover:underline font-semibold flex items-center gap-1">
                  Voir tout <Icon name="arrow_forward" size={13} />
                </button>
              </div>
              {openTickets.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant">
                  <Icon name="check_circle" size={36} className="opacity-30 mb-2 text-green-600" />
                  <p className="font-semibold text-sm">Aucun ticket ouvert</p>
                </div>
              ) : (
                <div className="divide-y divide-outline-variant/10">
                  {openTickets.slice(0, 5).map(t => (
                    <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-outline'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-on-surface text-sm truncate">{t.title}</p>
                        <p className="text-xs text-on-surface-variant">{t.property}{t.unit ? ` — ${t.unit}` : ''}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${STATUS_CLS[t.status] || ''}`}>{t.status}</span>
                      {t.status === 'En attente' && (
                        <button onClick={() => setTicketStatus(t, 'En cours')} className="text-[11px] bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-semibold hover:bg-blue-200 flex-shrink-0">
                          Prendre en charge
                        </button>
                      )}
                      {t.status === 'En cours' && (
                        <button onClick={() => setTicketStatus(t, 'Résolu')} className="text-[11px] bg-green-100 text-green-700 px-2 py-1 rounded-lg font-semibold hover:bg-green-200 flex-shrink-0">
                          Résolu
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Colonne droite */}
            <div className="flex flex-col gap-md">
              {/* Inspections du jour */}
              <div className="bg-surface rounded-2xl border border-outline-variant/20 shadow-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                  <h3 className="font-bold text-on-surface flex items-center gap-2 text-sm">
                    <Icon name="home_work" className="text-tertiary" size={15} /> Inspections du jour
                  </h3>
                  <button onClick={() => setActiveTab('inspections')} className="text-xs text-primary hover:underline font-semibold">Voir</button>
                </div>
                {todayInspections.length === 0 ? (
                  <div className="text-center py-6 text-on-surface-variant">
                    <Icon name="event_available" size={26} className="opacity-30 mb-1" />
                    <p className="text-xs">Aucune inspection aujourd'hui</p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant/10">
                    {todayInspections.map(i => (
                      <div key={i.id} className="px-4 py-3 flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${i.type === 'ENTRY' ? 'bg-tertiary/10' : 'bg-error/10'}`}>
                          <Icon name={i.type === 'ENTRY' ? 'login' : 'logout'} size={15} className={i.type === 'ENTRY' ? 'text-tertiary' : 'text-error'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-on-surface text-xs truncate">{i.propertyName}</p>
                          <p className="text-[11px] text-on-surface-variant">{i.tenantName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Messages récents */}
              <div className="bg-surface rounded-2xl border border-outline-variant/20 shadow-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
                  <h3 className="font-bold text-on-surface flex items-center gap-2 text-sm">
                    <Icon name="mail" className="text-primary" size={15} /> Messages
                    {unreadMsgs > 0 && <span className="bg-primary text-on-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{unreadMsgs}</span>}
                  </h3>
                  <button onClick={() => setActiveTab('messages')} className="text-xs text-primary hover:underline font-semibold">Voir</button>
                </div>
                {conversations.length === 0 ? (
                  <div className="text-center py-6 text-on-surface-variant">
                    <Icon name="mail_outline" size={26} className="opacity-30 mb-1" />
                    <p className="text-xs">Aucun message</p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant/10">
                    {conversations.slice(0, 4).map(c => (
                      <button key={c.id} onClick={() => setActiveTab('messages')}
                        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-surface-container transition-colors text-left">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                          {c.contact?.initials || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-on-surface text-xs flex items-center gap-1">
                            {c.contact?.name}
                            {(c.unread || 0) > 0 && <span className="bg-primary text-on-primary text-[9px] font-black px-1 py-0.5 rounded-full">{c.unread}</span>}
                          </p>
                          <p className="text-[11px] text-on-surface-variant truncate">{c.lastMessage}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ MAINTENANCE / TICKETS ═══════════════════════════════════════════ */}
      {activeTab === 'tickets' && (
        <div className="flex flex-col gap-gutter">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {['Tous', 'Urgent', 'En attente', 'En cours'].map(f => (
                <button key={f} onClick={() => setTicketFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${ticketFilter === f ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                  {f}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewTicket(v => !v)}
              className="ml-auto flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">
              <Icon name={showNewTicket ? 'close' : 'add'} size={16} />
              {showNewTicket ? 'Annuler' : 'Nouveau ticket'}
            </button>
          </div>

          {/* Formulaire */}
          {showNewTicket && (
            <div className="bg-surface rounded-2xl border border-primary/30 shadow-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10 bg-primary/5">
                <h3 className="font-bold text-on-surface flex items-center gap-2"><Icon name="add_circle" className="text-primary" size={18} />Signaler un problème</h3>
                <button onClick={() => setShowNewTicket(false)} className="text-on-surface-variant hover:text-on-surface"><Icon name="close" size={20} /></button>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Titre *</label>
                  <input value={newTicket.title} onChange={e => setNewTicket(t => ({ ...t, title: e.target.value }))} placeholder="Ex: Fuite d'eau" maxLength={80} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Bien</label>
                  <select value={newTicket.property} onChange={e => setNewTicket(t => ({ ...t, property: e.target.value }))} className={inputCls}>
                    <option value="">— Sélectionner —</option>
                    {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Priorité</label>
                  <select value={newTicket.priority} onChange={e => setNewTicket(t => ({ ...t, priority: e.target.value }))} className={inputCls}>
                    {['Urgent', 'Moyen', 'Bas'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Type</label>
                  <select value={newTicket.type} onChange={e => setNewTicket(t => ({ ...t, type: e.target.value }))} className={inputCls}>
                    {['Plomberie', 'Électricité', 'HVAC', 'Peinture', 'Serrurerie', 'Autre'].map(ty => <option key={ty}>{ty}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Description</label>
                  <textarea value={newTicket.description} onChange={e => setNewTicket(t => ({ ...t, description: e.target.value }))} rows={3} className={`${inputCls} resize-none`} placeholder="Décrivez le problème…" />
                </div>
              </div>
              <div className="flex gap-3 px-5 pb-5 justify-end">
                <button onClick={() => setShowNewTicket(false)} className="px-4 py-2 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high">Annuler</button>
                <button onClick={handleCreateTicket} disabled={!newTicket.title.trim()} className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                  <Icon name="send" size={16} />Signaler
                </button>
              </div>
            </div>
          )}

          {/* Liste tickets */}
          {filteredTickets.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant bg-surface rounded-2xl border border-outline-variant/20">
              <Icon name="check_circle" size={48} className="opacity-30 mb-2 text-green-600" />
              <p className="font-bold">Aucun ticket dans cette catégorie</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTickets.map(t => (
                <div key={t.id} className={`bg-surface rounded-xl border p-4 ${PRIORITY_CLS[t.priority] || 'border-outline-variant/20'}`}>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-outline'}`} />
                      <span className="font-mono text-xs text-on-surface-variant">{t.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[t.status] || ''}`}>{t.status}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${PRIORITY_CLS[t.priority]}`}>{t.priority}</span>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {t.status === 'En attente' && (
                        <button onClick={() => setTicketStatus(t, 'En cours')} className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-semibold hover:bg-blue-200">Prendre en charge</button>
                      )}
                      {t.status === 'En cours' && (
                        <button onClick={() => setTicketStatus(t, 'Résolu')} className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-lg font-semibold hover:bg-green-200">Marquer résolu</button>
                      )}
                    </div>
                  </div>
                  <p className="font-bold text-on-surface">{t.title}</p>
                  <p className="text-sm text-on-surface-variant mt-1 line-clamp-2">{t.description}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-on-surface-variant">
                    {t.property && <span className="flex items-center gap-1"><Icon name="apartment" size={12} />{t.property}{t.unit ? ` — ${t.unit}` : ''}</span>}
                    <span className="flex items-center gap-1"><Icon name="calendar_today" size={12} />{t.reportedAt}</span>
                    {t.assignedTo && <span className="flex items-center gap-1"><Icon name="person" size={12} />{t.assignedTo}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ ÉTATS DES LIEUX ═════════════════════════════════════════════════ */}
      {activeTab === 'inspections' && (
        <div className="flex flex-col gap-gutter">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">
            {[
              { l: 'Total',     v: inspections.length,                                  icon: 'checklist', c: 'bg-primary/10 text-primary' },
              { l: "Auj.",      v: todayInspections.length,                             icon: 'today',     c: 'bg-tertiary/10 text-tertiary' },
              { l: 'Entrées',   v: inspections.filter(i => i.type === 'ENTRY').length,  icon: 'login',     c: 'bg-green-100 text-green-700' },
              { l: 'Sorties',   v: inspections.filter(i => i.type === 'EXIT').length,   icon: 'logout',    c: 'bg-error/10 text-error' },
            ].map(s => (
              <div key={s.l} className={`rounded-xl p-md text-center ${s.c.split(' ')[0]} border border-current/10`}>
                <Icon name={s.icon} size={20} className={s.c.split(' ')[1]} />
                <p className={`font-black text-2xl mt-1 ${s.c.split(' ')[1]}`}>{s.v}</p>
                <p className="text-xs text-on-surface-variant">{s.l}</p>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/inspections')}
            className="flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors">
            <Icon name="home_work" size={18} /> Gérer tous les états des lieux
          </button>

          {inspections.length === 0 ? (
            <div className="text-center py-14 text-on-surface-variant bg-surface rounded-2xl border border-outline-variant/20">
              <Icon name="home_work" size={40} className="opacity-30 mb-2" /><p className="font-bold">Aucun état des lieux</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {inspections.slice(0, 15).map(i => (
                <div key={i.id} className="bg-surface rounded-xl border border-outline-variant/20 p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${i.type === 'ENTRY' ? 'bg-tertiary/10' : 'bg-error/10'}`}>
                    <Icon name={i.type === 'ENTRY' ? 'login' : 'logout'} size={18} className={i.type === 'ENTRY' ? 'text-tertiary' : 'text-error'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-on-surface text-sm">{i.ref}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${INSP_STATUS_C[i.status] || ''}`}>{INSP_STATUS_L[i.status] || i.status}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant">{i.propertyName} — {i.tenantName}</p>
                    <p className="text-xs text-on-surface-variant">{i.scheduledDate ? new Date(i.scheduledDate).toLocaleDateString('fr-FR') : '—'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ MESSAGERIE ══════════════════════════════════════════════════════ */}
      {activeTab === 'messages' && (
        <div className="flex flex-col gap-4">
          <button onClick={() => navigate('/inbox')}
            className="flex items-center justify-center gap-2 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors">
            <Icon name="support_agent" size={18} /> Ouvrir la messagerie complète
          </button>

          {conversations.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant bg-surface rounded-2xl border border-outline-variant/20">
              <Icon name="chat" size={48} className="opacity-30 mb-2" /><p className="font-bold">Aucune conversation</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {conversations.map(c => (
                <button key={c.id} onClick={() => navigate('/inbox')}
                  className="bg-surface rounded-xl border border-outline-variant/20 p-4 hover:border-primary/30 hover:shadow-card transition-all text-left flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${c.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                    {c.contact?.initials || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-on-surface flex items-center gap-2">
                      {c.contact?.name}
                      {(c.unread || 0) > 0 && <span className="bg-primary text-on-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{c.unread}</span>}
                    </p>
                    <p className="text-sm text-on-surface-variant truncate">{c.lastMessage}</p>
                  </div>
                  <span className="text-xs text-on-surface-variant flex-shrink-0">{c.time}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
