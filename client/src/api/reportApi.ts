import axiosClient from './axiosClient';

export type ReportReason = 'payment_outside' | 'fake_profile' | 'no_show' | 'harassment' | 'other';
export const REPORT_REASONS: ReportReason[] = ['payment_outside', 'fake_profile', 'no_show', 'harassment', 'other'];

export interface UserReport {
  id: string;
  reason: ReportReason;
  note: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  timesReported: number;
  reporter?: { id: string; name: string; role: string };
  reportedUser?: { id: string; name: string; role: string; status: string; trustScore: number };
}

export const reportApi = {
  create: (payload: { reportedUserId: string; reason: ReportReason; note?: string }) =>
    axiosClient.post<{ id: string }>('/reports', payload).then((res) => res.data),
  list: () => axiosClient.get<UserReport[]>('/admin/reports').then((res) => res.data),
  resolve: (id: string, status: 'actioned' | 'dismissed', note?: string) =>
    axiosClient.put<UserReport>(`/admin/reports/${id}`, { status, note }).then((res) => res.data),
};
