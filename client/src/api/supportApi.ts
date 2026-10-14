import axiosClient from './axiosClient';

export type SupportCategory = 'payment' | 'account' | 'skills' | 'job' | 'safety' | 'bug' | 'other';
export type SupportStatus = 'open' | 'waiting_on_user' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent';
export type SupportRelatedType = 'match' | 'transaction' | 'skill_task';

export const SUPPORT_CATEGORIES: SupportCategory[] = ['payment', 'account', 'skills', 'job', 'safety', 'bug', 'other'];

export interface SupportPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role?: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorId: string | null;
  authorRole: 'user' | 'guest' | 'admin' | 'system';
  body: string;
  internal: boolean;
  systemKey: string | null;
  meta: Record<string, string> | null;
  attachmentUrl: string | null;
  attachmentMime: string | null;
  attachmentName: string | null;
  createdAt: string;
  author?: SupportPerson | null;
}

export interface SupportRelated {
  type: SupportRelatedType;
  id: string;
  title: string;
  detail: string | null;
  status: string | null;
  matchId: string | null;
  gigId: string | null;
}

export interface SupportTicket {
  id: string;
  number: string;
  userId: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  priority: SupportPriority;
  relatedType: SupportRelatedType | null;
  relatedId: string | null;
  context: { path?: string; userAgent?: string; language?: string; screen?: string } | null;
  assigneeId?: string | null;
  userUnread: boolean;
  adminUnread?: boolean;
  lastMessageAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  helpful: boolean | null;
  ratingComment: string | null;
  escalatedTo: 'dispute' | 'report' | null;
  escalatedId: string | null;
  createdAt: string;
  user?: SupportPerson | null;
  assignee?: SupportPerson | null;
}

export interface SupportTicketDetail extends SupportTicket {
  related: SupportRelated | null;
  messages: SupportMessage[];
}

export interface SupportPersonSummary extends SupportPerson {
  email: string;
  phone: string | null;
  status: string;
  trustScore: number;
  reviewCount: number;
  completedJobCount: number;
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  createdAt: string;
  recentJobs: { id: string; gigId?: string; title?: string; status: string; asWorker: boolean }[];
  tickets: { id: string; number: string; subject: string; status: SupportStatus; category: SupportCategory; createdAt: string }[];
}

export interface AdminTicketDetail extends SupportTicketDetail {
  person: SupportPersonSummary | null;
}

export interface SupportMetrics {
  open: number;
  waiting: number;
  resolved: number;
  closed: number;
  unassigned: number;
  medianFirstReplyHours: number | null;
  satisfaction: number | null;
  ratedCount: number;
  last30Days: number;
  byCategory: Record<string, number>;
}

export interface SavedReply {
  id: string;
  title: string;
  body: string;
  bodyRw: string | null;
  category: SupportCategory | null;
  usageCount: number;
}

export interface Linkable {
  jobs: { id: string; title: string; status: string; createdAt: string }[];
  payments: { id: string; title: string; amount: number; status: string; receiptNumber: string | null; createdAt: string }[];
  skills: { id: string; title: string; status: string; createdAt: string }[];
}

/** What the browser can tell the team about where the person was. */
export const browserContext = (path = window.location.pathname) => ({
  path,
  userAgent: navigator.userAgent,
  language: navigator.language,
  screen: `${window.innerWidth}x${window.innerHeight}`,
});

const form = (fields: Record<string, unknown>, file?: File | null) => {
  if (!file) return fields;
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    data.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  data.append('attachment', file);
  return data;
};

export interface NewTicketInput {
  category: SupportCategory;
  subject: string;
  body: string;
  relatedType?: SupportRelatedType;
  relatedId?: string;
  context?: ReturnType<typeof browserContext>;
}

export const supportApi = {
  create: (input: NewTicketInput, file?: File | null) =>
    axiosClient.post<SupportTicketDetail>('/support/tickets', form({ ...input }, file)).then((r) => r.data),
  list: () => axiosClient.get<SupportTicket[]>('/support/tickets').then((r) => r.data),
  get: (id: string) => axiosClient.get<SupportTicketDetail>(`/support/tickets/${id}`).then((r) => r.data),
  reply: (id: string, body: string, file?: File | null) =>
    axiosClient.post<SupportTicketDetail>(`/support/tickets/${id}/messages`, form({ body }, file)).then((r) => r.data),
  close: (id: string) => axiosClient.post<SupportTicketDetail>(`/support/tickets/${id}/close`).then((r) => r.data),
  rate: (id: string, helpful: boolean, comment?: string) =>
    axiosClient.post<SupportTicketDetail>(`/support/tickets/${id}/rate`, { helpful, comment }).then((r) => r.data),
  linkable: () => axiosClient.get<Linkable>('/support/linkable').then((r) => r.data),
  unread: () => axiosClient.get<{ count: number }>('/support/unread').then((r) => r.data.count),

  guestCreate: (input: Omit<NewTicketInput, 'relatedType' | 'relatedId'> & { name: string; email: string; website?: string }) =>
    axiosClient.post<{ number: string }>('/support/guest', input).then((r) => r.data),
  guestGet: (token: string) => axiosClient.get<SupportTicketDetail>(`/support/guest/${token}`).then((r) => r.data),
  guestReply: (token: string, body: string, file?: File | null) =>
    axiosClient.post<SupportTicketDetail>(`/support/guest/${token}/messages`, form({ body }, file)).then((r) => r.data),

  admin: {
    list: (params: Record<string, string | undefined>) =>
      axiosClient
        .get<{ tickets: SupportTicket[]; metrics: SupportMetrics; admins: SupportPerson[] }>('/support/admin/tickets', { params })
        .then((r) => r.data),
    get: (id: string) => axiosClient.get<AdminTicketDetail>(`/support/admin/tickets/${id}`).then((r) => r.data),
    reply: (id: string, input: { body: string; internal?: boolean; status?: 'resolved'; savedReplyId?: string }, file?: File | null) =>
      axiosClient.post(`/support/admin/tickets/${id}/messages`, form({ ...input }, file)).then((r) => r.data),
    update: (id: string, input: Partial<Pick<SupportTicket, 'status' | 'priority' | 'category' | 'assigneeId'>>) =>
      axiosClient.put(`/support/admin/tickets/${id}`, input).then((r) => r.data),
    escalate: (id: string, input: { to: 'dispute' | 'report'; reason?: string }) =>
      axiosClient.post<{ kind: string; id: string }>(`/support/admin/tickets/${id}/escalate`, input).then((r) => r.data),
    unread: () => axiosClient.get<{ count: number }>('/support/admin/unread').then((r) => r.data.count),
    savedReplies: () => axiosClient.get<SavedReply[]>('/support/admin/saved-replies').then((r) => r.data),
    createSavedReply: (input: Omit<SavedReply, 'id' | 'usageCount'>) =>
      axiosClient.post<SavedReply>('/support/admin/saved-replies', input).then((r) => r.data),
    updateSavedReply: (id: string, input: Omit<SavedReply, 'id' | 'usageCount'>) =>
      axiosClient.put<SavedReply>(`/support/admin/saved-replies/${id}`, input).then((r) => r.data),
    deleteSavedReply: (id: string) => axiosClient.delete(`/support/admin/saved-replies/${id}`),
  },
};
