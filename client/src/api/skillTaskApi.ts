import axiosClient from './axiosClient';
import type { SkillTask } from '../types';

export const skillTaskApi = {
  submitTask: (payload: { skillId: string; evidenceUrl: string; notes?: string }) =>
    axiosClient.post<SkillTask>('/skill-tasks', payload).then((res) => res.data),

  listTasks: (params?: { assignedToMe?: boolean }) =>
    axiosClient.get<SkillTask[]>('/skill-tasks', { params }).then((res) => res.data),

  reviewTask: (id: string, decision: 'approved' | 'rejected', notes?: string) =>
    axiosClient.put<SkillTask>(`/skill-tasks/${id}/review`, { decision, notes }).then((res) => res.data),
};
