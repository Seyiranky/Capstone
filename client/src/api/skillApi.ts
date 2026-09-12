import axiosClient from './axiosClient';
import type { Skill } from '../types';

export const skillApi = {
  listSkills: () => axiosClient.get<Skill[]>('/skills').then((res) => res.data),

  getSkill: (id: string) => axiosClient.get<Skill>(`/skills/${id}`).then((res) => res.data),
};
