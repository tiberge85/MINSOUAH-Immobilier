import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const TYPES = ['Propriétaire', 'Locataire'];
const STATUSES = ['Nouveau', 'En cours', 'Converti', 'Perdu'];
const STATUS_CLS = {
  'Nouveau': 'bg-surface-container-high text-on-surface-variant',
  'En cours': 'bg-amber-100 text-amber-800',
  'Converti': 'bg-green-100 text-green-700',
  'Perdu': 'bg-red-100 text-red-700',
};
const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary';
const EMPTY = { name: '', type: 'Propriétaire', source: '', nbVisites: 0, status: 'Nouveau', note: '' };

export default function Prospection() {
  const { state } = useApp();
  const orgId = state.currentUser?.orgId || 'default';
  const agencyName = (state.organizations || []).find(o => o.id === orgId)?.name || '';

  const [list, setList] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [fType, setFType] = useState('Tous');
  const [fStatus, setFStatus] = useState('Tous');

  useEffect(() => {
    const q = query(collection(db, 'workspaces', WS, 'prospects'), where('orgId', '==', orgId));
    const unsub = onSnapshot(q,
      (snap) => setList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))),
      (e) => setMsg('Lecture impossible : ' + (e?.code || e?.message)));
    return unsub;
  }, [orgId]);

  const stats = useMemo(() => {
    const year = new Date().getFullYear();
    const inY = list.filter(p => !p.createdAt || new Date(p.createdAt).getFullYear() === year);
    const conv = inY.filter(p => p.status === 'Converti').length;
    return {
      total: inY.length,
      proprio: inY.filter(p => p.type === 'Propriétaire').length,
      locataire: inY.filter(p => p.type === 'Locataire').length,
      visites: inY.reduce((s, p) => s + (Number(p.nbVisites) || 0), 0),
      mandats: conv,
      conversion: inY.length ? Math.round((conv / inY.length) * 100) : 0,
    };
  }, [list]);

  const shown = list.filter(p => (fType === 'Tous' || p.type === fType) && (fStatus === 'Tous' || p.status === fStatus));

  const resetForm = () => { setForm(EMPTY); setEditId(null); };

  async function save() {
    if (!form.name.trim()) { setMsg('Le nom est requis.'); return; }
    setBusy(true); setMsg('');
    try {
      const payload = { ...form, nbVisites: Number(form.nbVisites) || 0, orgId };
      if (editId) {
        await updateDoc(doc(db, 'workspaces', WS, 'prospects', editId), { ...payload, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(db, 'workspaces', WS, 'prospects'), { ...payload, createdAt: new Date().toISOString() });
      }
      resetForm(); setMsg('Enregistré ✓'); setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg("Échec de l'enregistrement : " + (e?.code || e?.message)); }
    finally { setBusy(false); }
  }

  function edit(p) { setEditId(p.id); setForm({ name: p.name || '', type: p.type || 'Propriétaire', source: p.source || '', nbVisites: p.nbVisites || 0, status: p.status || 'Nouveau', note: p.note || '' }); }

  async function remove(p) {
    if (!window.confirm(`Supprimer le prospect « ${p.name} » ?`)) return;
    try { await deleteDoc(doc(db, 'workspaces', WS, 'prospects', p.id)); }
    catch (e) { setMsg('Suppression impossible : ' + (e?.code || e?.message)); }
  }

  return (
    <div className="flex flex-col gap-md">
      <div>
        <h2 className="font-bold text-on-surface text-lg flex items-center gap-2"><Icon name="group_add" size={22} className="text-primary" /> Prospection commerciale</h2>
        <p className="text-sm text-on-surface-variant mt-0.5">Suivi des prospects, visites et mandats obtenus{agencyName ? ` — ${agencyName}` : ''}. Alimente les indicateurs commerciaux du rapport d'exercice.</p>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-6 gap-md">
        {[
          { l: 'Prospects (an.)', v: stats.total, c: 'text-primary' },
          { l: 'Propriétaires', v: stats.proprio, c: 'text-on-surface' },
          { l: 'Locataires', v: stats.locataire, c: 'text-on-surface' },
          { l: 'Visites', v: stats.visites, c: 'text-blue-700' },
          { l: 'Mandats obtenus', v: stats.mandats, c: 'text-green-700' },
          { l: 'Conversion', v: stats.conversion + '%', c: 'text-amber-700' },
        ].map(k => (
          <div key={k.l} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20">
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">{k.l}</p>
            <p className={`font-bold mt-0.5 text-lg ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </section>

      {/* Formulaire */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 p-md flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-on-surface text-sm">{editId ? 'Modifier le prospect' : 'Ajouter un prospect'}</h3>
          {msg && <span className="text-xs text-on-surface-variant">{msg}</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="text-xs font-semibold text-on-surface">Nom / Contact</label><input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom du prospect" /></div>
          <div><label className="text-xs font-semibold text-on-surface">Type</label><select className={inputCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div><label className="text-xs font-semibold text-on-surface">Source</label><input className={inputCls} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="Recommandation, annonce…" /></div>
          <div><label className="text-xs font-semibold text-on-surface">Nombre de visites</label><input type="number" min="0" className={inputCls} value={form.nbVisites} onChange={e => setForm(f => ({ ...f, nbVisites: e.target.value }))} /></div>
          <div><label className="text-xs font-semibold text-on-surface">Statut</label><select className={inputCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label className="text-xs font-semibold text-on-surface">Note</label><input className={inputCls} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Remarque (optionnel)" /></div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 bg-primary text-on-primary font-semibold rounded-lg px-4 py-2 text-sm hover:bg-primary/90 disabled:opacity-50"><Icon name={editId ? 'save' : 'add'} size={16} /> {editId ? 'Enregistrer' : 'Ajouter'}</button>
          {editId && <button onClick={resetForm} className="inline-flex items-center gap-1.5 bg-surface-container-high text-on-surface font-semibold rounded-lg px-4 py-2 text-sm hover:bg-outline-variant/30">Annuler</button>}
        </div>
      </div>

      {/* Liste */}
      <div className="flex gap-2 flex-wrap">
        <select className={inputCls + ' w-auto'} value={fType} onChange={e => setFType(e.target.value)}><option>Tous</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>
        <select className={inputCls + ' w-auto'} value={fStatus} onChange={e => setFStatus(e.target.value)}><option>Tous</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-secondary text-on-primary">
              <tr>{['Nom', 'Type', 'Source', 'Visites', 'Statut', 'Créé le', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {shown.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-on-surface-variant"><Icon name="group_add" size={34} className="opacity-30 mb-2" /><p>Aucun prospect enregistré.</p></td></tr>}
              {shown.map(p => (
                <tr key={p.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3 text-sm font-semibold text-on-surface">{p.name}{p.note ? <span className="block text-xs text-on-surface-variant font-normal">{p.note}</span> : null}</td>
                  <td className="px-4 py-3 text-sm">{p.type}</td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{p.source || '—'}</td>
                  <td className="px-4 py-3 text-sm">{p.nbVisites || 0}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLS[p.status] || ''}`}>{p.status}</span></td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => edit(p)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-high">Modifier</button>
                      <button onClick={() => remove(p)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-red-300 text-red-700 hover:bg-red-50">Suppr.</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
