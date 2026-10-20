import axiosClient from './axiosClient';
import type { PreferredChannel, PublicProfile, User, UserSkill, WorkerHit, WorkHistoryEntry } from '../types';

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  locationLat?: number;
  locationLng?: number;
  /** Null clears a previously set value; undefined leaves it untouched. */
  yearsExperience?: number | null;
  experienceSummary?: string | null;
  preferredLanguage?: 'en' | 'rw';
  /** Choosing 'sms' needs a confirmed number; the number itself is set by authApi.sendPhoneCode. */
  preferredChannel?: PreferredChannel;
  availability?: 'available' | 'busy' | 'away';
  availableFrom?: string | null;
  monthlyGoal?: number | null;
  trustedContactName?: string;
  trustedContactPhone?: string;
}

export type DeletionBlocker =
  | { code: 'admin' }
  | { code: 'job_in_progress' | 'payment_owed' | 'payment_due' | 'dispute_open'; gigId: string; title: string };

export const userApi = {
  getProfile: () => axiosClient.get<User>('/users/me').then((res) => res.data),

  updateProfile: (payload: UpdateProfilePayload) =>
    axiosClient.put<User>('/users/me', payload).then((res) => res.data),

  /** Sets the profile picture: a square image already cropped in the browser. */
  uploadAvatar: (image: Blob) => {
    const form = new FormData();
    form.append('avatar', image, 'avatar.jpg');
    return axiosClient.post<User>('/users/me/avatar', form).then((res) => res.data);
  },

  removeAvatar: () => axiosClient.delete<User>('/users/me/avatar').then((res) => res.data),

  getPublicProfile: (id: string) => axiosClient.get<PublicProfile>(`/users/${id}`).then((res) => res.data),

  getUserSkills: (id: string) => axiosClient.get<UserSkill[]>(`/users/${id}/skills`).then((res) => res.data),

  getWorkHistory: (id: string) =>
    axiosClient.get<WorkHistoryEntry[]>(`/users/${id}/work-history`).then((res) => res.data),

  searchWorkers: (q: string) =>
    axiosClient.get<WorkerHit[]>('/users/search', { params: { q } }).then((res) => res.data),


  /** What stands in the way of deleting the account, so the screen can say so first. */
  deletionCheck: () =>
    axiosClient.get<{ canDelete: boolean; blockers: DeletionBlocker[] }>('/users/me/deletion-check').then((res) => res.data),

  /** Deletes the caller's account; needs their password. */
  deleteMe: (password: string) => axiosClient.delete('/users/me', { data: { password } }).then(() => undefined),

  exportMyData: () => axiosClient.get<Record<string, unknown>>('/users/me/export').then((res) => res.data),

  /** The same data as a readable PDF report. */
  exportMyDataPdf: () =>
    axiosClient.get<Blob>('/users/me/export.pdf', { responseType: 'blob' }).then((res) => res.data),
};
