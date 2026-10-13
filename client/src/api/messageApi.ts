import axiosClient from './axiosClient';
import type { ChatContact, Message } from '../types';

export const messageApi = {
  /** Text goes as JSON; a photo or voice note switches the request to multipart. */
  sendMessage: ({
    recipientId,
    body,
    image,
    voice,
  }: {
    recipientId: string;
    body: string;
    image?: File | null;
    voice?: { file: File; durationSec: number } | null;
  }) => {
    if (!image && !voice) {
      return axiosClient.post<Message>('/messages', { recipientId, body }).then((res) => res.data);
    }
    const form = new FormData();
    form.append('recipientId', recipientId);
    form.append('body', body);
    if (image) form.append('image', image);
    if (voice) {
      form.append('audio', voice.file);
      form.append('audioDurationSec', String(voice.durationSec));
    }
    return axiosClient.post<Message>('/messages', form).then((res) => res.data);
  },

  listMessages: (recipientId: string) =>
    axiosClient.get<Message[]>('/messages', { params: { recipientId } }).then((res) => res.data),

  listContacts: () => axiosClient.get<ChatContact[]>('/messages/contacts').then((res) => res.data),

  markRead: (contactId: string) =>
    axiosClient.post<{ marked: number }>('/messages/read', { contactId }).then((res) => res.data),
};
