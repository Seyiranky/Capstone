import axiosClient from './axiosClient';
import type { IncomeStatement, PassportRead, PassportVerification } from '../types';

export const passportApi = {
  issue: () =>
    axiosClient
      .post<{ token: string; tokenId: string }>('/passports')
      .then((res) => res.data),

  revoke: () => axiosClient.delete<{ message: string }>('/passports').then((res) => res.data),

  /** Public: no auth, since the point is that a client can check it. */
  read: (token: string) =>
    axiosClient.get<PassportRead>(`/passports/${token}`).then((res) => res.data),

  verify: (token: string) =>
    axiosClient.get<PassportVerification>(`/passports/${token}/verify`).then((res) => res.data),

  incomeStatement: (params?: { from?: string; to?: string }) =>
    axiosClient
      .get<IncomeStatement>('/users/me/income-statement', { params })
      .then((res) => res.data),

  incomeStatementCsv: () =>
    axiosClient
      .get('/users/me/income-statement', {
        params: { format: 'csv' },
        responseType: 'blob',
      })
      .then((res) => res.data as Blob),
};
