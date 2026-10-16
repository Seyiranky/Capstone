import axiosClient from './axiosClient';

type Coords = { lat?: number; lng?: number };

/** This person's visit on a job, and their latest SOS with how far it has got. */
export interface VisitStatus {
  checkedIn: boolean;
  since: string | null;
  sos: { id: string; at: string; contactNotified: boolean; acknowledgedAt: string | null; resolvedAt: string | null } | null;
}

export const safeVisitApi = {
  status: (matchId: string) => axiosClient.get<VisitStatus>(`/matches/${matchId}/visit`).then((res) => res.data),
  checkIn: (matchId: string, coords: Coords) => axiosClient.post(`/matches/${matchId}/check-in`, coords).then((res) => res.data),
  checkOut: (matchId: string, coords: Coords) => axiosClient.post(`/matches/${matchId}/check-out`, coords).then((res) => res.data),
  sos: (matchId: string, coords: Coords) => axiosClient.post(`/matches/${matchId}/sos`, coords).then((res) => res.data),
  alerts: () => axiosClient.get<SafetyAlert[]>('/admin/safety-alerts').then((res) => res.data),
  openCount: () => axiosClient.get<{ count: number }>('/admin/safety-alerts/open-count').then((res) => res.data.count),
  acknowledge: (id: string) => axiosClient.put(`/admin/safety-alerts/${id}/acknowledge`).then((res) => res.data),
  resolve: (id: string, note: string) => axiosClient.put(`/admin/safety-alerts/${id}/resolve`, { note }).then((res) => res.data),
};

interface Person {
  id: string;
  name: string;
  phone?: string | null;
}

export interface SafetyAlert {
  id: string;
  kind: 'sos' | 'overdue';
  lat: number | null;
  lng: number | null;
  contactNotified: boolean;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  checkedInSince: string | null;
  area: string | null;
  user?: (Person & { trustedContactName: string | null; trustedContactPhone: string | null }) | null;
  client?: Person | null;
  acknowledger?: Person | null;
  resolver?: Person | null;
  match?: { id: string; gigId: string; status: string; gig?: { id: string; title: string } };
}
