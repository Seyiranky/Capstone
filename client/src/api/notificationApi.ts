import axiosClient from './axiosClient';
import type { AppNotification } from '../types';

export const notificationApi = {
  listNotifications: () =>
    axiosClient.get<AppNotification[]>('/notifications').then((res) => res.data),

  markRead: (id: string) =>
    axiosClient.put<AppNotification>(`/notifications/${id}/read`).then((res) => res.data),
};
