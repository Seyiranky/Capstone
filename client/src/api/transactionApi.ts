import axiosClient from './axiosClient';
import type { Transaction } from '../types';

export const transactionApi = {
  initiateTransaction: (matchId: string) =>
    axiosClient.post<Transaction>('/transactions/initiate', { matchId }).then((res) => res.data),

  /** `safetyNet`: the client's optional addition to the worker's safety net, in RWF. */
  confirmTransaction: (id: string, safetyNet = 0, cover = false) =>
    axiosClient.post<Transaction>(`/transactions/${id}/confirm`, { safetyNet, cover }).then((res) => res.data),

  listTransactions: () => axiosClient.get<Transaction[]>('/transactions').then((res) => res.data),
};
