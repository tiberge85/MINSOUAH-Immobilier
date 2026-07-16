import { useMemo, useRef, useState } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { db } from '../lib/firebase';
import Icon from './Icon';

/* ────────────────────────────────────────────────────────────────────────────
   Documents du locataire — dossier complet, consultable partout.

   Stockage 100 % Firestore (plan gratuit), sans Firebase Storage. Un fichier
   volumineux (jusqu'à 7 Mo) est encodé en base64 puis DÉCOUPÉ en morceaux de
   < 1 Mo, chacun enregistré comme un document séparé de la collection
   `tenantDocuments` (champ `_chunk: true`). Le document « métadonnées » porte
   `chunked: true` + `chunkCount`. À l'ouverture, les morceaux sont réassemblés.
   Les anciens documents encodés en base64 dans un seul champ `dataUrl` restent
   lisibles pour compatibilité. Réutilisable en lecture seule (portail locataire)
   ou en édition (gestion locative).
   ──────────────────────────────────────────────────────────────────────────── */

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';

// Limite par fichier (binaire) — portée à 7 Mo.
const MAX_FILE_BYTES = 7 * 1024 * 1024;
// Taille d'un morceau de base64 (caractères) — bien en dessous de la limite
// Firestore de ~1 Mo par document.
const CHUNK_SIZE = 700 * 1024;

export const DOC_CATEGORIES = [
  "Pièce d'identité",
  'Contrat de bail',
  'Justificatif de revenu',
  'Justificatif de domicile',
  'Caution / Garant',
  'Attestation',
  'Autre',
];

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

// Compression d'image via canvas → JPEG (réduit le nombre de morceaux)
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

function openResolved(dataUrl) {
  if (!dataUrl) { alert('Document introuvable ou incomplet.'); return; }
  if (/^https?:\/\//.test(dataUrl)) { window.open(dataUrl, '_blank', 'noopener'); return; }
  try {
    const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch {
    window.open(dataUrl, '_blank');
  }
}

function downloadResolved(dataUrl, filename) {
  if (!dataUrl) { alert('Document introuvable ou incomplet.'); return; }
  if (/^https?:\/\//.test(dataUrl)) {
    const a = document.createElement('a');
    a.href = dataUrl; a.target = '_blank'; a.rel = 'noopener'; a.download = filename || 'document';
    document.body.appendChild(a); a.click(); a.remove();
    return;
  }
  try {
    const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'document';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch { /* ignore */ }
}

export default function TenantDocuments({ tenantId, tenantName, readOnly = false }) {
  const { state, dispatch } = useApp();
  const fileRef = useRef(null);
  const [category, setCategory] = useState(DOC_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const orgId = state.currentUser?.orgId || 'default';

  // Documents "métadonnées" du locataire (on exclut les morceaux `_chunk`)
  const docs = useMemo(
    () => (state.tenantDocuments || [])
      .filter(d => !d._chunk && String(d.tenantId) === String(tenantId))
      .sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')),
    [state.tenantDocuments, tenantId]
  );

  // Réassemble le base64 d'un document (ancien champ dataUrl, URL Storage, ou morceaux)
  const resolveDataUrl = (d) => {
    if (d.dataUrl) return d.dataUrl;
    if (d.downloadUrl) return d.downloadUrl;
    if (d.chunked) {
      const parts = (state.tenantDocuments || [])
        .filter(c => c._chunk && String(c.parentId) === String(d.id))
        .sort((a, b) => (a.i || 0) - (b.i || 0))
        .map(c => c.data || '');
      return parts.join('');
    }
    return '';
  };

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !tenantId) return;
    setError('');
    setBusy(true);
    try {
      // Type « Autre » → on utilise le libellé précisé par l'utilisateur
      const effectiveCategory = (category === 'Autre' && customCategory.trim())
        ? customCategory.trim()
        : category;
      for (const file of files) {
        if (file.size > MAX_FILE_BYTES) {
          setError(`« ${file.name} » dépasse la limite de 7 Mo. Choisissez un fichier plus léger.`);
          continue;
        }
        // Encodage base64 (les images sont compressées pour réduire le poids)
        let dataUrl;
        if (file.type?.startsWith('image/')) {
          dataUrl = await compressImage(file);
        } else {
          dataUrl = await readAsDataUrl(file);
        }

        const docId = Date.now() + Math.floor(Math.random() * 1e6);

        // Découpe en morceaux < 1 Mo
        const chunks = [];
        for (let i = 0; i < dataUrl.length; i += CHUNK_SIZE) chunks.push(dataUrl.slice(i, i + CHUNK_SIZE));

        setProgress(0);
        // 1) Écrit les morceaux (documents séparés `_chunk`) dans la même collection
        for (let i = 0; i < chunks.length; i++) {
          const chunkId = `${docId}__c${i}`;
          await setDoc(doc(db, 'workspaces', WS, 'tenantDocuments', chunkId), {
            id: chunkId, _chunk: true, parentId: docId, i, data: chunks[i], orgId,
          });
          setProgress(Math.round(((i + 1) / chunks.length) * 100));
        }

        // 2) Écrit le document "métadonnées" (sans le contenu)
        await dispatch({
          type: 'ADD_TENANT_DOCUMENT',
          payload: {
            id: docId,
            tenantId, tenantName: tenantName || '',
            name: file.name, fileName: file.name,
            category: effectiveCategory,
            mimeType: file.type || 'application/octet-stream',
            size: file.size || 0,
            chunked: true,
            chunkCount: chunks.length,
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
    // Supprime d'abord les morceaux liés
    if (d.chunked) {
      (state.tenantDocuments || [])
        .filter(c => c._chunk && String(c.parentId) === String(d.id))
        .forEach(c => { deleteDoc(doc(db, 'workspaces', WS, 'tenantDocuments', String(c.id))).catch(() => {}); });
    }
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
          {category === 'Autre' && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface-variant">
              Préciser le type <span className="text-red-600">*</span>
              <input type="text" value={customCategory} onChange={e => setCustomCategory(e.target.value)}
                placeholder="Ex. : Reçu de caution, Assurance…"
                className="px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface text-sm text-on-surface min-w-[200px]" />
            </label>
          )}
          <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" onChange={onFiles} className="hidden" />
          <button type="button" disabled={busy || (category === 'Autre' && !customCategory.trim())}
            title={category === 'Autre' && !customCategory.trim() ? 'Précisez d\'abord le type de document' : undefined}
            onClick={() => fileRef.current?.click()}
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
                  ? <img src={resolveDataUrl(d)} alt={d.name} className="w-full h-full object-cover" />
                  : <Icon name={catIcon(d.category)} className="text-primary" size={22} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-on-surface truncate" title={d.name}>{d.name}</p>
                <p className="text-xs text-on-surface-variant truncate">
                  {d.category}{d.size ? ` · ${fmtSize(d.size)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" title="Consulter" onClick={() => openResolved(resolveDataUrl(d))}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10"><Icon name="visibility" size={18} /></button>
                <button type="button" title="Télécharger" onClick={() => downloadResolved(resolveDataUrl(d), d.fileName || d.name)}
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
