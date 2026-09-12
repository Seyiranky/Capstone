import axiosClient from './axiosClient';
import type { Gig, GigStatus } from '../types';

export interface CreateGigPayload {
  title: string;
  description: string;
  budget: number;
  skillId: string;
  locationLat: number;
  locationLng: number;
}

export const gigApi = {
  createGig: (payload: CreateGigPayload, imageFile?: File) => {
    const formData = new FormData();
    formData.append('title', payload.title);
    formData.append('description', payload.description);
    formData.append('budget', String(payload.budget));
    formData.append('skillId', payload.skillId);
    formData.append('locationLat', String(payload.locationLat));
    formData.append('locationLng', String(payload.locationLng));
    if (imageFile) {
      formData.append('image', imageFile);
    }
    return axiosClient.post<Gig>('/gigs', formData).then((res) => res.data);
  },

  listGigs: (filters?: { status?: GigStatus; skillId?: string }) =>
    axiosClient.get<Gig[]>('/gigs', { params: filters }).then((res) => res.data),

  getGig: (id: string) => axiosClient.get<Gig>(`/gigs/${id}`).then((res) => res.data),

  updateGig: (id: string, payload: Partial<CreateGigPayload>) =>
    axiosClient.put<Gig>(`/gigs/${id}`, payload).then((res) => res.data),
};
