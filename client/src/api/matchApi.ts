import axiosClient from './axiosClient';
import type { Match, MatchStatus } from '../types';

export const matchApi = {
  listMatches: () => axiosClient.get<Match[]>('/matches').then((res) => res.data),

  updateMatchStatus: (id: string, status: MatchStatus, declineReason?: string) =>
    axiosClient
      .put<Match>(`/matches/${id}/status`, { status, declineReason })
      .then((res) => res.data),

  completeWithCode: (id: string, code: string) =>
    axiosClient.post<Match>(`/matches/${id}/complete`, { code }).then((res) => res.data),

  markWorkDone: (id: string) =>
    axiosClient.post<Match>(`/matches/${id}/work-done`).then((res) => res.data),
};
