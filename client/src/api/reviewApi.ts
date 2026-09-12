import axiosClient from './axiosClient';
import type { Review } from '../types';

export const reviewApi = {
  createReview: (payload: { matchId: string; rating: number; comment?: string }) =>
    axiosClient.post<Review>('/reviews', payload).then((res) => res.data),

  listReviews: (recipientId?: string) =>
    axiosClient.get<Review[]>('/reviews', { params: recipientId ? { recipientId } : undefined }).then((res) => res.data),
};
