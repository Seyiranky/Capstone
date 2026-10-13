import axiosClient from './axiosClient';
import type { Dispute, DisputeOutcome, DisputeReason } from '../types';

export const disputeApi = {
  list: () => axiosClient.get<Dispute[]>('/disputes').then((res) => res.data),

  open: (matchId: string, reason: DisputeReason, details: string) =>
    axiosClient.post<Dispute>('/disputes', { matchId, reason, details }).then((res) => res.data),

  respond: (id: string, response: string) =>
    axiosClient.post<Dispute>(`/disputes/${id}/response`, { response }).then((res) => res.data),

  vote: (id: string, outcome: DisputeOutcome, rationale?: string) =>
    axiosClient.post<Dispute>(`/disputes/${id}/votes`, { outcome, rationale }).then((res) => res.data),

  resolve: (id: string, outcome: DisputeOutcome, note: string) =>
    axiosClient.post<Dispute>(`/disputes/${id}/resolve`, { outcome, note }).then((res) => res.data),
};
