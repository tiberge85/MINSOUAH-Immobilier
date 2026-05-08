import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../lib/api';

export const useAuth = () => {
  const qc = useQueryClient();
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('minsouah_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const loginMutation = useMutation({
    mutationFn: (credentials) => api.post('/auth/login', credentials).then(r => r.data),
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.accessToken);
      localStorage.setItem('refresh_token', data.refreshToken);
      localStorage.setItem('minsouah_user', JSON.stringify(data.user));
      setUser(data.user);
    },
  });

  const logout = () => {
    api.post('/auth/logout').catch(() => {});
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('minsouah_user');
    setUser(null);
    qc.clear();
    window.location.hash = '#/login';
  };

  return {
    user,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    logout,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
  };
};
