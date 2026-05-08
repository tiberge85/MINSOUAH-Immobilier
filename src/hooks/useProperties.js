import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const useBuildings = (params = {}) =>
  useQuery({
    queryKey: ['buildings', params],
    queryFn: () => api.get('/buildings', { params }).then(r => r.data),
  });

export const useBuilding = (id) =>
  useQuery({
    queryKey: ['buildings', id],
    queryFn: () => api.get(`/buildings/${id}`).then(r => r.data),
    enabled: !!id,
  });

export const useCreateBuilding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/buildings', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
};

export const useUpdateBuilding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/buildings/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
};

export const useDeleteBuilding = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/buildings/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buildings'] }),
  });
};

export const useUnits = (buildingId) =>
  useQuery({
    queryKey: ['units', buildingId],
    queryFn: () => api.get(`/buildings/${buildingId}/units`).then(r => r.data),
    enabled: !!buildingId,
  });

export const useCreateUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buildingId, ...data }) => api.post(`/buildings/${buildingId}/units`, data).then(r => r.data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['units', vars.buildingId] }),
  });
};

export const useUpdateUnit = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/units/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  });
};
