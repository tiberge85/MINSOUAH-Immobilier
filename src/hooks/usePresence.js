import { useEffect, useState } from 'react';
import { ref, onValue, set, onDisconnect, serverTimestamp } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export function usePresence(userId) {
  useEffect(() => {
    if (!userId) return;

    const userStatusRef = ref(rtdb, `status/${userId}`);
    const connectedRef = ref(rtdb, '.info/connected');

    const unsub = onValue(connectedRef, (snap) => {
      if (!snap.val()) return;
      // Mark offline on disconnect
      onDisconnect(userStatusRef).set({ state: 'offline', lastSeen: serverTimestamp() });
      // Mark online now
      set(userStatusRef, { state: 'online', lastSeen: serverTimestamp() });
    });

    return () => {
      unsub();
      set(userStatusRef, { state: 'offline', lastSeen: serverTimestamp() }).catch(() => {});
    };
  }, [userId]);
}

export function useUserStatus(userId) {
  const [status, setStatus] = useState({ state: 'offline', lastSeen: null });

  useEffect(() => {
    if (!userId) return;
    const statusRef = ref(rtdb, `status/${userId}`);
    const unsub = onValue(statusRef, (snap) => {
      if (snap.val()) setStatus(snap.val());
    });
    return unsub;
  }, [userId]);

  return status;
}

export function useOnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    const statusRef = ref(rtdb, 'status');
    const unsub = onValue(statusRef, (snap) => {
      const data = snap.val() || {};
      const online = Object.entries(data)
        .filter(([, v]) => v.state === 'online')
        .map(([uid, v]) => ({ uid, ...v }));
      setOnlineUsers(online);
    });
    return unsub;
  }, []);

  return onlineUsers;
}
