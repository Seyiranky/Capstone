import axiosClient from './axiosClient';
import type { SkillTask, UserSkill } from '../types';

export interface SubmitTaskPayload {
  skillId: string;
  evidenceUrl?: string;
  notes?: string;
  /** Photos, video, or voice notes captured on the device. */
  files?: File[];
  kind?: 'demonstration' | 'certificate';
  /** Required when kind is 'certificate'. */
  title?: string;
  issuer?: string;
  issuedOn?: string;
  /**
   * What each file is, positionally. A photograph of a certificate and a
   * photograph of finished work share a mime type, so the client states it.
   */
  evidenceKinds?: string[];
}

export const skillTaskApi = {
  submitTask: ({
    skillId,
    evidenceUrl,
    notes,
    files = [],
    kind,
    title,
    issuer,
    issuedOn,
    evidenceKinds = [],
  }: SubmitTaskPayload) => {
    const body = new FormData();
    body.append('skillId', skillId);
    if (evidenceUrl) body.append('evidenceUrl', evidenceUrl);
    if (notes) body.append('notes', notes);
    if (kind) body.append('kind', kind);
    if (title) body.append('title', title);
    if (issuer) body.append('issuer', issuer);
    if (issuedOn) body.append('issuedOn', issuedOn);
    files.forEach((file) => body.append('evidence', file));
    evidenceKinds.forEach((k) => body.append('evidenceKind', k));
    return axiosClient.post<SkillTask>('/skill-tasks', body).then((res) => res.data);
  },

  declareSkill: (skillId: string, proficiencyLevel?: number) =>
    axiosClient
      .post<UserSkill>('/skill-tasks/declare', { skillId, proficiencyLevel })
      .then((res) => res.data),

  listMySkills: () =>
    axiosClient.get<UserSkill[]>('/skill-tasks/my-skills').then((res) => res.data),

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
