import axiosClient from './axiosClient';
import type { Skill } from '../types';

/** A category with its specialisations nested beneath it. */
export type SkillTree = Skill & { children?: Skill[] };

export const skillApi = {
  /** Categories only — what the flat pickers have always shown. */
  listSkills: () => axiosClient.get<Skill[]>('/skills').then((res) => res.data),

  /** Categories with their specialisations, in one call, for a cascading picker. */
  listSkillTree: () =>
    axiosClient.get<SkillTree[]>('/skills', { params: { tree: 1 } }).then((res) => res.data),

  getSkill: (id: string) => axiosClient.get<Skill>(`/skills/${id}`).then((res) => res.data),
};
