import {
  ref, uploadBytesResumable, getDownloadURL,
  deleteObject, listAll,
} from 'firebase/storage';
import { storage } from './firebase';

// Folder structure
export const STORAGE_PATHS = {
  properties: (orgId) => `orgs/${orgId}/properties`,
  profiles: (orgId) => `orgs/${orgId}/profiles`,
  contracts: (orgId) => `orgs/${orgId}/contracts`,
  receipts: (orgId) => `orgs/${orgId}/receipts`,
  maintenance: (orgId) => `orgs/${orgId}/maintenance`,
  documents: (orgId) => `orgs/${orgId}/documents`,
};

/**
 * Upload a file with progress callback
 * @param {string} path - Storage path
 * @param {File} file - File to upload
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<string>} Download URL
 */
export const uploadFile = (path, file, onProgress) => {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(pct);
      },
      reject,
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(url);
      }
    );
  });
};

export const deleteFile = (path) => deleteObject(ref(storage, path));

export const getFileUrl = (path) => getDownloadURL(ref(storage, path));

export const listFiles = async (path) => {
  const result = await listAll(ref(storage, path));
  const urls = await Promise.all(result.items.map(item => getDownloadURL(item)));
  return result.items.map((item, i) => ({ name: item.name, fullPath: item.fullPath, url: urls[i] }));
};

// Compress image before upload (client-side)
export const compressImage = (file, maxWidthPx = 1200, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidthPx) { height = (height * maxWidthPx) / width; width = maxWidthPx; }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};
