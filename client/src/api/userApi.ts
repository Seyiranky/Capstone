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

export const userApi = {
  getProfile: () => axiosClient.get<User>('/users/me').then((res) => res.data),

  updateProfile: (payload: UpdateProfilePayload) =>
    axiosClient.put<User>('/users/me', payload).then((res) => res.data),

  getPublicProfile: (id: string) => axiosClient.get<PublicProfile>(`/users/${id}`).then((res) => res.data),

  getUserSkills: (id: string) => axiosClient.get<UserSkill[]>(`/users/${id}/skills`).then((res) => res.data),

  getWorkHistory: (id: string) =>
    axiosClient.get<WorkHistoryEntry[]>(`/users/${id}/work-history`).then((res) => res.data),

  searchWorkers: (q: string) =>
    axiosClient.get<WorkerHit[]>('/users/search', { params: { q } }).then((res) => res.data),


  exportMyData: () => axiosClient.get<Record<string, unknown>>('/users/me/export').then((res) => res.data),
};
