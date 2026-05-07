// ─────────────────────────────────────────────────────────────────────────────
//  Hook : useProperties
//  Utilise les données mockées par défaut.
//  Pour activer Supabase, décommente les lignes marquées [SUPABASE].
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { properties as mockProperties } from '../data/mockData';
// [SUPABASE] import { supabase } from '../lib/supabase';

export function useProperties() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // ── Mode mock (actif par défaut) ────────────────────────────────────────
    setData(mockProperties);
    setLoading(false);

    // ── Mode Supabase (décommente quand prêt) ──────────────────────────────
    // async function fetch() {
    //   const { data, error } = await supabase.from('properties').select('*');
    //   if (error) setError(error.message);
    //   else setData(data);
    //   setLoading(false);
    // }
    // fetch();
  }, []);

  const addProperty = async (property) => {
    // ── Mode mock ───────────────────────────────────────────────────────────
    const newProp = { ...property, id: Date.now() };
    setData((prev) => [newProp, ...prev]);
    return newProp;

    // ── Mode Supabase ───────────────────────────────────────────────────────
    // const { data, error } = await supabase.from('properties').insert([property]).select().single();
    // if (!error) setData((prev) => [data, ...prev]);
    // return data;
  };

  const deleteProperty = async (id) => {
    setData((prev) => prev.filter((p) => p.id !== id));
    // [SUPABASE] await supabase.from('properties').delete().eq('id', id);
  };

  const updateProperty = async (id, updates) => {
    setData((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    // [SUPABASE] await supabase.from('properties').update(updates).eq('id', id);
  };

  return { data, loading, error, addProperty, deleteProperty, updateProperty };
}
