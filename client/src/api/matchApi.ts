import axiosClient from './axiosClient';
import type { Match, MatchStatus } from '../types';

export const matchApi = {
  listMatches: () => axiosClient.get<Match[]>('/matches').then((res) => res.data),

  updateMatchStatus: (id: string, status: MatchStatus) =>
    axiosClient.put<Match>(`/matches/${id}/status`, { status }).then((res) => res.data),
};
