import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const useTickets = (params = {}) =>
  useQuery({
    queryKey: ['tickets', params],
    queryFn: () => api.get('/maintenance', { params }).then(r => r.data),
  });

export const useTicketStats = () =>
  useQuery({
    queryKey: ['tickets-stats'],
    queryFn: () => api.get('/maintenance/stats').then(r => r.data),
  });

export const useCreateTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/maintenance', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['tickets-stats'] });
    },
  });
};

export const useUpdateTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/maintenance/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['tickets-stats'] });
    },
  });
};
