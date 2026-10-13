import axiosClient from './axiosClient';

export interface VoicePoll {
  id: string;
  question: string;
  details: string | null;
  options: string[];
  counts: number[];
  total: number;
  phase: 'voting' | 'awaiting_response' | 'closed';
  closesAt: string;
  closedAt: string | null;
  outcome: string | null;
  createdAt: string;
  myVote: number | null;
  canVote: boolean;
}

export const workerVoiceApi = {
  list: () => axiosClient.get<VoicePoll[]>('/voice').then((res) => res.data),
  vote: (id: string, optionIndex: number) => axiosClient.post(`/voice/${id}/vote`, { optionIndex }),
  create: (payload: { question: string; details?: string; options: string[]; closesInDays: number }) =>
    axiosClient.post<VoicePoll>('/voice', payload).then((res) => res.data),
  close: (id: string, outcome: string) => axiosClient.put(`/voice/${id}/close`, { outcome }),
};
