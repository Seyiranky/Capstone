import axiosClient from './axiosClient';
import type { SafetyNet } from '../types';

export const safetyNetApi = {
  mine: () => axiosClient.get<SafetyNet>('/safety-net/me').then((res) => res.data),
  setSavings: (percent: number) =>
    axiosClient.put<SafetyNet>('/safety-net/me/savings', { percent }).then((res) => res.data),
  withdraw: (amount: number, note?: string) =>
    axiosClient.post<SafetyNet>('/safety-net/me/withdraw', { amount, note }).then((res) => res.data),
};
