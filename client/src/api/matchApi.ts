import axiosClient from './axiosClient';
import type { Match, MatchStatus } from '../types';

export const matchApi = {
  listMatches: () => axiosClient.get<Match[]>('/matches').then((res) => res.data),

  updateMatchStatus: (id: string, status: MatchStatus, declineReason?: string) =>
    axiosClient
      .put<Match>(`/matches/${id}/status`, { status, declineReason })
      .then((res) => res.data),

  /** The worker says the work is finished; the client is asked to mark it done and pay. */
  reportWorkDone: (id: string) => axiosClient.post<Match>(`/matches/${id}/work-done`).then((res) => res.data),

  addPhotos: (id: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append('photos', file);
    return axiosClient.post<Match>(`/matches/${id}/photos`, form).then((res) => res.data);
  },

  inviteApprentice: (id: string, apprenticeId: string, sharePercent: number) =>
    axiosClient.post(`/matches/${id}/apprentice`, { apprenticeId, sharePercent }).then((res) => res.data),

};
