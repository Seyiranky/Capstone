import axiosClient from './axiosClient';
import type { AdminPayments, CollusionReport, Gig, PilotMetrics, RejectionBreakdown, SmsHealth, TradeRate, User } from '../types';

export const adminApi = {
  listUsers: () => axiosClient.get<User[]>('/admin/users').then((res) => res.data),

  collusionReport: () =>
    axiosClient.get<CollusionReport>('/admin/flagged').then((res) => res.data),

  smsHealth: () => axiosClient.get<SmsHealth>('/admin/sms-health').then((res) => res.data),

  listReviewers: () => axiosClient.get<User[]>('/admin/reviewers').then((res) => res.data),

  setReviewerTier: (id: string, reviewerTier: 'admin' | 'peer' | null) =>
    axiosClient
      .put<User>(`/admin/users/${id}/reviewer-tier`, { reviewerTier })
      .then((res) => res.data),

  rejectionReasons: () =>
    axiosClient.get<RejectionBreakdown[]>('/admin/rejection-reasons').then((res) => res.data),

  payments: () => axiosClient.get<AdminPayments>('/admin/payments').then((res) => res.data),

  rates: () => axiosClient.get<TradeRate[]>('/admin/rates').then((res) => res.data),

  metrics: () => axiosClient.get<PilotMetrics>('/admin/metrics').then((res) => res.data),

  listGigs: () => axiosClient.get<Gig[]>('/admin/gigs').then((res) => res.data),

  reviewGig: (id: string, decision: 'approved' | 'rejected', note?: string) =>
    axiosClient.put<Gig>(`/admin/gigs/${id}/review`, { decision, note }).then((res) => res.data),

  moderateUser: (id: string, action: 'suspend' | 'activate') =>
    axiosClient.put<User>(`/admin/users/${id}/moderate`, { action }).then((res) => res.data),

  deleteUser: (id: string) => axiosClient.delete<{ message: string }>(`/admin/users/${id}`).then((res) => res.data),
};
