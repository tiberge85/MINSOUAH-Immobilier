import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export const useDashboard = () =>
  useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then(r => r.data),
    staleTime: 30_000,
  });

export const useRevenue = (year) =>
  useQuery({
    queryKey: ['revenue', year],
    queryFn: () => api.get('/analytics/revenue', { params: { year } }).then(r => r.data),
    enabled: !!year,
  });

export const useOccupancy = () =>
  useQuery({
    queryKey: ['occupancy'],
    queryFn: () => api.get('/analytics/occupancy').then(r => r.data),
  });

export const useOverdueSummary = () =>
  useQuery({
    queryKey: ['overdue-summary'],
    queryFn: () => api.get('/analytics/overdue').then(r => r.data),
  });

export const useFinancialReport = (month, year) =>
  useQuery({
    queryKey: ['financial-report', month, year],
    queryFn: () => api.get('/analytics/financial-report', { params: { month, year } }).then(r => r.data),
    enabled: !!month && !!year,
  });
