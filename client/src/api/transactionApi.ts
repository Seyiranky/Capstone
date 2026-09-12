import axiosClient from './axiosClient';
import type { Transaction } from '../types';

export const transactionApi = {
  initiateTransaction: (matchId: string) =>
    axiosClient.post<Transaction>('/transactions/initiate', { matchId }).then((res) => res.data),

  confirmTransaction: (id: string) =>
    axiosClient.post<Transaction>(`/transactions/${id}/confirm`).then((res) => res.data),

  listTransactions: () => axiosClient.get<Transaction[]>('/transactions').then((res) => res.data),
};
