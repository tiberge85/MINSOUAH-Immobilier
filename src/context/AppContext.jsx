import { createContext, useContext, useReducer, useEffect } from 'react';
import {
  properties as mockProperties,
  contracts as mockContracts,
  tenants as mockTenants,
  owners as mockOwners,
  transactions as mockTransactions,
  tickets as mockTickets,
  conversations as mockConversations,
  revenueData as mockRevenueData,
  alerts as mockAlerts,
  payments as mockPayments,
} from '../data/mockData';

// ─── Initial state ─────────────────────────────────────────────────────────────
const INITIAL_STATE = {
  properties:    mockProperties,
  contracts:     mockContracts,
  tenants:       mockTenants,
  owners:        mockOwners,
  transactions:  mockTransactions,
  tickets:       mockTickets,
  conversations: mockConversations,
  revenueData:   mockRevenueData,
  alerts:        mockAlerts,
  payments:      mockPayments,
};

// ─── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state, action) {
  const { type, payload } = action;

  switch (type) {
    // ── Properties ──────────────────────────────────────────────────────────
    case 'ADD_PROPERTY':
      return { ...state, properties: [{ ...payload, id: Date.now() }, ...state.properties] };
    case 'UPDATE_PROPERTY':
      return { ...state, properties: state.properties.map(p => p.id === payload.id ? payload : p) };
    case 'DELETE_PROPERTY':
      return { ...state, properties: state.properties.filter(p => p.id !== payload) };

    // ── Contracts ────────────────────────────────────────────────────────────
    case 'ADD_CONTRACT':
      return { ...state, contracts: [{ ...payload, id: Date.now() }, ...state.contracts] };
    case 'UPDATE_CONTRACT':
      return { ...state, contracts: state.contracts.map(c => c.id === payload.id ? payload : c) };
    case 'DELETE_CONTRACT':
      return { ...state, contracts: state.contracts.filter(c => c.id !== payload) };

    // ── Tenants ──────────────────────────────────────────────────────────────
    case 'ADD_TENANT':
      return { ...state, tenants: [{ ...payload, id: Date.now() }, ...state.tenants] };
    case 'UPDATE_TENANT':
      return { ...state, tenants: state.tenants.map(t => t.id === payload.id ? payload : t) };
    case 'DELETE_TENANT':
      return { ...state, tenants: state.tenants.filter(t => t.id !== payload) };

    // ── Owners ───────────────────────────────────────────────────────────────
    case 'ADD_OWNER':
      return { ...state, owners: [{ ...payload, id: Date.now() }, ...state.owners] };
    case 'UPDATE_OWNER':
      return { ...state, owners: state.owners.map(o => o.id === payload.id ? payload : o) };
    case 'DELETE_OWNER':
      return { ...state, owners: state.owners.filter(o => o.id !== payload) };

    // ── Transactions ─────────────────────────────────────────────────────────
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [{ ...payload, id: Date.now() }, ...state.transactions] };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== payload) };

    // ── Payments ─────────────────────────────────────────────────────────────
    case 'ADD_PAYMENT':
      return { ...state, payments: [{ ...payload, id: Date.now() }, ...state.payments] };
    case 'UPDATE_PAYMENT':
      return { ...state, payments: state.payments.map(p => p.id === payload.id ? payload : p) };
    case 'MARK_PAYMENT_PAID':
      return {
        ...state,
        payments: state.payments.map(p =>
          p.id === payload
            ? { ...p, status: 'Payé', paidDate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
            : p
        ),
      };
    case 'SEND_REMINDER':
      return {
        ...state,
        payments: state.payments.map(p =>
          p.id === payload
            ? { ...p, reminderSent: true, reminderCount: (p.reminderCount || 0) + 1, status: p.status === 'Impayé' ? 'En retard' : p.status }
            : p
        ),
      };

    // ── Tickets ──────────────────────────────────────────────────────────────
    case 'ADD_TICKET':
      return { ...state, tickets: [payload, ...state.tickets] };
    case 'UPDATE_TICKET':
      return { ...state, tickets: state.tickets.map(t => t.id === payload.id ? payload : t) };
    case 'DELETE_TICKET':
      return { ...state, tickets: state.tickets.filter(t => t.id !== payload) };

    // ── Conversations ─────────────────────────────────────────────────────────
    case 'SEND_MESSAGE': {
      const { convId, message } = payload;
      return {
        ...state,
        conversations: state.conversations.map(c => {
          if (c.id !== convId) return c;
          return {
            ...c,
            lastMessage: message.text,
            time: message.time,
            unread: 0,
            messages: [...c.messages, message],
          };
        }),
      };
    }
    case 'MARK_READ':
      return { ...state, conversations: state.conversations.map(c => c.id === payload ? { ...c, unread: 0 } : c) };

    // ── Reset to defaults ────────────────────────────────────────────────────
    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ─── Context ───────────────────────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(
    reducer,
    INITIAL_STATE,
    (init) => {
      try {
        const saved = localStorage.getItem('minsouah_v1');
        return saved ? JSON.parse(saved) : init;
      } catch {
        return init;
      }
    }
  );

  // Persist every change to localStorage
  useEffect(() => {
    localStorage.setItem('minsouah_v1', JSON.stringify(state));
  }, [state]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
