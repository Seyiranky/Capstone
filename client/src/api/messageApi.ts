import axiosClient from './axiosClient';
import type { Message, User } from '../types';

export const messageApi = {
  sendMessage: (payload: { recipientId: string; body: string }) =>
    axiosClient.post<Message>('/messages', payload).then((res) => res.data),

  listMessages: (recipientId: string) =>
    axiosClient.get<Message[]>('/messages', { params: { recipientId } }).then((res) => res.data),

  listContacts: () => axiosClient.get<User[]>('/messages/contacts').then((res) => res.data),
};
