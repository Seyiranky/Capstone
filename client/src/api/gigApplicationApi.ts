import axiosClient from './axiosClient';
import type { GigApplication, Match } from '../types';

export const gigApplicationApi = {
  applyToGig: (gigId: string, quote: { quoteAmount?: number | null; quoteNote?: string } = {}) =>
    axiosClient
      .post<GigApplication>('/gig-applications', { gigId, ...quote })
      .then((res) => res.data),

  listApplications: (params?: { gigId?: string }) =>
    axiosClient.get<GigApplication[]>('/gig-applications', { params }).then((res) => res.data),

  reviewApplication: (id: string, decision: 'approved' | 'rejected') =>
    axiosClient
      .put<{ application: GigApplication; match?: Match }>(`/gig-applications/${id}/review`, { decision })
      .then((res) => res.data),
};
