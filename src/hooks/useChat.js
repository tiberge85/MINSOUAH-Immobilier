import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getChatId } from '../lib/firestore';

export function useChat(currentUserId, otherUserId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const chatId = currentUserId && otherUserId
    ? getChatId(currentUserId, otherUserId)
    : null;

  useEffect(() => {
    if (!chatId) { setLoading(false); return; }

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );

    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return unsub;
  }, [chatId]);

  const sendMessage = useCallback(async (text, attachmentUrl = null) => {
    if (!chatId || !text.trim()) return;

    const msg = {
      text: text.trim(),
      senderId: currentUserId,
      receiverId: otherUserId,
      createdAt: serverTimestamp(),
      read: false,
      attachmentUrl,
    };

    // Add message to subcollection
    await addDoc(collection(db, 'chats', chatId, 'messages'), msg);

    // Update chat metadata
    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: text.trim(),
      lastMessageAt: serverTimestamp(),
      [`unreadCount.${otherUserId}`]: (messages.filter(m => !m.read && m.senderId === currentUserId).length + 1),
    }).catch(() =>
      // Chat doc may not exist yet — create it
      addDoc(collection(db, 'chats'), {
        id: chatId,
        participants: [currentUserId, otherUserId],
        lastMessage: text.trim(),
        lastMessageAt: serverTimestamp(),
        unreadCount: { [otherUserId]: 1 },
      })
    );
  }, [chatId, currentUserId, otherUserId, messages]);

  const markAllRead = useCallback(async () => {
    if (!chatId) return;
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      where('receiverId', '==', currentUserId),
      where('read', '==', false)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { read: true })));
  }, [chatId, currentUserId]);

  return { messages, loading, sendMessage, markAllRead };
}

export function useConversations(userId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
      limit(50)
    );

    const unsub = onSnapshot(q, (snap) => {
      setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { conversations, loading };
}
