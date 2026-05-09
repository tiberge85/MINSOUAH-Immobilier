import axios from 'axios';
import { auth } from './firebase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Firebase ID token before each request
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    try {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch { /* no token — continue as unauthenticated */ }
  }
  return config;
});

// Handle 401 by refreshing token once
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const user = auth.currentUser;
        if (user) {
          const token = await user.getIdToken(true); // force refresh
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
      } catch { /* force logout */ }
    }
    return Promise.reject(err);
  }
);

export default api;
