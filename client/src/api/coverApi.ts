import axiosClient from './axiosClient';

export interface CoverClaim {
  id: string;
  matchId: string;
  description: string;
  amountRequested: number;
  amountApproved: number | null;
  status: 'submitted' | 'approved' | 'declined';
  decisionNote: string | null;
  createdAt: string;
  user?: { id: string; name: string };
  transaction?: { coverPolicyNumber: string; amount: number };
  match?: { gig?: { id: string; title: string } };
}

export interface CoverStatus {
  eligible: boolean;
  covered: boolean;
  canBuy: boolean;
  policyNumber: string | null;
  premium: number;
  limit: number;
  claimWindowDays: number;
  canClaim: boolean;
  claims: CoverClaim[];
}

export const coverApi = {
  /** The client adds cover while the job is in progress; billed with the MoMo payment. */
  buy: (matchId: string) => axiosClient.post<CoverStatus>(`/matches/${matchId}/cover`).then((res) => res.data),
  status: (matchId: string) => axiosClient.get<CoverStatus>(`/matches/${matchId}/cover`).then((res) => res.data),
  claim: (matchId: string, payload: { description: string; amount: number }) =>
    axiosClient.post<CoverClaim>(`/matches/${matchId}/cover-claims`, payload).then((res) => res.data),
  list: () => axiosClient.get<CoverClaim[]>('/admin/cover-claims').then((res) => res.data),
  decide: (id: string, payload: { status: 'approved' | 'declined'; note?: string }) =>
    axiosClient.put<CoverClaim>(`/admin/cover-claims/${id}`, payload).then((res) => res.data),
};
