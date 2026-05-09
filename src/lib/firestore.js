import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from './firebase';

// Collection references
export const COLLECTIONS = {
  CHATS: 'chats',
  MESSAGES: 'messages',
  NOTIFICATIONS: 'notifications',
  ONLINE_USERS: 'onlineUsers',
  SUPPORT_TICKETS: 'supportTickets',
};

// Generic CRUD helpers
export const fsAdd = (col, data) =>
  addDoc(collection(db, col), { ...data, createdAt: serverTimestamp() });

export const fsUpdate = (col, id, data) =>
  updateDoc(doc(db, col, id), { ...data, updatedAt: serverTimestamp() });

export const fsDelete = (col, id) => deleteDoc(doc(db, col, id));

export const fsGet = async (col, id) => {
  const snap = await getDoc(doc(db, col, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const fsQuery = async (col, ...constraints) => {
  const snap = await getDocs(query(collection(db, col), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Chat helpers
export const getChatId = (uid1, uid2) =>
  [uid1, uid2].sort().join('_');

export const sendMessage = (chatId, message) =>
  addDoc(collection(db, COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES), {
    ...message,
    createdAt: serverTimestamp(),
    read: false,
  });

export const markRead = (chatId, messageId) =>
  updateDoc(doc(db, COLLECTIONS.CHATS, chatId, COLLECTIONS.MESSAGES, messageId), { read: true });

// Notification helpers
export const createNotification = (userId, data) =>
  addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
    userId,
    ...data,
    read: false,
    createdAt: serverTimestamp(),
  });

export const markNotificationRead = (notifId) =>
  fsUpdate(COLLECTIONS.NOTIFICATIONS, notifId, { read: true });

// Re-export commonly used Firestore utilities
export { where, orderBy, limit, onSnapshot, serverTimestamp, increment };
