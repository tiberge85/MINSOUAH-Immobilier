import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import Modal from '../components/ui/Modal';
import { can, FULL_ACCESS_ROLES } from '../lib/permissions';
import { compressImage } from '../lib/storage';

const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary';

// Limite totale des pièces jointes par rapport (stockées dans le document — la
// limite Firestore est 1 Mo ; on garde de la marge pour le titre + le texte).
const MAX_TOTAL_BYTES = 850 * 1024;

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

// Estimation de la taille d'une chaîne base64 (data URL) en octets.
const dataUrlBytes = (u) => Math.ceil(((u || '').split(',')[1] || '').length * 0.75);

export default function Reports() {
  const { state, dispatch } = useApp();
  const user = state.currentUser;
  const isAdmin = FULL_ACCESS_ROLES.includes(user?.role);
  const canCreate = can(user, 'reports', 'create');
  const canDeletePerm = can(user, 'reports', 'delete');

  const orgUsers = useMemo(
    () => (state.users || []).filter(u => u.orgId === user?.orgId && String(u.id) !== String(user?.id)),
    [state.users, user]
  );

  const visibleReports = useMemo(() => {
    return (state.reports || [])
      .filter(r => r.orgId === user?.orgId)
      .filter(r =>
        isAdmin ||
        String(r.authorId) === String(user?.id) ||
        (r.readerIds || []).map(String).includes(String(user?.id))
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [state.reports, user, isAdmin]);

  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', readerIds: [], attachments: [] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const resetForm = () => setForm({ title: '', body: '', readerIds: [], attachments: [] });
  const nameOf = (id) => (state.users || []).find(u => String(u.id) === String(id))?.name || '—';

  const toggleReader = (id) => setForm(f => ({
    ...f,
    readerIds: f.readerIds.includes(id) ? f.readerIds.filter(x => x !== id) : [...f.readerIds, id],
  }));

  const onFiles = async (e) => {
    setErr('');
    const list = Array.from(e.target.files || []);
    e.target.value = '';
    setBusy(true);
    try {
      const next = [...form.attachments];
      let total = next.reduce((s, a) => s + dataUrlBytes(a.dataUrl), 0);
      for (const file of list) {
        let f = file;
        if ((file.type || '').startsWith('image/')) {
          try { f = await compressImage(file, 1400, 0.7); } catch { /* garde l'original */ }
        }
        const dataUrl = await fileToDataUrl(f);
        const bytes = dataUrlBytes(dataUrl);
        if (total + bytes > MAX_TOTAL_BYTES) {
          setErr(`« ${file.name} » dépasse la limite (total ~850 Ko/rapport). Réduisez la taille ou joignez moins de fichiers.`);
          continue;
        }
        total += bytes;
        next.push({ name: file.name, type: f.type || file.type || '', dataUrl });
      }
      setForm(prev => ({ ...prev, attachments: next }));
    } catch (e) {
      console.error('[Reports] lecture fichier', e);
      setErr("Impossible de lire un fichier. Réessayez.");
    } finally {
      setBusy(false);
    }
  };
  const removeAttachment = (i) => setForm(f => ({ ...f, attachments: f.attachments.filter((_, idx) => idx !== i) }));

  const submit = () => {
    setErr('');
    if (!form.title.trim()) { setErr('Le titre est obligatoire.'); return; }
    dispatch({ type: 'ADD_REPORT', payload: {
      title: form.title.trim(),
      body: form.body,
      readerIds: form.readerIds,
      attachments: form.attachments.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl })),
    }});
    resetForm();
    setShowForm(false);
  };

  const del = (r) => {
    if (!window.confirm(`Supprimer le rapport « ${r.title} » ?`)) return;
    dispatch({ type: 'DELETE_REPORT', payload: r.id });
    if (viewing?.id === r.id) setViewing(null);
  };

  const usedBytes = form.attachments.reduce((s, a) => s + dataUrlBytes(a.dataUrl), 0);

  return (
    <div className="px-3 sm:px-6 md:px-margin pt-4 sm:pt-gutter pb-xl flex flex-col gap-gutter max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-h2 text-h2 text-on-surface flex items-center gap-2"><Icon name="description" className="text-primary" /> Rapports</h1>
          <p className="text-body-sm text-on-surface-variant">Rédigez des rapports et choisissez qui peut les lire.</p>
        </div>
        {canCreate && (
          <button onClick={() => { resetForm(); setErr(''); setShowForm(true); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            <Icon name="add" size={18} /> Nouveau rapport
          </button>
        )}
      </div>

      {visibleReports.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant flex flex-col items-center gap-3">
          <Icon name="description" size={48} className="opacity-30" />
          <p>Aucun rapport pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          {visibleReports.map(r => (
            <div key={r.id} onClick={() => setViewing(r)} className="bg-surface-container-lowest rounded-xl p-md shadow-card border border-outline-variant/20 flex flex-col gap-2 cursor-pointer hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-on-surface line-clamp-2">{r.title}</h3>
                {(isAdmin || String(r.authorId) === String(user?.id)) && canDeletePerm && (
                  <button onClick={(e) => { e.stopPropagation(); del(r); }} className="text-on-surface-variant hover:text-error shrink-0"><Icon name="delete" size={18} /></button>
                )}
              </div>
              <p className="text-body-sm text-on-surface-variant line-clamp-2">{r.body || '—'}</p>
              <div className="flex items-center gap-3 text-xs text-on-surface-variant mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1"><Icon name="person" size={14} /> {r.authorName || nameOf(r.authorId)}</span>
                <span className="inline-flex items-center gap-1"><Icon name="schedule" size={14} /> {fmtDate(r.createdAt)}</span>
                {(r.attachments || []).length > 0 && <span className="inline-flex items-center gap-1"><Icon name="attach_file" size={14} /> {r.attachments.length}</span>}
                <span className="inline-flex items-center gap-1"><Icon name="visibility" size={14} /> {(r.readerIds || []).length + 1}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Créer un rapport */}
      <Modal
        open={showForm}
        onClose={() => { if (!busy) setShowForm(false); }}
        title="Nouveau rapport"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant disabled:opacity-60">Annuler</button>
            <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name="send" size={18} /> Publier
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {err && <div className="bg-error/10 text-error rounded-lg px-3 py-2 text-sm">{err}</div>}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase">Titre</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="Titre du rapport" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase">Contenu</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={7} className={inputCls} placeholder="Rédigez votre rapport…" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase">Pièces jointes <span className="normal-case font-normal text-on-surface-variant/70">(images compressées · total ~850 Ko)</span></label>
            <input type="file" multiple onChange={onFiles} disabled={busy} className="text-sm text-on-surface-variant" />
            {busy && <span className="text-xs text-on-surface-variant inline-flex items-center gap-1"><Icon name="progress_activity" size={14} className="animate-spin" /> Traitement…</span>}
            {form.attachments.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {form.attachments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-surface-container rounded px-2 py-1">
                    <span className="truncate inline-flex items-center gap-1"><Icon name={(a.type||'').startsWith('image/') ? 'image' : 'attach_file'} size={14} /> {a.name}</span>
                    <button onClick={() => removeAttachment(i)} className="text-on-surface-variant hover:text-error shrink-0"><Icon name="close" size={16} /></button>
                  </div>
                ))}
                <span className="text-xs text-on-surface-variant">{Math.round(usedBytes / 1024)} Ko / 850 Ko</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-on-surface-variant uppercase">Qui peut lire ? <span className="normal-case font-normal text-on-surface-variant/70">(vous et les admins pouvez toujours lire)</span></label>
            <div className="max-h-48 overflow-y-auto border border-outline-variant rounded-lg divide-y divide-outline-variant/30">
              {orgUsers.length === 0 && <p className="text-sm text-on-surface-variant p-3">Aucun autre utilisateur dans l'organisation.</p>}
              {orgUsers.map(u => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface-container">
                  <input type="checkbox" checked={form.readerIds.includes(u.id)} onChange={() => toggleReader(u.id)} />
                  <span className="font-medium text-on-surface">{u.name}</span>
                  <span className="text-on-surface-variant text-xs">· {u.role}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Lire un rapport */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.title || 'Rapport'} size="md">
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 text-xs text-on-surface-variant flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon name="person" size={14} /> {viewing.authorName || nameOf(viewing.authorId)}</span>
              <span className="inline-flex items-center gap-1"><Icon name="schedule" size={14} /> {fmtDate(viewing.createdAt)}</span>
            </div>
            <p className="text-body text-on-surface whitespace-pre-wrap">{viewing.body || '—'}</p>
            {(viewing.attachments || []).length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-on-surface-variant uppercase">Pièces jointes</p>
                <div className="flex flex-wrap gap-2">
                  {viewing.attachments.map((a, i) => (
                    (a.type || '').startsWith('image/')
                      ? <a key={i} href={a.dataUrl} target="_blank" rel="noopener noreferrer" title={a.name}><img src={a.dataUrl} alt={a.name} className="w-28 h-28 object-cover rounded-lg border border-outline-variant/30" /></a>
                      : <a key={i} href={a.dataUrl} download={a.name} className="inline-flex items-center gap-2 text-primary hover:underline text-sm border border-outline-variant/30 rounded-lg px-3 py-2"><Icon name="attach_file" size={16} /> {a.name}</a>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1 border-t border-outline-variant/30 pt-3">
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Lecteurs autorisés</p>
              <p className="text-sm text-on-surface-variant">{[viewing.authorName || nameOf(viewing.authorId), ...(viewing.readerIds || []).map(nameOf)].join(', ')}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
