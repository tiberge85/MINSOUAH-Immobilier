/**
 * Backup & Restore — Firestore sub-collection strategy.
 *
 * Layout:
 *   workspaces/{ws}/backups/{backupId}          ← metadata doc
 *   workspaces/{ws}/backups/{backupId}/{col}/0  ← chunk 0 (up to CHUNK_SIZE docs)
 *   workspaces/{ws}/backups/{backupId}/{col}/1  ← chunk 1, etc.
 *
 * Firestore 1 MB doc limit: we store at most CHUNK_SIZE documents per chunk
 * as a JSON array. This keeps individual chunks well under the limit for
 * typical property/payment record sizes.
 *
 * Note: deleteBackupMeta() only removes the metadata doc.
 * Sub-collection cleanup requires Cloud Functions in production.
 */
import {
  collection, doc, getDocs, setDoc, getDoc, writeBatch, deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';

const WS = import.meta.env.VITE_FIREBASE_WORKSPACE || 'minsouah';
const wsCol  = (name)    => collection(db, 'workspaces', WS, name);
const wsDoc  = (col, id) => doc(db, 'workspaces', WS, col, String(id));
const bkuCol = (bkId, colName) => collection(db, 'workspaces', WS, 'backups', bkId, colName);
const bkuDoc = (bkId, colName, idx) => doc(db, 'workspaces', WS, 'backups', bkId, colName, String(idx));

const CHUNK_SIZE = 25; // docs per Firestore chunk document

const BACKUP_COLS = [
  'organizations', 'users', 'licenses',
  'properties', 'contracts', 'tenants', 'owners',
  'payments', 'transactions', 'tickets', 'inspections',
  'conversations', 'activityLog',
];

/**
 * Create a full backup of all collections.
 * @param {{ currentUser: object }} opts
 * @returns {Promise<{ id, createdAt, totalDocs, stats }>}
 */
export async function createBackup({ currentUser } = {}) {
  const backupId  = `backup_${Date.now()}`;
  const timestamp = new Date().toISOString();
  const stats     = {};

  for (const colName of BACKUP_COLS) {
    try {
      const snap = await getDocs(wsCol(colName));
      const docs = snap.docs.map(d => d.data());
      stats[colName] = docs.length;

      // Store in CHUNK_SIZE-sized chunks in a sub-collection
      if (docs.length === 0) {
        await setDoc(bkuDoc(backupId, colName, 0), { items: [] });
      } else {
        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
          await setDoc(
            bkuDoc(backupId, colName, Math.floor(i / CHUNK_SIZE)),
            { items: docs.slice(i, i + CHUNK_SIZE) }
          );
        }
      }
    } catch (err) {
      console.warn(`[backup] ${colName}:`, err?.message);
      stats[colName] = 0;
    }
  }

  const totalDocs = Object.values(stats).reduce((a, b) => a + b, 0);
  const meta = {
    id:             backupId,
    createdAt:      timestamp,
    createdBy:      currentUser?.name  || 'Super Admin',
    createdByEmail: currentUser?.email || '',
    stats,
    totalDocs,
  };
  await setDoc(wsDoc('backups', backupId), meta);
  return meta;
}

/**
 * List the last 10 backup metadata docs (newest first).
 * @returns {Promise<Array>}
 */
export async function listBackups() {
  try {
    const snap = await getDocs(wsCol('backups'));
    return snap.docs
      .map(d => d.data())
      .filter(d => d.id && d.createdAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);
  } catch {
    return [];
  }
}

/**
 * Restore all collections from a backup (overwrites current data).
 * @param {{ backupId: string }} opts
 */
export async function restoreBackup({ backupId }) {
  const metaDoc = await getDoc(wsDoc('backups', backupId));
  if (!metaDoc.exists()) throw new Error('Backup introuvable');

  for (const colName of BACKUP_COLS) {
    try {
      // Read all chunks
      const chunkSnap = await getDocs(bkuCol(backupId, colName));
      const allDocs   = chunkSnap.docs.flatMap(d => d.data().items || []);

      // Clear current collection
      const existing = await getDocs(wsCol(colName));
      for (let i = 0; i < existing.docs.length; i += 400) {
        const batch = writeBatch(db);
        existing.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // Restore docs
      for (let i = 0; i < allDocs.length; i += 400) {
        const batch = writeBatch(db);
        allDocs.slice(i, i + 400).forEach(item => {
          if (item?.id != null) batch.set(wsDoc(colName, item.id), item);
        });
        await batch.commit();
      }
    } catch (err) {
      console.warn(`[restore] ${colName}:`, err?.message);
    }
  }
}

/**
 * Delete the backup metadata doc.
 * Sub-collection data is orphaned (Cloud Functions needed for full cleanup).
 */
export async function deleteBackupMeta({ backupId }) {
  try {
    await deleteDoc(wsDoc('backups', backupId));
  } catch (err) {
    console.warn('[deleteBackup]', err?.message);
  }
}
