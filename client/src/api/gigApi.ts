import axiosClient from './axiosClient';
import type { Gig, GigStatus, RateGuide } from '../types';

export interface CreateGigPayload {
  title: string;
  description: string;
  budget: number;
  skillId: string;
  /** Optional bar. Workers below it rank lower but are never hidden. */
  requiredLevel?: number | null;
  locationLat: number;
  locationLng: number;
}

export const gigApi = {
  rates: (skillId: string) =>
    axiosClient.get<RateGuide>('/gigs/rates', { params: { skillId } }).then((res) => res.data),

  createGig: (payload: CreateGigPayload, imageFile?: File, voice?: { file: File; durationSec: number }) => {
    const formData = new FormData();
    formData.append('title', payload.title);
    formData.append('description', payload.description);
    formData.append('budget', String(payload.budget));
    formData.append('skillId', payload.skillId);
    if (payload.requiredLevel != null) {
      formData.append('requiredLevel', String(payload.requiredLevel));
    }
    formData.append('locationLat', String(payload.locationLat));
    formData.append('locationLng', String(payload.locationLng));
    if (imageFile) {
      formData.append('image', imageFile);
    }
    if (voice) {
      formData.append('voice', voice.file);
      formData.append('voiceDurationSec', String(voice.durationSec));
    }
    return axiosClient.post<Gig>('/gigs', formData).then((res) => res.data);
  },

  listGigs: (filters?: { status?: GigStatus; skillId?: string }) =>
    axiosClient.get<Gig[]>('/gigs', { params: filters }).then((res) => res.data),

  getGig: (id: string) => axiosClient.get<Gig>(`/gigs/${id}`).then((res) => res.data),

  updateGig: (id: string, payload: Partial<CreateGigPayload>) =>
    axiosClient.put<Gig>(`/gigs/${id}`, payload).then((res) => res.data),
};
