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
const INSP_STATUS_L = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', PENDING_SIGNATURE: 'Att. signature', COMPLETED: 'Complété' };
const INSP_STATUS_C = { DRAFT: 'bg-slate-100 text-slate-700', IN_PROGRESS: 'bg-blue-100 text-blue-800', PENDING_SIGNATURE: 'bg-amber-100 text-amber-800', COMPLETED: 'bg-green-100 text-green-800' };

export default function ConciergePortal() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { tickets = [], inspections = [], conversations = [], currentUser, properties = [] } = state;

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

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm';

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-6xl mx-auto flex flex-col gap-gutter">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary to-primary/80 text-on-primary rounded-2xl px-6 py-5 relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-10">
          <Icon name="supervised_user_circle" size={80} />
        </div>
        <div className="relative">
          <p className="text-on-primary/70 text-sm capitalize">{todayStr}</p>
          <h1 className="font-black text-2xl sm:text-3xl mt-1">
            Bonjour, {currentUser?.name?.split(' ')[0] || 'Concierge'}
          </h1>
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              { v: openTickets.length,        l: 'tickets ouverts', color: openTickets.length > 0 ? 'bg-white/20' : 'bg-white/10' },
              { v: urgentTickets.length,       l: 'urgents',         color: urgentTickets.length > 0 ? 'bg-error/40' : 'bg-white/10' },
              { v: todayInspections.length,    l: 'inspections auj.', color: 'bg-white/10' },
              { v: unreadMsgs,                 l: 'non lus',          color: unreadMsgs > 0 ? 'bg-white/20' : 'bg-white/10' },
            ].map(s => (
              <span key={s.l} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.color} text-on-primary/90`}>
                {s.v} {s.l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4 Sections d'accès ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-md">

        {/* Maintenance */}
        <button onClick={() => navigate('/maintenance')}
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

        {/* États des lieux */}
        <button onClick={() => navigate('/inspections')}
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

        {/* Messagerie */}
        <button onClick={() => navigate('/inbox')}
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
          {unreadMsgs > 0 && (
            <span className="text-[10px] font-black bg-primary text-on-primary px-1.5 py-0.5 rounded-full">{unreadMsgs}</span>
          )}
        </button>

        {/* Signaler un problème */}
        <button onClick={() => setShowNewTicket(true)}
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

      {/* ── Formulaire nouveau ticket ────────────────────────────────────────── */}
      {showNewTicket && (
        <div className="bg-surface rounded-2xl border border-primary/30 shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10 bg-primary/5">
            <h3 className="font-bold text-on-surface flex items-center gap-2">
              <Icon name="add_circle" className="text-primary" size={18} />
              Signaler un problème
            </h3>
            <button onClick={() => setShowNewTicket(false)} className="text-on-surface-variant hover:text-on-surface">
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Titre du problème *</label>
              <input value={newTicket.title} onChange={e => setNewTicket(t => ({ ...t, title: e.target.value }))}
                placeholder="Ex: Fuite d'eau dans la cuisine" maxLength={80} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1.5 block">Bien concerné</label>
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
              <textarea value={newTicket.description} onChange={e => setNewTicket(t => ({ ...t, description: e.target.value }))}
                placeholder="Décrivez le problème en détail..." rows={3} className={`${inputCls} resize-none`} />
            </div>
          </div>
          <div className="flex gap-3 px-5 pb-5 justify-end">
            <button onClick={() => setShowNewTicket(false)} className="px-4 py-2 text-sm font-semibold text-on-surface-variant bg-surface-container rounded-xl hover:bg-surface-container-high">Annuler</button>
            <button onClick={handleCreateTicket} disabled={!newTicket.title.trim()}
              className="px-6 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              <Icon name="send" size={16} />Signaler
            </button>
          </div>
        </div>
      )}

      {/* ── Contenu principal ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">

        {/* ── Tickets à traiter (2/3 de la largeur) ── */}
        <div className="lg:col-span-2 bg-surface rounded-2xl border border-outline-variant/20 shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
            <h3 className="font-bold text-on-surface flex items-center gap-2">
              <Icon name="engineering" className="text-amber-600" size={18} />
              Tickets à traiter
              {openTickets.length > 0 && (
                <span className="bg-error/10 text-error text-xs font-black px-2 py-0.5 rounded-full">{openTickets.length}</span>
              )}
            </h3>
            <div className="flex gap-1">
              {['Tous', 'Urgent', 'En attente', 'En cours'].map(f => (
                <button key={f} onClick={() => setTicketFilter(f)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${ticketFilter === f ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="text-center py-14 text-on-surface-variant">
              <Icon name="check_circle" size={40} className="opacity-30 mb-2 text-green-600" />
              <p className="font-semibold text-sm">Aucun ticket dans cette catégorie</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/10 max-h-[480px] overflow-y-auto">
              {filteredTickets.map(t => (
                <div key={t.id} className={`px-5 py-4 flex items-start gap-3 ${PRIORITY_CLS[t.priority]?.includes('border') ? '' : ''}`}>
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${PRIORITY_DOT[t.priority] || 'bg-outline'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-[11px] text-on-surface-variant">{t.id}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[t.status] || ''}`}>{t.status}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_CLS[t.priority]}`}>{t.priority}</span>
                    </div>
                    <p className="font-bold text-on-surface text-sm">{t.title}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{t.description}</p>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-on-surface-variant">
                      {t.property && <span className="flex items-center gap-1"><Icon name="apartment" size={11} />{t.property}{t.unit ? ` — ${t.unit}` : ''}</span>}
                      <span className="flex items-center gap-1"><Icon name="calendar_today" size={11} />{t.reportedAt}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {t.status === 'En attente' && (
                      <button onClick={() => setTicketStatus(t, 'En cours')}
                        className="text-[11px] bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-semibold hover:bg-blue-200 whitespace-nowrap">
                        Prendre en charge
                      </button>
                    )}
                    {t.status === 'En cours' && (
                      <button onClick={() => setTicketStatus(t, 'Résolu')}
                        className="text-[11px] bg-green-100 text-green-700 px-2.5 py-1 rounded-lg font-semibold hover:bg-green-200 whitespace-nowrap">
                        Marquer résolu
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-5 py-3 border-t border-outline-variant/10">
            <button onClick={() => navigate('/maintenance')}
              className="text-sm text-primary font-semibold hover:underline flex items-center gap-1">
              Gérer tous les tickets <Icon name="arrow_forward" size={14} />
            </button>
          </div>
        </div>

        {/* ── Colonne droite (1/3) ── */}
        <div className="flex flex-col gap-md">

          {/* Inspections du jour */}
          <div className="bg-surface rounded-2xl border border-outline-variant/20 shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
              <h3 className="font-bold text-on-surface flex items-center gap-2 text-sm">
                <Icon name="home_work" className="text-tertiary" size={16} />
                Inspections du jour
              </h3>
              <button onClick={() => navigate('/inspections')} className="text-xs text-primary hover:underline font-semibold">Voir tout</button>
            </div>
            {todayInspections.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <Icon name="event_available" size={28} className="opacity-30 mb-1" />
                <p className="text-xs font-medium">Aucune inspection aujourd'hui</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {todayInspections.map(i => (
                  <div key={i.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${i.type === 'ENTRY' ? 'bg-tertiary/10' : 'bg-error/10'}`}>
                      <Icon name={i.type === 'ENTRY' ? 'login' : 'logout'} size={16} className={i.type === 'ENTRY' ? 'text-tertiary' : 'text-error'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-xs truncate">{i.propertyName}</p>
                      <p className="text-[11px] text-on-surface-variant truncate">{i.tenantName}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${INSP_STATUS_C[i.status] || ''}`}>
                        {INSP_STATUS_L[i.status] || i.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-on-surface-variant flex-shrink-0">
                      {i.scheduledDate ? new Date(i.scheduledDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages récents */}
          <div className="bg-surface rounded-2xl border border-outline-variant/20 shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/10">
              <h3 className="font-bold text-on-surface flex items-center gap-2 text-sm">
                <Icon name="mail" className="text-primary" size={16} />
                Messages récents
                {unreadMsgs > 0 && <span className="bg-primary text-on-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">{unreadMsgs}</span>}
              </h3>
              <button onClick={() => navigate('/inbox')} className="text-xs text-primary hover:underline font-semibold">Ouvrir</button>
            </div>
            {conversations.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <Icon name="mail_outline" size={28} className="opacity-30 mb-1" />
                <p className="text-xs font-medium">Aucun message</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {conversations.slice(0, 5).map(c => (
                  <button key={c.id} onClick={() => navigate('/inbox')}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-container transition-colors text-left">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                      {c.contact?.initials || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-xs flex items-center gap-1.5">
                        {c.contact?.name}
                        {(c.unread || 0) > 0 && <span className="bg-primary text-on-primary text-[9px] font-black px-1 py-0.5 rounded-full">{c.unread}</span>}
                      </p>
                      <p className="text-[11px] text-on-surface-variant truncate">{c.lastMessage}</p>
                    </div>
                    <span className="text-[10px] text-on-surface-variant flex-shrink-0">{c.time}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
