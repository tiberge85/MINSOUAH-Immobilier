import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const contactTypeFilter = ['Tous', 'Propriétaires', 'Locataires', 'Équipe'];

const CHANNEL_ICONS = {
  'direct': 'person',
  'group':  'group',
  'annonce': 'campaign',
  'support': 'support_agent',
};

function NewConversationModal({ state, onClose, onCreate }) {
  const [type, setType] = useState('direct');
  const [name, setName] = useState('');
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [search, setSearch] = useState('');

  const allContacts = [
    ...(state.tenants || []).map(t => ({
      id: `t-${t.id}`, personId: t.id,
      name: t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim(),
      role: 'Locataire', email: t.email,
      initials: t.initials || (t.name?.[0] || 'T'),
      color: t.color || 'bg-secondary-container text-on-secondary-container',
      online: false,
    })),
    ...(state.owners || []).map(o => ({
      id: `o-${o.id}`, personId: o.id,
      name: o.name, role: 'Propriétaire', email: o.email,
      initials: o.initials || o.name?.[0] || 'P',
      color: o.color || 'bg-tertiary-container text-on-tertiary-container',
      online: false,
    })),
  ];

  const filtered = allContacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = () => {
    if (type === 'direct' && !selectedPerson) return;
    if ((type === 'group' || type === 'annonce' || type === 'support') && !name.trim()) return;

    const contact = type === 'direct' ? {
      name: selectedPerson.name,
      role: selectedPerson.role,
      initials: selectedPerson.initials,
      color: selectedPerson.color,
      online: false,
    } : {
      name: name.trim(),
      role: type === 'group' ? 'Groupe' : type === 'annonce' ? 'Annonce' : 'Support',
      initials: name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
      color: type === 'group' ? 'bg-primary-container text-on-primary-container' : 'bg-tertiary-container text-on-tertiary-container',
      online: false,
    };

    onCreate({
      id: Date.now(),
      type,
      contact,
      lastMessage: '',
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      unread: 0,
      messages: [],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-surface-container-lowest w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-modal overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 flex-shrink-0">
          <h3 className="font-bold text-on-surface text-lg">Nouvelle conversation</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="px-6 py-4 flex-1 overflow-y-auto">
          {/* Type selector */}
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-3">Type de canal</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
            {[
              { id: 'direct',  label: 'Direct', icon: 'person' },
              { id: 'group',   label: 'Groupe',  icon: 'group' },
              { id: 'annonce', label: 'Annonce', icon: 'campaign' },
              { id: 'support', label: 'Support', icon: 'support_agent' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                  type === t.id ? 'border-primary bg-primary/5' : 'border-outline-variant/30 hover:border-outline-variant'
                }`}
              >
                <Icon name={t.icon} size={20} className={type === t.id ? 'text-primary' : 'text-on-surface-variant'} />
                <span className="text-xs font-semibold text-on-surface">{t.label}</span>
              </button>
            ))}
          </div>

          {type === 'direct' ? (
            <>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2">Sélectionner un contact</p>
              <div className="relative mb-3">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-sm text-center text-on-surface-variant py-4">Aucun contact trouvé</p>
                ) : filtered.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedPerson(c)}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                      selectedPerson?.id === c.id ? 'border-primary bg-primary/5' : 'border-outline-variant/20 hover:border-outline-variant/50'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${c.color}`}>
                      {c.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-on-surface text-sm truncate">{c.name}</p>
                      <p className="text-xs text-on-surface-variant">{c.role} · {c.email}</p>
                    </div>
                    {selectedPerson?.id === c.id && <Icon name="check_circle" size={18} className="text-primary flex-shrink-0" filled />}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-2 block">
                Nom du canal *
              </label>
              <input
                type="text"
                placeholder={type === 'group' ? 'Ex: Résidence Les Palmiers' : type === 'annonce' ? 'Ex: Annonces générales' : 'Ex: Support technique'}
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-outline-variant/40 bg-surface-container text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface font-semibold">Annuler</button>
          <button
            onClick={handleCreate}
            disabled={(type === 'direct' && !selectedPerson) || ((type !== 'direct') && !name.trim())}
            className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Icon name="add" size={18} />
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Inbox() {
  const { state, dispatch } = useApp();
  const [conversations, setConversations] = useState(() => state.conversations || []);
  const [activeId, setActiveId] = useState(conversations[0]?.id);
  const [filter, setFilter] = useState('Tous');
  const [search, setSearch] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const messagesEndRef = useRef(null);

  // Sync local conversations with state
  useEffect(() => {
    setConversations(state.conversations || []);
  }, [state.conversations]);

  const activeConv = conversations.find((c) => c.id === activeId);

  const filteredConv = conversations.filter((c) => {
    const role = c.contact?.role || '';
    const matchFilter =
      filter === 'Tous' ||
      (filter === 'Propriétaires' && role === 'Propriétaire') ||
      (filter === 'Locataires' && role === 'Locataire') ||
      (filter === 'Équipe' && ['Groupe', 'Annonce', 'Support', 'Technicien', 'Manager'].includes(role));
    const matchSearch = (c.contact?.name || '').toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeId, conversations]);

  const handleSend = () => {
    if (!newMessage.trim() || !activeConv) return;
    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    dispatch({
      type: 'SEND_MESSAGE',
      payload: {
        convId: activeId,
        message: { id: Date.now(), sent: true, text: newMessage, time },
      },
    });
    setNewMessage('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const openConversation = (id) => {
    setActiveId(id);
    dispatch({ type: 'MARK_READ', payload: id });
    setShowMobileChat(true);
  };

  const handleCreateConversation = (conv) => {
    dispatch({ type: 'ADD_CONVERSATION', payload: conv });
    setActiveId(conv.id);
    setShowMobileChat(true);
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unread || 0), 0);

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 80px)' }}>
      {showNewConv && (
        <NewConversationModal
          state={state}
          onClose={() => setShowNewConv(false)}
          onCreate={handleCreateConversation}
        />
      )}

      {/* ── Conversation List ────────────────────────────────────────── */}
      <section className={`w-full md:w-80 lg:w-96 bg-surface-container-low border-r border-outline-variant flex flex-col flex-shrink-0 ${showMobileChat ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-md bg-surface shadow-sm z-10 flex flex-col gap-sm border-b border-outline-variant/20">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-on-surface flex items-center gap-2">
              Messagerie
              {totalUnread > 0 && (
                <span className="bg-primary text-on-primary text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {totalUnread}
                </span>
              )}
            </h2>
            <button
              onClick={() => setShowNewConv(true)}
              className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm"
              title="Nouvelle conversation"
            >
              <Icon name="edit" size={18} />
            </button>
          </div>
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-md py-xs bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {contactTypeFilter.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-sm py-xs rounded-full text-label-sm font-label-sm transition-colors whitespace-nowrap flex-shrink-0 ${
                  filter === f
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container-highest text-on-surface-variant hover:bg-outline-variant/30'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredConv.length === 0 && (
            <div className="text-center py-xl text-on-surface-variant">
              <Icon name="chat_bubble_outline" size={40} className="opacity-20 mb-3" />
              <p className="text-body-sm">Aucune conversation</p>
              <button
                onClick={() => setShowNewConv(true)}
                className="mt-3 text-primary text-label-sm font-semibold hover:underline"
              >
                + Créer une conversation
              </button>
            </div>
          )}
          {filteredConv.map((conv) => {
            const icon = CHANNEL_ICONS[conv.type] || 'person';
            return (
              <div
                key={conv.id}
                onClick={() => openConversation(conv.id)}
                className={`p-md border-b border-outline-variant/20 flex gap-sm cursor-pointer transition-colors ${
                  activeId === conv.id ? 'bg-surface-container-high' : 'hover:bg-surface-container-high'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${conv.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                    {conv.type !== 'direct'
                      ? <Icon name={icon} size={22} />
                      : (conv.contact?.initials || '?')
                    }
                  </div>
                  {conv.contact?.online && (
                    <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-surface-container-low rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h3 className="text-label-md font-label-md text-on-surface truncate">{conv.contact?.name}</h3>
                    <span className={`text-label-sm flex-shrink-0 ml-2 ${conv.unread > 0 ? 'text-primary font-bold' : 'text-outline'}`}>
                      {conv.time}
                    </span>
                  </div>
                  <p className={`text-body-sm truncate mt-0.5 ${conv.unread > 0 ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                    {conv.lastMessage || 'Aucun message'}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">{conv.contact?.role}</span>
                    {conv.unread > 0 && (
                      <span className="bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Active Chat Pane ─────────────────────────────────────────── */}
      {activeConv ? (
        <section className={`flex-1 flex flex-col bg-surface-container-lowest min-w-0 ${showMobileChat ? 'flex' : 'hidden md:flex'}`}>
          <div className="h-20 px-lg flex items-center justify-between border-b border-outline-variant/20 shadow-sm bg-surface flex-shrink-0">
            <div className="flex items-center gap-md">
              <button
                className="md:hidden p-1 rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant"
                onClick={() => setShowMobileChat(false)}
              >
                <Icon name="arrow_back" />
              </button>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${activeConv.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                {activeConv.type !== 'direct'
                  ? <Icon name={CHANNEL_ICONS[activeConv.type] || 'group'} size={20} />
                  : (activeConv.contact?.initials || '?')
                }
              </div>
              <div>
                <h2 className="font-h3 text-h3 text-on-surface">{activeConv.contact?.name}</h2>
                <p className="text-body-sm flex items-center gap-1">
                  {activeConv.contact?.online ? (
                    <><span className="w-2 h-2 bg-green-500 rounded-full" /><span className="text-green-600">En ligne</span></>
                  ) : (
                    <span className="text-on-surface-variant">{activeConv.contact?.role}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-sm">
              <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors">
                <Icon name="call" size={20} />
              </button>
              <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors">
                <Icon name="videocam" size={20} />
              </button>
              <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-colors">
                <Icon name="more_vert" size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-lg flex flex-col gap-lg bg-surface-container-low/30">
            <div className="flex justify-center">
              <span className="px-4 py-1 rounded-full bg-surface-container text-outline text-[10px] uppercase font-bold tracking-widest">
                Aujourd'hui
              </span>
            </div>
            {activeConv.messages.length === 0 && (
              <div className="text-center py-8 text-on-surface-variant">
                <Icon name="chat_bubble_outline" size={40} className="opacity-20 mb-3" />
                <p className="text-body-sm">Aucun message — commencez la conversation !</p>
              </div>
            )}
            {activeConv.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-md ${msg.sent ? 'flex-row-reverse' : 'flex-row'} max-w-[80%] ${msg.sent ? 'self-end' : 'self-start'}`}
              >
                {!msg.sent && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1 ${activeConv.contact?.color || 'bg-primary-container text-on-primary-container'}`}>
                    {activeConv.contact?.initials || '?'}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <div className={`p-md rounded-2xl shadow-sm ${msg.sent ? 'bg-primary text-on-primary rounded-tr-none' : 'bg-surface-container border border-outline-variant rounded-tl-none'}`}>
                    <p className={`text-body-md leading-relaxed ${msg.sent ? 'text-on-primary' : 'text-on-surface-variant'}`}>{msg.text}</p>
                  </div>
                  <div className={`flex items-center gap-1 ${msg.sent ? 'justify-end mr-1' : 'ml-1'}`}>
                    <span className="text-label-sm text-outline">{msg.time}</span>
                    {msg.sent && <Icon name="done_all" size={14} filled className="text-primary" />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-md bg-surface border-t border-outline-variant/20 flex-shrink-0">
            <div className="flex items-end gap-sm bg-surface-container-lowest border border-outline-variant rounded-2xl p-2 shadow-inner">
              <button className="p-2 text-outline hover:text-primary transition-colors rounded-full hover:bg-surface-container flex-shrink-0">
                <Icon name="add_circle" size={22} />
              </button>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Écrivez votre message... (Entrée pour envoyer)"
                rows={1}
                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 resize-none py-2 text-body-md text-on-surface placeholder:text-outline min-h-[40px] max-h-[120px]"
                style={{ lineHeight: '1.5' }}
              />
              <div className="flex gap-sm p-1 flex-shrink-0">
                <button className="p-2 text-outline hover:text-primary transition-colors rounded-full hover:bg-surface-container">
                  <Icon name="sentiment_satisfied" size={22} />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim()}
                  className="w-10 h-10 bg-primary text-on-primary rounded-xl flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Icon name="send" size={20} />
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-surface-container-low/30">
          <div className="text-center text-on-surface-variant">
            <Icon name="chat_bubble_outline" size={64} className="mb-md opacity-30" />
            <p className="text-body-lg font-medium">Sélectionnez une conversation</p>
            <p className="text-body-sm mt-2">ou créez-en une nouvelle avec le bouton +</p>
            <button
              onClick={() => setShowNewConv(true)}
              className="mt-4 flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold mx-auto hover:bg-primary/90 transition-colors"
            >
              <Icon name="edit" size={18} />
              Nouvelle conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
