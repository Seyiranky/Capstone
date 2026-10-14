import axiosClient from './axiosClient';
import type { Transaction } from '../types';

export const transactionApi = {
  /** Asks the client's MoMo number to approve paying for a finished job. */
  pay: (payload: { matchId: string; phone: string; safetyNet?: number }) =>
    axiosClient.post<Transaction>('/transactions/pay', payload).then((res) => res.data),

  /** Where a payment stands; the server asks the provider while it is pending. */
  get: (id: string) => axiosClient.get<Transaction>(`/transactions/${id}`).then((res) => res.data),

  /** Simulated provider only: approves at once, standing in for the payer's PIN. */
  approveSimulated: (id: string) => axiosClient.post<Transaction>(`/transactions/${id}/confirm`).then((res) => res.data),

  listTransactions: () => axiosClient.get<Transaction[]>('/transactions').then((res) => res.data),
};
