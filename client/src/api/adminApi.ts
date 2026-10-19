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

  /** Mark a gig sensitive (children, inside a home), or clear it. */
  setGigSensitive: (id: string, sensitive: boolean) =>
    axiosClient.put<Gig>(`/admin/gigs/${id}/sensitive`, { sensitive }).then((res) => res.data),

  /** Pending applications that need a look; with all, every pending one. */
  applications: (all = false) =>
    axiosClient
      .get<ApplicationsOverview>('/admin/applications', { params: all ? { all: '1' } : {} })
      .then((res) => res.data),
  applicationsFlaggedCount: () =>
    axiosClient.get<{ count: number }>('/admin/applications/flagged-count').then((res) => res.data.count),
  withdrawApplication: (id: string, reason: string) =>
    axiosClient.put(`/admin/applications/${id}/withdraw`, { reason }).then((res) => res.data),

  moderateUser: (id: string, action: 'suspend' | 'activate') =>
    axiosClient.put<User>(`/admin/users/${id}/moderate`, { action }).then((res) => res.data),

  deleteUser: (id: string) => axiosClient.delete<{ message: string }>(`/admin/users/${id}`).then((res) => res.data),
};

export type ApplicationFlag = 'overdue' | 'sensitive' | 'report_worker' | 'report_client' | 'burst' | 'low_price';

export interface OverseenApplication {
  id: string;
  createdAt: string;
  waitedHours: number;
  remindedAt: string | null;
  quoteAmount: number | string | null;
  price: number;
  usualLow: number | null;
  flags: ApplicationFlag[];
  gig: { id: string; title: string; budget: number | string; sensitive: boolean };
  client: { id: string; name: string; avatarUrl?: string | null } | null;
  worker: { id: string; name: string; avatarUrl?: string | null; trustScore: number; reviewCount: number; completedJobCount: number } | null;
}

export interface ApplicationsOverview {
  applications: OverseenApplication[];
  counts: Record<ApplicationFlag, number>;
  pendingTotal: number;
}
