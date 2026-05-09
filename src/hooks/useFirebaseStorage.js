import { useState, useCallback } from 'react';
import { uploadFile, deleteFile, compressImage, STORAGE_PATHS } from '../lib/storage';

export function useFileUpload(orgId) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const upload = useCallback(async (file, type = 'documents', compress = false) => {
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const processedFile = compress ? await compressImage(file) : file;
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const basePath = STORAGE_PATHS[type]?.(orgId) || `orgs/${orgId}/${type}`;
      const path = `${basePath}/${fileName}`;
      const url = await uploadFile(path, processedFile, setProgress);
      return { url, path, name: file.name };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [orgId]);

  const remove = useCallback(async (path) => {
    await deleteFile(path);
  }, []);

  return { upload, remove, uploading, progress, error };
}
