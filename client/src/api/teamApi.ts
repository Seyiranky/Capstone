import axiosClient from './axiosClient';
import type { MatchMember } from '../types';

export const teamApi = {
  respond: (memberId: string, accept: boolean) =>
    axiosClient.post<MatchMember>(`/team/${memberId}/respond`, { accept }).then((res) => res.data),

  endorse: (memberId: string, endorse: boolean, note?: string) =>
    axiosClient.post<MatchMember>(`/team/${memberId}/endorse`, { endorse, note }).then((res) => res.data),
};
