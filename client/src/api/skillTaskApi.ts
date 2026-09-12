import axiosClient from './axiosClient';
import type { SkillTask } from '../types';

export interface SubmitTaskPayload {
  skillId: string;
  evidenceUrl?: string;
  notes?: string;
  /** Photos, video, or voice notes captured on the device. */
  files?: File[];
}

export const skillTaskApi = {
  submitTask: ({ skillId, evidenceUrl, notes, files = [] }: SubmitTaskPayload) => {
    const body = new FormData();
    body.append('skillId', skillId);
    if (evidenceUrl) body.append('evidenceUrl', evidenceUrl);
    if (notes) body.append('notes', notes);
    files.forEach((file) => body.append('evidence', file));
    return axiosClient.post<SkillTask>('/skill-tasks', body).then((res) => res.data);
  },

  listTasks: (params?: { assignedToMe?: boolean }) =>
    axiosClient.get<SkillTask[]>('/skill-tasks', { params }).then((res) => res.data),

  reviewTask: (
    id: string,
    decision: 'approved' | 'rejected',
    options?: { notes?: string; confidence?: number; proficiencyLevel?: number },
  ) =>
    axiosClient
      .put<SkillTask>(`/skill-tasks/${id}/review`, { decision, ...options })
      .then((res) => res.data),

  appealTask: (id: string, reason: string) =>
    axiosClient.post<{ task: SkillTask }>(`/skill-tasks/${id}/appeal`, { reason }).then((res) => res.data),
};
