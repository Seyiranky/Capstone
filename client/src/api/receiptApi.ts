import axiosClient from './axiosClient';
import type { Receipt } from '../types';

export const receiptApi = {
  get: (number: string) => axiosClient.get<Receipt>(`/receipts/${number}`).then((res) => res.data),
};
