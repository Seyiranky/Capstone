import axiosClient from './axiosClient';
import type { PublicProfile, User, UserSkill } from '../types';

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  locationLat?: number;
  locationLng?: number;
}

export const userApi = {
  getProfile: () => axiosClient.get<User>('/users/me').then((res) => res.data),

  updateProfile: (payload: UpdateProfilePayload) =>
    axiosClient.put<User>('/users/me', payload).then((res) => res.data),

  getPublicProfile: (id: string) => axiosClient.get<PublicProfile>(`/users/${id}`).then((res) => res.data),

  getUserSkills: (id: string) => axiosClient.get<UserSkill[]>(`/users/${id}/skills`).then((res) => res.data),

  exportMyData: () => axiosClient.get<Record<string, unknown>>('/users/me/export').then((res) => res.data),
};
