import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const usePayments = (params = {}) =>
  useQuery({
    queryKey: ['payments', params],
    queryFn: () => api.get('/payments', { params }).then(r => r.data),
  });

export const useRentPeriods = (params = {}) =>
  useQuery({
    queryKey: ['rent-periods', params],
    queryFn: () => api.get('/rent-periods', { params }).then(r => r.data),
  });

export const useRecordPayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/payments', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['rent-periods'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useMarkPeriodPaid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.patch(`/rent-periods/${id}/pay`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rent-periods'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useSendReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.post(`/rent-periods/${id}/reminder`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rent-periods'] }),
  });
};

export const useBulkReminders = () =>
  useMutation({
    mutationFn: () => api.post('/notifications/bulk-reminder').then(r => r.data),
  });
