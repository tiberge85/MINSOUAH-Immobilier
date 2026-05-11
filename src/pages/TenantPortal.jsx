import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import Badge from '../components/ui/Badge';
import Icon from '../components/Icon';
import { openEDLReport } from '../lib/inspectionReport';
import { buildReceiptHTML } from '../lib/quittanceReport';

const fmt = (n) => Number(n || 0).toLocaleString('fr-CI') + ' FCFA';

function phoneForWA(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('225')) return d;
  return '225' + (d.startsWith('0') ? d.slice(1) : d);
}

const MOBILE_MONEY = [
  { id: 'orange', name: 'Orange Money', color: 'bg-orange-500', textColor: 'text-white', icon: 'smartphone' },
  { id: 'mtn', name: 'MTN MoMo', color: 'bg-yellow-400', textColor: 'text-yellow-900', icon: 'smartphone' },
  { id: 'wave', name: 'Wave', color: 'bg-sky-500', textColor: 'text-white', icon: 'waves' },
  { id: 'moov', name: 'Moov Money', color: 'bg-blue-700', textColor: 'text-white', icon: 'smartphone' },
];

function PaymentModal({ contract, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [operator, setOperator] = useState(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [txRef] = useState(() => 'TXN' + Date.now());

  const simulate = () => {
    if (!operator || !phone.trim()) return;
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep(3); }, 2200);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-surface-container-lowest w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-modal overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20">
          <h3 className="font-h3 text-h3 text-on-surface font-bold">
            {step === 1 ? 'Choisir l\'opérateur' : step === 2 ? 'Confirmer le paiement' : 'Paiement réussi'}
          </h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="px-6 py-5">
          {step === 1 && (
            <>
              <p className="text-body-sm text-on-surface-variant mb-4">Sélectionnez votre opérateur Mobile Money</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {MOBILE_MONEY.map(op => (
                  <button
                    key={op.id}
                    onClick={() => setOperator(op)}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                      operator?.id === op.id
                        ? 'border-primary bg-primary/5'
                        : 'border-outline-variant/30 hover:border-primary/40'
                    }`}
                  >
                    <div className={`w-12 h-12 ${op.color} rounded-full flex items-center justify-center`}>
                      <Icon name={op.icon} size={22} className={op.textColor} />
                    </div>
                    <span className="text-label-sm font-bold text-on-surface">{op.name}</span>
                  </button>
                ))}
              </div>
              <div className="bg-surface-container rounded-xl p-4 mb-5">
                <div className="flex justify-between text-body-sm mb-1">
                  <span className="text-on-surface-variant">Loyer</span>
                  <span className="text-on-surface font-bold">{fmt(contract?.rent)}</span>
                </div>
                <div className="flex justify-between text-body-sm">
                  <span className="text-on-surface-variant">Référence</span>
                  <span className="text-on-surface font-mono text-xs">{txRef}</span>
                </div>
              </div>
              <button
                onClick={() => operator && setStep(2)}
                disabled={!operator}
                className={`w-full py-3.5 rounded-2xl font-bold text-label-md transition-all ${
                  operator ? 'bg-primary text-on-primary hover:opacity-90' : 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                }`}
              >
                Continuer
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className={`w-16 h-16 ${operator.color} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <Icon name={operator.icon} size={28} className={operator.textColor} />
              </div>
              <p className="text-center font-bold text-on-surface mb-1">{operator.name}</p>
              <p className="text-center text-label-sm text-on-surface-variant mb-5">Entrez votre numéro {operator.name}</p>
              <input
                type="tel"
                placeholder="+225 07 XX XX XX XX"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full border border-outline-variant rounded-xl px-4 py-3 text-body-md focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container text-on-surface mb-4"
              />
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-5">
                <p className="text-label-sm text-on-surface-variant mb-2">Récapitulatif</p>
                <div className="flex justify-between font-bold text-on-surface">
                  <span>{contract?.propertyName}</span>
                  <span className="text-primary">{fmt(contract?.rent)}</span>
                </div>
                <p className="text-label-sm text-on-surface-variant mt-1">via {operator.name}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-2xl border border-outline-variant text-on-surface font-bold">
                  Retour
                </button>
                <button
                  onClick={simulate}
                  disabled={loading || !phone.trim()}
                  className="flex-1 py-3 rounded-2xl bg-primary text-on-primary font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <><div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />Traitement...</>
                  ) : 'Confirmer'}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="text-center py-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Icon name="check_circle" size={40} className="text-green-600" filled />
              </div>
              <h4 className="font-h2 text-h2 font-bold text-on-surface mb-2">Paiement Confirmé</h4>
              <p className="text-body-sm text-on-surface-variant mb-1">
                {fmt(contract?.rent)} payé via {operator?.name}
              </p>
              <p className="text-label-sm text-on-surface-variant font-mono bg-surface-container rounded-lg px-3 py-1.5 inline-block mb-5">
                Réf: {txRef}
              </p>
              <button
                onClick={onSuccess}
                className="w-full py-3.5 rounded-2xl bg-primary text-on-primary font-bold"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewTicketModal({ tenant, contract, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'Moyen', category: 'Plomberie' });
  const categories = ['Plomberie', 'Électricité', 'Climatisation', 'Menuiserie', 'Peinture', 'Autre'];
  const priorities = ['Faible', 'Moyen', 'Urgent'];

  const save = () => {
    if (!form.title.trim()) return;
    onSave({
      id: 'TKT-' + Date.now(),
      title: form.title,
      description: form.description,
      priority: form.priority,
      category: form.category,
      status: 'En attente',
      property: contract?.propertyName || tenant?.property || '',
      unit: '',
      reportedBy: tenant?.name || '',
      reportedAt: new Date().toLocaleDateString('fr-FR'),
      assignedTo: '',
      estimatedCost: 0,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[200] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-surface-container-lowest w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-modal overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest">
          <h3 className="font-h3 text-h3 font-bold text-on-surface">Nouveau Ticket</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container-high text-on-surface-variant">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block">Titre du problème *</label>
            <input
              type="text"
              placeholder="Ex: Fuite d'eau dans la cuisine"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container text-on-surface"
            />
          </div>
          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block">Description</label>
            <textarea
              rows={3}
              placeholder="Décrivez le problème en détail..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-outline-variant rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container text-on-surface resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-sm text-on-surface-variant mb-1 block">Catégorie</label>
              <select
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-outline-variant rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container text-on-surface"
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-sm text-on-surface-variant mb-1 block">Priorité</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-outline-variant rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-primary bg-surface-container text-on-surface"
              >
                {priorities.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-outline-variant text-on-surface font-bold">
              Annuler
            </button>
            <button onClick={save} disabled={!form.title.trim()} className="flex-1 py-3 rounded-2xl bg-primary text-on-primary font-bold disabled:opacity-50">
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuittanceRow({ payment, onDownload }) {
  const isPaid = payment.status === 'Payé';
  return (
    <div className="flex items-center justify-between py-3 px-md border-b border-outline-variant/10 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-green-100' : 'bg-error/10'}`}>
          <Icon name={isPaid ? 'receipt_long' : 'warning'} size={18} className={isPaid ? 'text-green-700' : 'text-error'} />
        </div>
        <div>
          <p className="text-label-md font-bold text-on-surface">{payment.month}</p>
          <p className="text-body-sm text-on-surface-variant">{fmt(payment.amount)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-label-sm px-2 py-0.5 rounded-full ${isPaid ? 'bg-green-100 text-green-700' : 'bg-error/10 text-error'}`}>
          {payment.status}
        </span>
        {isPaid && (
          <button
            onClick={() => onDownload(payment)}
            className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 text-primary transition-colors"
            title="Télécharger la quittance"
          >
            <Icon name="download" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TenantPortal() {
  const { state, dispatch } = useApp();
  const {
    tenants = [],
    contracts = [],
    payments = [],
    tickets = [],
    orgSettings,
    conversations = [],
    currentUser,
    inspections = [],
  } = state;
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [showPayModal, setShowPayModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [msgText, setMsgText] = useState('');

  // Auto-select when a TENANT user opens their own portal
  useEffect(() => {
    if (currentUser?.role === 'TENANT' && currentUser?.personId) {
      setSelectedId(currentUser.personId);
    }
  }, [currentUser?.role, currentUser?.personId]);

  const tenant = tenants.find(t => t.id === selectedId);
  const tenantName = tenant ? (tenant.name || `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim()) : '';

  const contract = useMemo(() => {
    if (!tenant) return null;
    return contracts.find(c =>
      c.status === 'Actif' && (
        c.tenantId === tenant.id ||
        c.tenant === tenantName ||
        c.tenant === tenant.name
      )
    ) || contracts.find(c => c.tenant === tenantName);
  }, [tenant, contracts, tenantName]);

  const tenantPayments = useMemo(() =>
    payments.filter(p =>
      (contract && p.contractId === contract.id) ||
      (tenant && p.tenantId === tenant.id) ||
      (p.tenantName && tenantName && p.tenantName.toLowerCase().trim() === tenantName.toLowerCase().trim()) ||
      (p.tenantName && tenant?.name && p.tenantName.toLowerCase().trim() === tenant.name.toLowerCase().trim())
    ).sort((a, b) => b.id - a.id),
    [contract, payments, tenantName, tenant]
  );

  const tenantTickets = useMemo(() =>
    tenant
      ? tickets.filter(t =>
          t.property === (contract?.propertyName || tenant.property) ||
          t.reportedBy === tenantName
        )
      : [],
    [tenant, tickets, contract, tenantName]
  );

  const paidPayments = tenantPayments.filter(p => p.status === 'Payé');
  const unpaidPayments = tenantPayments.filter(p => p.status !== 'Payé');
  const totalPaid = paidPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const nextDueDate = contract?.endDate || '—';
  const nextRentAmount = contract?.rent || 0;

  const handlePaySuccess = () => {
    setShowPayModal(false);
    if (contract) {
      const unpaid = tenantPayments.find(p => p.status === 'Impayé' || p.status === 'En retard');
      if (unpaid) {
        dispatch({ type: 'MARK_PAYMENT_PAID', payload: unpaid.id });
      }
    }
    toast('Paiement enregistré avec succès !', 'success');
  };

  const handleTicketSave = (ticket) => {
    dispatch({ type: 'ADD_TICKET', payload: ticket });
    toast('Ticket de maintenance créé !', 'success');
  };

  const tenantConversation = useMemo(() =>
    conversations.find(c =>
      c.contact?.personId === tenant?.id ||
      c.contact?.name === tenantName
    ) || null,
    [conversations, tenant, tenantName]
  );

  const handleSendMessage = () => {
    if (!msgText.trim() || !tenant) return;
    const msg = {
      from: 'me',
      text: msgText.trim(),
      time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
    if (tenantConversation) {
      dispatch({ type: 'SEND_MESSAGE', payload: { convId: tenantConversation.id, message: msg } });
    } else {
      dispatch({
        type: 'ADD_CONVERSATION',
        payload: {
          id: 'conv-' + Date.now(),
          contact: {
            name: tenantName,
            role: 'Locataire',
            personId: tenant.id,
            initials: tenant.initials || tenantName[0]?.toUpperCase() || '?',
            color: tenant.color || 'bg-primary-container text-on-primary-container',
            online: false,
          },
          messages: [msg],
          unread: 0,
          lastMessage: msg.text,
          lastTime: msg.time,
        },
      });
    }
    setMsgText('');
  };

  const handleDownloadQuittance = (payment) => {
    const enriched = {
      ...payment,
      tenantName: payment.tenantName || tenantName,
      tenantEmail: payment.tenantEmail || tenant?.email || '',
      tenantPhone: payment.tenantPhone || tenant?.phone || '',
      propertyName: payment.propertyName || contract?.propertyName || tenant?.property || '—',
    };
    const html = buildReceiptHTML(enriched, orgSettings, payment.signatures || {});
    const win = window.open('', '_blank', 'width=820,height=700');
    if (win) { win.document.write(html); win.document.close(); }
    toast('Quittance générée !', 'success');
  };

  /* ─── Tenant selector ─────────────────────────────────────────── */
  if (!selectedId) {
    return (
      <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl max-w-5xl mx-auto">
        <div className="flex items-center gap-md mb-lg">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-surface-container border border-outline-variant text-on-surface-variant transition-colors"
          >
            <Icon name="arrow_back" size={18} />
          </button>
          <div>
            <h1 className="font-h2 text-h2 text-on-surface font-bold">Portail Locataires</h1>
            <p className="text-body-sm text-on-surface-variant">Sélectionnez un locataire pour accéder à son espace personnel</p>
          </div>
        </div>

        {tenants.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <Icon name="person_off" size={48} className="opacity-30 mb-sm" />
            <p className="font-bold">Aucun locataire enregistré</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md">
            {tenants.map(t => {
              const tName = t.name || `${t.firstName || ''} ${t.lastName || ''}`.trim();
              const c = contracts.find(ct => ct.tenant === tName && ct.status === 'Actif');
              const unpaid = c ? payments.filter(p => p.contractId === c.id && p.status !== 'Payé').length : 0;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 hover:border-primary/40 hover:shadow-modal transition-all text-left group"
                >
                  <div className="flex items-center gap-md mb-md">
                    {t.avatar
                      ? <img src={t.avatar} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                      : <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0 ${t.color || 'bg-primary-container text-on-primary-container'}`}>{t.initials || tName[0]}</div>
                    }
                    <div>
                      <h3 className="font-label-md text-label-md text-on-surface font-bold">{tName}</h3>
                      <p className="text-body-sm text-on-surface-variant">{t.property || c?.propertyName || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge label={t.status || 'Actif'} />
                    {unpaid > 0 && (
                      <span className="text-label-sm text-error flex items-center gap-1">
                        <Icon name="warning" size={13} />
                        {unpaid} impayé(s)
                      </span>
                    )}
                  </div>
                  <div className="mt-md pt-md border-t border-outline-variant/20 text-body-sm text-on-surface-variant truncate">
                    {t.email || '—'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ─── Tenant dashboard tabs ───────────────────────────────────── */
  const TABS = [
    { id: 'home', label: 'Accueil', icon: 'home' },
    { id: 'payments', label: 'Paiements', icon: 'payments' },
    { id: 'tickets', label: 'Maintenance', icon: 'engineering' },
    { id: 'edl', label: 'État lieux', icon: 'home_work' },
    { id: 'docs', label: 'Documents', icon: 'folder' },
    { id: 'messages', label: 'Messages', icon: 'chat' },
  ];

  return (
    <div className="max-w-2xl mx-auto pb-xl">
      {showPayModal && (
        <PaymentModal
          contract={contract}
          onClose={() => setShowPayModal(false)}
          onSuccess={handlePaySuccess}
        />
      )}
      {showTicketModal && (
        <NewTicketModal
          tenant={tenant}
          contract={contract}
          onClose={() => setShowTicketModal(false)}
          onSave={handleTicketSave}
        />
      )}

      {/* Hero header */}
      <div className="bg-gradient-to-br from-primary to-primary/80 text-on-primary px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-16 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-4 w-32 h-32 rounded-full border-4 border-on-primary" />
          <div className="absolute bottom-2 right-16 w-16 h-16 rounded-full border-2 border-on-primary" />
        </div>
        <div className="relative">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1 text-on-primary/80 hover:text-on-primary mb-4 transition-colors"
          >
            <Icon name="arrow_back" size={18} />
            <span className="text-label-sm">Retour</span>
          </button>
          <div className="flex items-center gap-md">
            {tenant.avatar
              ? <img src={tenant.avatar} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-on-primary/40 flex-shrink-0" />
              : <div className={`w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl flex-shrink-0 border-2 border-on-primary/40 ${tenant.color || 'bg-primary-container'}`}>{tenant.initials || tenantName[0]}</div>
            }
            <div>
              <p className="text-on-primary/70 text-label-sm">Bonjour,</p>
              <h1 className="font-h2 text-h2 font-bold">{tenantName}</h1>
              <p className="text-on-primary/80 text-body-sm">{contract?.propertyName || tenant.property || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating card */}
      <div className="px-4 -mt-8 relative z-10">
        <div className="bg-surface-container-lowest rounded-2xl shadow-modal border border-outline-variant/20 p-md grid grid-cols-3 gap-md">
          <div className="text-center">
            <p className="text-h2 font-h2 font-black text-green-600">{paidPayments.length}</p>
            <p className="text-label-sm text-on-surface-variant">Payés</p>
          </div>
          <div className="text-center border-x border-outline-variant/20">
            <p className={`text-h2 font-h2 font-black ${unpaidPayments.length > 0 ? 'text-error' : 'text-on-surface'}`}>{unpaidPayments.length}</p>
            <p className="text-label-sm text-on-surface-variant">Impayés</p>
          </div>
          <div className="text-center">
            <p className="text-h2 font-h2 font-black text-primary">{tenantTickets.filter(t => t.status !== 'Résolu').length}</p>
            <p className="text-label-sm text-on-surface-variant">Tickets</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-4">
        <div className="flex gap-1 bg-surface-container rounded-xl p-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg text-label-sm font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-surface-container-lowest shadow-sm text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon name={tab.icon} size={18} filled={activeTab === tab.id} />
              <span className="text-[10px]">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 mt-4 flex flex-col gap-4">

        {/* ── HOME ── */}
        {activeTab === 'home' && (
          <>
            {/* Pay rent CTA */}
            {contract && (
              <div className="bg-gradient-to-r from-primary/10 to-tertiary/10 border border-primary/20 rounded-2xl p-md">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-label-sm text-on-surface-variant">Prochain loyer</p>
                    <p className="font-h2 text-h2 font-black text-on-surface">{fmt(nextRentAmount)}</p>
                    <p className="text-label-sm text-on-surface-variant">Bail jusqu'au {nextDueDate}</p>
                  </div>
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center">
                    <Icon name="payments" size={28} className="text-primary" />
                  </div>
                </div>
                <button
                  onClick={() => setShowPayModal(true)}
                  className="w-full py-3 bg-primary text-on-primary rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <Icon name="smartphone" size={18} />
                  Payer via Mobile Money
                </button>
              </div>
            )}

            {/* Unpaid alert */}
            {unpaidPayments.length > 0 && (
              <div className="bg-error/5 border border-error/20 rounded-2xl p-md flex items-start gap-3">
                <Icon name="warning" size={20} className="text-error flex-shrink-0 mt-0.5" filled />
                <div>
                  <p className="font-bold text-on-surface">
                    {unpaidPayments.length} paiement(s) en attente
                  </p>
                  <p className="text-body-sm text-on-surface-variant">
                    Montant dû : {fmt(unpaidPayments.reduce((s, p) => s + (p.amount || 0), 0))}
                  </p>
                </div>
              </div>
            )}

            {/* Contract card */}
            {contract ? (
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
                <div className="px-md py-3 border-b border-outline-variant/20 flex items-center gap-2">
                  <Icon name="description" className="text-primary" size={18} />
                  <h3 className="font-bold text-on-surface">Mon Bail</h3>
                </div>
                <div className="p-md grid grid-cols-2 gap-3">
                  {[
                    { icon: 'home', label: 'Bien loué', value: contract.propertyName },
                    { icon: 'payments', label: 'Loyer mensuel', value: fmt(contract.rent) },
                    { icon: 'event', label: 'Fin du bail', value: contract.endDate },
                    { icon: 'verified_user', label: 'Caution', value: fmt(contract.deposit || contract.rent * 2) },
                  ].map(r => (
                    <div key={r.label} className="bg-surface-container rounded-xl p-3">
                      <Icon name={r.icon} size={16} className="text-primary mb-1" />
                      <p className="text-label-sm text-on-surface-variant">{r.label}</p>
                      <p className="text-label-md font-bold text-on-surface text-sm">{r.value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-md text-center text-on-surface-variant">
                <Icon name="description" size={32} className="opacity-30 mb-2" />
                <p>Aucun contrat actif trouvé</p>
              </div>
            )}

            {/* Open tickets summary */}
            {tenantTickets.filter(t => t.status !== 'Résolu').length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-md">
                <div className="flex items-center gap-2 mb-2">
                  <Icon name="engineering" size={18} className="text-amber-600" />
                  <p className="font-bold text-amber-800">
                    {tenantTickets.filter(t => t.status !== 'Résolu').length} ticket(s) en cours
                  </p>
                </div>
                {tenantTickets.filter(t => t.status !== 'Résolu').slice(0, 2).map(t => (
                  <div key={t.id} className="text-body-sm text-amber-700 flex items-center gap-1 mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                    {t.title}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PAYMENTS ── */}
        {activeTab === 'payments' && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface">Historique des paiements</h3>
              <button
                onClick={() => setShowPayModal(true)}
                className="flex items-center gap-1.5 bg-primary text-on-primary text-label-sm font-bold px-3 py-1.5 rounded-lg"
              >
                <Icon name="add" size={16} />
                Payer
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                <p className="text-green-700 font-black text-h2">{fmt(totalPaid)}</p>
                <p className="text-label-sm text-green-600">Total versé</p>
              </div>
              <div className="bg-error/5 border border-error/20 rounded-xl p-3 text-center">
                <p className={`font-black text-h2 ${unpaidPayments.length > 0 ? 'text-error' : 'text-green-600'}`}>
                  {fmt(unpaidPayments.reduce((s, p) => s + (p.amount || 0), 0))}
                </p>
                <p className="text-label-sm text-on-surface-variant">Impayés</p>
              </div>
            </div>
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
              {tenantPayments.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant">
                  <Icon name="payments" size={32} className="opacity-30 mb-2" />
                  <p>Aucun paiement enregistré</p>
                </div>
              ) : (
                tenantPayments.map(p => (
                  <QuittanceRow
                    key={p.id}
                    payment={p}
                    onDownload={handleDownloadQuittance}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* ── TICKETS ── */}
        {activeTab === 'tickets' && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-on-surface">Mes tickets maintenance</h3>
              <button
                onClick={() => setShowTicketModal(true)}
                className="flex items-center gap-1.5 bg-primary text-on-primary text-label-sm font-bold px-3 py-1.5 rounded-lg"
              >
                <Icon name="add" size={16} />
                Nouveau
              </button>
            </div>
            {tenantTickets.length === 0 ? (
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-8 text-center text-on-surface-variant">
                <Icon name="engineering" size={40} className="opacity-30 mb-2" />
                <p className="font-bold mb-1">Aucun ticket ouvert</p>
                <p className="text-body-sm">Signalez un problème avec le bouton ci-dessus</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tenantTickets.map(t => (
                  <div key={t.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-md">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Badge label={t.priority} />
                        <Badge label={t.status} />
                      </div>
                      <span className="text-label-sm text-on-surface-variant font-mono">{t.id}</span>
                    </div>
                    <p className="font-bold text-on-surface">{t.title}</p>
                    {t.description && <p className="text-body-sm text-on-surface-variant mt-1">{t.description}</p>}
                    <p className="text-label-sm text-on-surface-variant mt-2">
                      <Icon name="calendar_today" size={12} className="inline mr-1" />
                      Signalé le {t.reportedAt}
                      {t.assignedTo && ` — Assigné à ${t.assignedTo}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── DOCS ── */}
        {activeTab === 'messages' && (
          <>
            <h3 className="font-bold text-on-surface">Messages</h3>
            <p className="text-body-sm text-on-surface-variant -mt-2">Échangez directement avec la gestion</p>
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 min-h-[220px] max-h-[400px] overflow-y-auto p-4 flex flex-col gap-3">
              {(tenantConversation?.messages || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-on-surface-variant">
                  <Icon name="chat_bubble_outline" size={40} className="opacity-30 mb-2" />
                  <p className="text-sm">Aucun message. Commencez la discussion.</p>
                </div>
              ) : (
                tenantConversation.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${m.from === 'me' ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>
                      <p className="text-sm">{m.text}</p>
                      <p className="text-[10px] opacity-60 mt-0.5 text-right">{m.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={msgText}
                onChange={e => setMsgText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Votre message..."
                className="flex-1 border border-outline-variant/40 bg-surface-container rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-on-surface"
              />
              <button
                onClick={handleSendMessage}
                disabled={!msgText.trim()}
                className="bg-primary text-on-primary rounded-xl px-4 py-2.5 disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Icon name="send" size={18} />
              </button>
            </div>
          </>
        )}

        {activeTab === 'edl' && (
          <>
            <h3 className="font-bold text-on-surface">États des lieux</h3>
            <p className="text-body-sm text-on-surface-variant -mt-2">
              Consultez vos états des lieux et signez électroniquement
            </p>
            {(() => {
              const STATUS_LABELS = { DRAFT: 'Brouillon', IN_PROGRESS: 'En cours', PENDING_SIGNATURE: 'À signer', COMPLETED: 'Complété' };
              const STATUS_CLS = { DRAFT: 'bg-slate-100 text-slate-700', IN_PROGRESS: 'bg-blue-100 text-blue-800', PENDING_SIGNATURE: 'bg-amber-100 text-amber-800', COMPLETED: 'bg-green-100 text-green-800' };
              const tenantInspections = (inspections || []).filter(i =>
                i.tenantId === tenant?.id ||
                (tenant?.name && i.tenantName && i.tenantName.toLowerCase() === tenant.name.toLowerCase())
              );
              if (tenantInspections.length === 0) return (
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-8 text-center text-on-surface-variant">
                  <Icon name="home_work" size={40} className="opacity-30 mb-2" />
                  <p>Aucun état des lieux disponible</p>
                </div>
              );
              return (
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
                  {tenantInspections.map(insp => (
                    <div key={insp.id} className="flex items-center justify-between px-md py-3 border-b border-outline-variant/10 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${insp.type === 'ENTRY' ? 'bg-tertiary/10' : 'bg-error/10'}`}>
                          <Icon name={insp.type === 'ENTRY' ? 'login' : 'logout'} size={20} className={insp.type === 'ENTRY' ? 'text-tertiary' : 'text-error'} />
                        </div>
                        <div>
                          <p className="font-bold text-on-surface text-label-md">{insp.ref} — {insp.type === 'ENTRY' ? 'Entrée' : 'Sortie'}</p>
                          <p className="text-body-sm text-on-surface-variant">
                            {insp.propertyName} {insp.unitRef ? `• ${insp.unitRef}` : ''} — {insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString('fr-FR') : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-label-sm font-bold px-2.5 py-0.5 rounded-full ${STATUS_CLS[insp.status] || 'bg-gray-100 text-gray-700'}`}>
                          {STATUS_LABELS[insp.status] || insp.status}
                        </span>
                        {insp.status === 'PENDING_SIGNATURE' && !insp.tenantSignature && (
                          <span className="flex items-center gap-1 text-amber-700 text-label-sm font-bold">
                            <Icon name="draw" size={14} />
                            Action requise
                          </span>
                        )}
                        {insp.tenantSignature && (
                          <Icon name="verified" size={18} className="text-green-600" title="Signé" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {activeTab === 'docs' && (
          <>
            <h3 className="font-bold text-on-surface">Documents et quittances</h3>
            <p className="text-body-sm text-on-surface-variant -mt-2">
              Téléchargez vos quittances de loyer payées
            </p>
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
              {paidPayments.length === 0 ? (
                <div className="text-center py-10 text-on-surface-variant">
                  <Icon name="folder_open" size={40} className="opacity-30 mb-2" />
                  <p>Aucune quittance disponible</p>
                </div>
              ) : (
                paidPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-md py-3 border-b border-outline-variant/10 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                        <Icon name="receipt_long" size={20} className="text-primary" />
                      </div>
                      <div>
                        <p className="font-bold text-on-surface text-label-md">Quittance {p.month}</p>
                        <p className="text-body-sm text-on-surface-variant">{fmt(p.amount)} — Payé le {p.paidDate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownloadQuittance(p)}
                        className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-label-sm font-bold px-3 py-1.5 rounded-lg transition-colors"
                        title="Télécharger PDF"
                      >
                        <Icon name="download" size={16} />
                        PDF
                      </button>
                      <button
                        onClick={() => {
                          const phone = phoneForWA(tenant?.phone);
                          if (!phone) { alert('Numéro de téléphone manquant pour ce locataire.'); return; }
                          const msg = encodeURIComponent(`Bonjour ${tenantName},\n\nVotre quittance de loyer pour ${p.month} d'un montant de ${fmt(p.amount)} est disponible.\nPropriété : ${contract?.propertyName || tenant?.property || '—'}\nDate de paiement : ${p.paidDate || '—'}\n\nMerci pour votre règlement.\n\n— ${orgSettings?.companyName || 'Minsouah Immobilier'}`);
                          window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
                        }}
                        className="flex items-center gap-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-label-sm font-bold px-3 py-1.5 rounded-lg transition-colors"
                        title="Envoyer via WhatsApp"
                      >
                        <Icon name="chat" size={16} />
                        WhatsApp
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* ── Rapports d'état des lieux ── */}
            {(() => {
              const tenantInspections = (inspections || []).filter(i =>
                i.tenantId === tenant?.id ||
                (tenant?.name && i.tenantName && i.tenantName.toLowerCase() === tenant.name.toLowerCase())
              );
              if (tenantInspections.length === 0) return null;
              const TYPE_LABEL = { ENTRY: "Entrée", EXIT: "Sortie" };
              const TYPE_COLOR = { ENTRY: 'bg-green-100 text-green-700', EXIT: 'bg-red-100 text-red-700' };
              const TYPE_ICON  = { ENTRY: 'login', EXIT: 'logout' };
              return (
                <>
                  <h3 className="font-bold text-on-surface mt-4">Rapports d'état des lieux</h3>
                  <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 overflow-hidden">
                    {tenantInspections.map(insp => (
                      <div key={insp.id} className="flex items-center justify-between px-md py-3 border-b border-outline-variant/10 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${TYPE_COLOR[insp.type] || 'bg-surface-container'}`}>
                            <Icon name={TYPE_ICON[insp.type] || 'home_work'} size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-on-surface text-label-md">
                              État des lieux {TYPE_LABEL[insp.type] || insp.type} — {insp.ref}
                            </p>
                            <p className="text-body-sm text-on-surface-variant">
                              {insp.propertyName || '—'}{insp.unitRef ? ` · ${insp.unitRef}` : ''} · {insp.scheduledDate ? new Date(insp.scheduledDate).toLocaleDateString('fr-FR') : '—'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => openEDLReport(insp)}
                          className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-label-sm font-bold px-3 py-1.5 rounded-lg transition-colors"
                          title="Imprimer / Télécharger"
                        >
                          <Icon name="download" size={16} />
                          Rapport
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
