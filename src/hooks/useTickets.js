import { useState, useEffect } from 'react';
import { tickets as mockTickets } from '../data/mockData';
// [SUPABASE] import { supabase } from '../lib/supabase';

export function useTickets() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setData(mockTickets);
    setLoading(false);
    // [SUPABASE] supabase.from('tickets').select('*').then(({ data }) => { setData(data); setLoading(false); });
  }, []);

  const addTicket = (ticket) => {
    const newTicket = { ...ticket, id: `MNT-${9000 + data.length}`, status: 'En attente', reportedAt: new Date().toLocaleString('fr-FR') };
    setData((prev) => [newTicket, ...prev]);
    // [SUPABASE] supabase.from('tickets').insert([newTicket]);
    return newTicket;
  };

  const updateStatus = (id, status) => {
    setData((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    // [SUPABASE] supabase.from('tickets').update({ status }).eq('id', id);
  };

  return { data, loading, addTicket, updateStatus };
}
