import axiosClient from './axiosClient';
import type { CrewMember, GigApplication, Match, RejectionReason } from '../types';

export type IneligibleReason =
  | 'account_suspended'
  | 'contact_unconfirmed'
  | 'open_report'
  | 'sensitive_skill'
  | 'sensitive_phone'
  | 'sensitive_record';

export interface ApplyEligibility {
  eligible: boolean;
  sensitive: boolean;
  missing: IneligibleReason[];
}

export const gigApplicationApi = {
  applyToGig: (
    gigId: string,
    quote: { quoteAmount?: number | null; quoteNote?: string; crew?: CrewMember[] } = {},
  ) =>
    axiosClient
      .post<GigApplication>('/gig-applications', { gigId, ...quote })
      .then((res) => res.data),

  /** Whether the signed-in worker may apply, and every requirement not yet met. */
  eligibility: (gigId: string) =>
    axiosClient.get<ApplyEligibility>('/gig-applications/eligibility', { params: { gigId } }).then((res) => res.data),

  listApplications: (params?: { gigId?: string }) =>
    axiosClient.get<GigApplication[]>('/gig-applications', { params }).then((res) => res.data),

  reviewApplication: (
    id: string,
    decision: 'approved' | 'rejected',
    rejection?: { reason: RejectionReason; note?: string },
  ) =>
    axiosClient
      .put<{ application: GigApplication; match?: Match }>(`/gig-applications/${id}/review`, {
        decision,
        ...rejection,
      })
      .then((res) => res.data),
};
