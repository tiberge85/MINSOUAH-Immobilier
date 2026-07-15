import { useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { uploadFile, deleteFile, STORAGE_PATHS } from '../lib/storage';
import Icon from './Icon';

/* ────────────────────────────────────────────────────────────────────────────
   Documents du locataire — dossier complet, consultable partout.

   Les fichiers sont désormais stockés dans Firebase Storage (jusqu'à 7 Mo par
   fichier). La collection Firestore `tenantDocuments` ne garde que les
   métadonnées + l'URL de téléchargement (`downloadUrl`) et le chemin Storage
   (`storagePath`). Les anciens documents encodés en base64 (`dataUrl`) restent
   lisibles pour compatibilité. Réutilisable en lecture seule (portail locataire)
   ou en édition (gestion locative).
   ──────────────────────────────────────────────────────────────────────────── */

// Limite par fichier (Firebase Storage) — porté à 7 Mo.
const MAX_FILE_BYTES = 7 * 1024 * 1024;

export const DOC_CATEGORIES = [
  "Pièce d'identité",
  'Contrat de bail',
  'Justificatif de revenu',
  'Justificatif de domicile',
  'Caution / Garant',
  'Attestation',
  'Autre',
];

// Limite prudente pour le fichier ENCODÉ base64 (Firestore ≈ 1 Mo / document).
const MAX_STORED_BYTES = 950 * 1024;

const fmtSize = (b) => {
  if (!b) return '';
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / (1024 * 1024)).toFixed(1)} Mo`;
};

const catIcon = (c) => ({
  "Pièce d'identité": 'badge',
  'Contrat de bail': 'description',
  'Justificatif de revenu': 'payments',
  'Justificatif de domicile': 'home',
  'Caution / Garant': 'shield',
  'Attestation': 'verified',
}[c] || 'attach_file');

// Compression d'image via canvas → JPEG (comme les états des lieux)
const compressImage = (file, maxDim = 1600, quality = 0.72) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      else if (height >= width && height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch { resolve(ev.target.result); }
    };
    img.onerror = () => resolve(ev.target.result);
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (ev) => resolve(ev.target.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// base64 dataURL → Blob (pour ouvrir/télécharger sans limite d'URL)
function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = (head.match(/data:(.*?);base64/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function openDocument(docu) {
  // Nouveau : fichier dans Firebase Storage
  if (docu.downloadUrl) { window.open(docu.downloadUrl, '_blank', 'noopener'); return; }
  // Ancien : base64 dans Firestore
  try {
    const url = URL.createObjectURL(dataUrlToBlob(docu.dataUrl));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    window.open(docu.dataUrl, '_blank');
  }
}

export function downloadDocument(docu) {
  // Nouveau : fichier dans Firebase Storage
  if (docu.downloadUrl) {
    const a = document.createElement('a');
    a.href = docu.downloadUrl; a.target = '_blank'; a.rel = 'noopener';
    a.download = docu.fileName || docu.name || 'document';
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  // Ancien : base64 dans Firestore
  try {
    const url = URL.createObjectURL(dataUrlToBlob(docu.dataUrl));
    const a = document.createElement('a');
    a.href = url; a.download = docu.fileName || docu.name || 'document';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch { /* ignore */ }
}

export default function TenantDocuments({ tenantId, tenantName, readOnly = false }) {
  const { state, dispatch } = useApp();
  const fileRef = useRef(null);
  const [category, setCategory] = useState(DOC_CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const orgId = state.currentUser?.orgId || 'default';

  const docs = useMemo(
    () => (state.tenantDocuments || [])
      .filter(d => String(d.tenantId) === String(tenantId))
      .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')),
    [state.tenantDocuments, tenantId]
  );

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !tenantId) return;
    setError('');
    setBusy(true);
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setError(`« ${file.name} » dépasse la limite de 7 Mo. Choisissez un fichier plus léger.`);
          continue;
        }
        const docId = Date.now() + Math.floor(Math.random() * 1e6);
        const safeName = (file.name || 'document').replace(/[^\w.\-]+/g, '_').slice(0, 80);
        // Chemin à UN SEUL segment sous documents/ pour matcher la règle Storage
        // `orgs/{orgId}/documents/{fileName}` (écriture manager, tout type, ≤ 25 Mo).
        const path = `${STORAGE_PATHS.documents(orgId)}/t${tenantId}_${docId}_${safeName}`;
        setProgress(0);
        const downloadUrl = await uploadFile(path, file, setProgress);
        await dispatch({
          type: 'ADD_TENANT_DOCUMENT',
          payload: {
            id: docId,
            tenantId, tenantName: tenantName || '',
            name: file.name, fileName: file.name,
            category,
            mimeType: file.type || 'application/octet-stream',
            size: file.size || 0,
            storagePath: path,
            downloadUrl,
          },
        });
      }
    } catch (err) {
      setError("Échec de l'ajout du document. Vérifiez votre connexion puis réessayez.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const remove = (d) => {
    if (!confirm(`Supprimer le document « ${d.name} » ?`)) return;
    if (d.storagePath) deleteFile(d.storagePath).catch(() => {}); // best-effort Storage cleanup
    dispatch({ type: 'DELETE_TENANT_DOCUMENT', payload: d.id });
  };

  const isImage = (d) => (d.mimeType || '').startsWith('image/');

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-surface-container border border-outline-variant/30">
          <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
            Type de document
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface text-sm text-on-surface min-w-[190px]">
              {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" onChange={onFiles} className="hidden" />
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
            <Icon name={busy ? 'hourglass_empty' : 'upload_file'} size={18} />
            {busy ? (progress != null ? `Envoi… ${progress}%` : 'Ajout…') : 'Ajouter un document'}
          </button>
          <span className="text-xs text-on-surface-variant">Images, PDF, Word — max 7 Mo par fichier.</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <Icon name="error" size={16} className="mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="text-center py-8 text-on-surface-variant">
          <Icon name="folder_open" size={36} className="opacity-30 mb-1" />
          <p className="text-sm">Aucun document{readOnly ? '' : " — ajoutez la pièce d'identité, le contrat, les justificatifs…"}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-outline-variant/30 bg-surface hover:bg-surface-container-low transition-colors">
              <div className="w-11 h-11 rounded-lg overflow-hidden flex items-center justify-center bg-surface-container shrink-0">
                {isImage(d)
                  ? <img src={d.downloadUrl || d.dataUrl} alt={d.name} className="w-full h-full object-cover" />
                  : <Icon name={catIcon(d.category)} className="text-primary" size={22} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate" title={d.name}>{d.name}</p>
                <p className="text-xs text-on-surface-variant truncate">
                  {d.category}{d.size ? ` · ${fmtSize(d.size)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" title="Consulter" onClick={() => openDocument(d)}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10"><Icon name="visibility" size={18} /></button>
                <button type="button" title="Télécharger" onClick={() => downloadDocument(d)}
                  className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container"><Icon name="download" size={18} /></button>
                {!readOnly && (
                  <button type="button" title="Supprimer" onClick={() => remove(d)}
                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"><Icon name="delete" size={18} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
