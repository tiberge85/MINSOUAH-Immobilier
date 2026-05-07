import { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const contactTypeFilter = ['Tous', 'Propriétaires', 'Locataires'];

export default function Inbox() {
  const { state, dispatch } = useApp();
  const conversations = state.conversations;
  const [activeId, setActiveId] = useState(conversations[0]?.id);
  const [filter, setFilter] = useState('Tous');
  const [search, setSearch] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef(null);

  const activeConv = conversations.find((c) => c.id === activeId);

  const filteredConv = conversations.filter((c) => {
    const matchFilter =
      filter === 'Tous' ||
      (filter === 'Propriétaires' && c.contact.role === 'Propriétaire') ||
      (filter === 'Locataires' && c.contact.role === 'Locataire');
    const matchSearch = c.contact.name.toLowerCase().includes(search.toLowerCase());
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openConversation = (id) => {
    setActiveId(id);
    dispatch({ type: 'MARK_READ', payload: id });
    setShowMobileChat(true);
  };

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 80px)' }}>

      {/* ── Conversation List ────────────────────────────────────────── */}
      <section
        className={`w-full md:w-80 lg:w-96 bg-surface-container-low border-r border-outline-variant flex flex-col flex-shrink-0 ${
          showMobileChat ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header */}
        <div className="p-md bg-surface shadow-sm z-10 flex flex-col gap-sm border-b border-outline-variant/20">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
            <input
              type="text"
              placeholder="Rechercher une conversation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-md py-xs bg-surface-container-lowest border border-outline-variant rounded-lg text-body-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="flex gap-2">
            {contactTypeFilter.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-sm py-xs rounded-full text-label-sm font-label-sm transition-colors flex-1 ${
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
            <div className="text-center py-xl text-on-surface-variant text-body-sm">
              Aucune conversation trouvée
            </div>
          )}
          {filteredConv.map((conv) => (
            <div
              key={conv.id}
              onClick={() => openConversation(conv.id)}
              className={`p-md border-b border-outline-variant/20 flex gap-sm cursor-pointer transition-colors ${
                activeId === conv.id
                  ? 'bg-surface-container-high'
                  : 'hover:bg-surface-container-high'
              }`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${conv.contact.color}`}>
                  {conv.contact.initials}
                </div>
                {conv.contact.online && (
                  <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-surface-container-low rounded-full" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <h3 className="text-label-md font-label-md text-on-surface truncate">{conv.contact.name}</h3>
                  <span className={`text-label-sm flex-shrink-0 ml-2 ${conv.unread > 0 ? 'text-primary font-bold' : 'text-outline'}`}>
                    {conv.time}
                  </span>
                </div>
                <p className={`text-body-sm truncate mt-0.5 ${conv.unread > 0 ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}`}>
                  {conv.lastMessage}
                </p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">{conv.contact.role}</span>
                  {conv.unread > 0 && (
                    <span className="bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center">
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Active Chat Pane ─────────────────────────────────────────── */}
      {activeConv ? (
        <section
          className={`flex-1 flex flex-col bg-surface-container-lowest min-w-0 ${
            showMobileChat ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Chat header */}
          <div className="h-20 px-lg flex items-center justify-between border-b border-outline-variant/20 shadow-sm bg-surface flex-shrink-0">
            <div className="flex items-center gap-md">
              <button
                className="md:hidden p-1 rounded-lg hover:bg-surface-container transition-colors text-on-surface-variant"
                onClick={() => setShowMobileChat(false)}
              >
                <Icon name="arrow_back" />
              </button>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${activeConv.contact.color}`}>
                {activeConv.contact.initials}
              </div>
              <div>
                <h2 className="font-h3 text-h3 text-on-surface">{activeConv.contact.name}</h2>
                <p className="text-body-sm flex items-center gap-1">
                  {activeConv.contact.online ? (
                    <>
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-green-600">En ligne</span>
                    </>
                  ) : (
                    <span className="text-on-surface-variant">{activeConv.contact.role}</span>
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

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-lg flex flex-col gap-lg bg-surface-container-low/30">
            {/* Date divider */}
            <div className="flex justify-center">
              <span className="px-4 py-1 rounded-full bg-surface-container text-outline text-[10px] uppercase font-bold tracking-widest">
                Aujourd'hui
              </span>
            </div>

            {activeConv.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-md ${msg.sent ? 'flex-row-reverse' : 'flex-row'} max-w-[80%] ${msg.sent ? 'self-end' : 'self-start'}`}
              >
                {!msg.sent && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 mt-1 ${activeConv.contact.color}`}>
                    {activeConv.contact.initials}
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <div
                    className={`p-md rounded-2xl shadow-sm ${
                      msg.sent
                        ? 'bg-primary text-on-primary rounded-tr-none'
                        : 'bg-surface-container border border-outline-variant rounded-tl-none'
                    }`}
                  >
                    <p className={`text-body-md leading-relaxed ${msg.sent ? 'text-on-primary' : 'text-on-surface-variant'}`}>
                      {msg.text}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 ${msg.sent ? 'justify-end mr-1' : 'ml-1'}`}>
                    <span className="text-label-sm text-outline">{msg.time}</span>
                    {msg.sent && (
                      <Icon name="done_all" size={14} filled className="text-primary" />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
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
            <p className="text-body-sm mt-2">Choisissez une conversation dans la liste de gauche</p>
          </div>
        </div>
      )}
    </div>
  );
}
