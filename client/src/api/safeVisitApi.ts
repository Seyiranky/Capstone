import axiosClient from './axiosClient';

type Coords = { lat?: number; lng?: number };

export const safeVisitApi = {
  status: (matchId: string) =>
    axiosClient.get<{ checkedIn: boolean; since: string | null }>(`/matches/${matchId}/visit`).then((res) => res.data),
  checkIn: (matchId: string, coords: Coords) => axiosClient.post(`/matches/${matchId}/check-in`, coords).then((res) => res.data),
  checkOut: (matchId: string, coords: Coords) => axiosClient.post(`/matches/${matchId}/check-out`, coords).then((res) => res.data),
  sos: (matchId: string, coords: Coords) => axiosClient.post(`/matches/${matchId}/sos`, coords).then((res) => res.data),
  alerts: () => axiosClient.get<SafetyAlert[]>('/admin/safety-alerts').then((res) => res.data),
  resolve: (id: string) => axiosClient.put(`/admin/safety-alerts/${id}/resolve`).then((res) => res.data),
};

export interface SafetyAlert {
  id: string;
  kind: 'sos' | 'overdue';
  lat: number | null;
  lng: number | null;
  contactNotified: boolean;
  resolvedAt: string | null;
  createdAt: string;
  user?: { id: string; name: string; trustedContactName: string | null };
  match?: { id: string; gigId: string; gig?: { id: string; title: string } };
}
