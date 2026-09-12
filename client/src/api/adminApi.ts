import axiosClient from './axiosClient';
import type { Gig, User } from '../types';

export const adminApi = {
  listUsers: () => axiosClient.get<User[]>('/admin/users').then((res) => res.data),

  listGigs: () => axiosClient.get<Gig[]>('/admin/gigs').then((res) => res.data),

  reviewGig: (id: string, decision: 'approved' | 'rejected') =>
    axiosClient.put<Gig>(`/admin/gigs/${id}/review`, { decision }).then((res) => res.data),

  moderateUser: (id: string, action: 'suspend' | 'activate') =>
    axiosClient.put<User>(`/admin/users/${id}/moderate`, { action }).then((res) => res.data),

  deleteUser: (id: string) => axiosClient.delete<{ message: string }>(`/admin/users/${id}`).then((res) => res.data),
};
