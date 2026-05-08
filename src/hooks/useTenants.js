import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const useTenants = (params = {}) =>
  useQuery({
    queryKey: ['tenants', params],
    queryFn: () => api.get('/tenants', { params }).then(r => r.data),
  });

export const useTenant = (id) =>
  useQuery({
    queryKey: ['tenants', id],
    queryFn: () => api.get(`/tenants/${id}`).then(r => r.data),
    enabled: !!id,
  });

export const useCreateTenant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/tenants', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
  });
};

export const useUpdateTenant = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/tenants/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['tenants', vars.id] }),
  });
};
