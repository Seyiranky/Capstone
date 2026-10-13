import axiosClient from './axiosClient';
import type { LevelKey, Provenance, SkillCategory } from '../types';

export interface DirectoryWorker {
  id: string;
  name: string;
  level: LevelKey | null;
  trustScore: number;
  reviewCount: number;
  completedJobCount: number;
  availability: 'available' | 'busy' | 'away';
  availableFrom: string | null;
  area: string | null;
  summary: string | null;
  yearsExperience: number | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  skills: { name: string; category: SkillCategory; provenance: Provenance | null }[];
}

export interface DirectoryQuery {
  q?: string;
  category?: string;
  area?: string;
  proven?: boolean;
  available?: boolean;
  sort?: 'trust' | 'jobs' | 'newest';
}

export const directoryApi = {
  list: (query: DirectoryQuery) =>
    axiosClient
      .get<{ total: number; workers: DirectoryWorker[] }>('/users/directory', { params: query })
      .then((res) => res.data),
  invite: (gigId: string, workerId: string) => axiosClient.post(`/gigs/${gigId}/invite`, { workerId }),
};
