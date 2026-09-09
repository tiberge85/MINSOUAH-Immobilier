import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Icon from '../components/Icon';
import Modal from '../components/ui/Modal';
import { can, FULL_ACCESS_ROLES } from '../lib/permissions';
import { uploadFile } from '../lib/storage';

const inputCls = 'w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface-container-lowest focus:outline-none focus:border-primary';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Reports() {
  const { state, dispatch } = useApp();
  const user = state.currentUser;
  const isAdmin = FULL_ACCESS_ROLES.includes(user?.role);
  const canCreate = can(user, 'reports', 'create');
  const canDeletePerm = can(user, 'reports', 'delete');

  // Autres utilisateurs de la même organisation (destinataires possibles)
  const orgUsers = useMemo(
    () => (state.users || []).filter(u => u.orgId === user?.orgId && String(u.id) !== String(user?.id)),
    [state.users, user]
  );

  // Rapports visibles : l'auteur, un destinataire, ou un admin
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
  const [form, setForm] = useState({ title: '', body: '', readerIds: [], files: [] });
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  const resetForm = () => setForm({ title: '', body: '', readerIds: [], files: [] });
  const nameOf = (id) => (state.users || []).find(u => String(u.id) === String(id))?.name || '—';

  const toggleReader = (id) => setForm(f => ({
    ...f,
    readerIds: f.readerIds.includes(id) ? f.readerIds.filter(x => x !== id) : [...f.readerIds, id],
  }));

  const onFiles = (e) => {
    const list = Array.from(e.target.files || []);
    setForm(f => ({ ...f, files: [...f.files, ...list] }));
    e.target.value = '';
  };
  const removeFile = (i) => setForm(f => ({ ...f, files: f.files.filter((_, idx) => idx !== i) }));

  const submit = async () => {
    setErr('');
    if (!form.title.trim()) { setErr('Le titre est obligatoire.'); return; }
    setUploading(true);
    try {
      const reportId = `rep_${Date.now()}`;
      const attachments = [];
      for (const file of form.files) {
        if (file.size > 25 * 1024 * 1024) { setErr(`« ${file.name} » dépasse 25 Mo.`); setUploading(false); return; }
        const path = `orgs/${user.orgId}/reports/${reportId}/${Date.now()}_${file.name}`;
        const url = await uploadFile(path, file);
        attachments.push({ name: file.name, url, type: file.type || '', size: file.size });
      }
      dispatch({ type: 'ADD_REPORT', payload: { id: reportId, title: form.title.trim(), body: form.body, readerIds: form.readerIds, attachments } });
      resetForm();
      setShowForm(false);
    } catch (e) {
      console.error('[Reports] upload', e);
      setErr("Échec de l'envoi des pièces jointes. Réessayez ou publiez sans pièce jointe.");
    } finally {
      setUploading(false);
    }
  };

  const del = (r) => {
    if (!window.confirm(`Supprimer le rapport « ${r.title} » ?`)) return;
    dispatch({ type: 'DELETE_REPORT', payload: r.id });
    if (viewing?.id === r.id) setViewing(null);
  };

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
        onClose={() => { if (!uploading) setShowForm(false); }}
        title="Nouveau rapport"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} disabled={uploading} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant disabled:opacity-60">Annuler</button>
            <button onClick={submit} disabled={uploading} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-semibold inline-flex items-center gap-2 disabled:opacity-60">
              {uploading ? <><Icon name="progress_activity" size={18} className="animate-spin" /> Envoi…</> : <><Icon name="send" size={18} /> Publier</>}
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
            <label className="text-xs font-semibold text-on-surface-variant uppercase">Pièces jointes</label>
            <input type="file" multiple onChange={onFiles} className="text-sm text-on-surface-variant" />
            {form.files.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {form.files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-surface-container rounded px-2 py-1">
                    <span className="truncate inline-flex items-center gap-1"><Icon name="attach_file" size={14} /> {f.name}</span>
                    <button onClick={() => removeFile(i)} className="text-on-surface-variant hover:text-error shrink-0"><Icon name="close" size={16} /></button>
                  </div>
                ))}
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
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-on-surface-variant uppercase">Pièces jointes</p>
                {viewing.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary hover:underline text-sm">
                    <Icon name="attach_file" size={16} /> {a.name}
                  </a>
                ))}
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
