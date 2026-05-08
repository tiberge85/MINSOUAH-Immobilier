import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const useContracts = (params = {}) =>
  useQuery({
    queryKey: ['contracts', params],
    queryFn: () => api.get('/contracts', { params }).then(r => r.data),
  });

export const useContract = (id) =>
  useQuery({
    queryKey: ['contracts', id],
    queryFn: () => api.get(`/contracts/${id}`).then(r => r.data),
    enabled: !!id,
  });

export const useExpiringContracts = (days = 30) =>
  useQuery({
    queryKey: ['contracts-expiring', days],
    queryFn: () => api.get('/contracts/expiring', { params: { days } }).then(r => r.data),
  });

export const useCreateContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/contracts', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['buildings'] });
    },
  });
};

export const useUpdateContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/contracts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts'] }),
  });
};

export const useTerminateContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/contracts/${id}/terminate`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts'] });
      qc.invalidateQueries({ queryKey: ['buildings'] });
    },
  });
};
