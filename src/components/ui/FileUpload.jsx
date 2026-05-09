import { useState, useRef, useCallback } from 'react';
import Icon from '../Icon';

export default function FileUpload({
  onUpload,
  accept = 'image/*,application/pdf',
  maxSizeMb = 10,
  label = 'Glissez un fichier ou cliquez pour choisir',
  uploading = false,
  progress = 0,
  preview = false,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const inputRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (file.size > maxSizeMb * 1024 * 1024) {
      alert(`Fichier trop volumineux (max ${maxSizeMb} Mo)`);
      return;
    }
    if (preview && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target.result);
      reader.readAsDataURL(file);
    }
    onUpload?.(file);
  }, [maxSizeMb, onUpload, preview]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  return (
    <div className="w-full">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all ${
          dragOver ? 'border-primary bg-primary/5' : 'border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container'
        } ${uploading ? 'pointer-events-none opacity-70' : ''}`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="preview" className="w-24 h-24 rounded-xl object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Icon name={uploading ? 'progress_activity' : 'cloud_upload'} size={28}
              className={`text-primary ${uploading ? 'animate-spin' : ''}`} />
          </div>
        )}
        <div className="text-center">
          <p className="text-sm font-semibold text-on-surface">{uploading ? `Téléversement... ${progress}%` : label}</p>
          <p className="text-xs text-on-surface-variant mt-1">Max {maxSizeMb} Mo · {accept.replace(/[*,]/g, ' ').trim()}</p>
        </div>
        {uploading && (
          <div className="w-full bg-surface-container-high rounded-full h-1.5">
            <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
    </div>
  );
}
