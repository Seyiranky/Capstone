import axiosClient from './axiosClient';
import type { Dispute, DisputeOutcome, DisputeReason, DisputeStage } from '../types';

/** Whether a job can be disputed by the viewer, at which stage and for which reasons. */
export interface DisputeEligibility {
  matchId: string;
  gigTitle: string;
  otherParty: string;
  asWorker: boolean;
  price: number;
  canOpen: boolean;
  stage: DisputeStage | null;
  reasons: DisputeReason[];
  blocked?: 'not_party' | 'not_started' | 'cancelled' | 'already_disputed' | 'window_passed';
}

export const disputeApi = {
  list: () => axiosClient.get<Dispute[]>('/disputes').then((res) => res.data),

  eligible: () => axiosClient.get<DisputeEligibility[]>('/disputes/eligible').then((res) => res.data),

  open: (matchId: string, reason: DisputeReason, details: string) =>
    axiosClient.post<Dispute>('/disputes', { matchId, reason, details }).then((res) => res.data),

  respond: (id: string, response: string) =>
    axiosClient.post<Dispute>(`/disputes/${id}/response`, { response }).then((res) => res.data),

  vote: (id: string, outcome: DisputeOutcome, rationale?: string) =>
    axiosClient.post<Dispute>(`/disputes/${id}/votes`, { outcome, rationale }).then((res) => res.data),

  resolve: (id: string, outcome: DisputeOutcome, note: string) =>
    axiosClient.post<Dispute>(`/disputes/${id}/resolve`, { outcome, note }).then((res) => res.data),
};
