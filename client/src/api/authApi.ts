import axiosClient from './axiosClient';
import type { Role } from '../types';

export interface AuthResponse {
  token: string;
  userId: string;
  role: Role;
}

export interface GoogleNeedsRole {
  needsRole: true;
  name: string;
  email: string;
}

export type GoogleLoginResponse = AuthResponse | GoogleNeedsRole;

export const authApi = {
  register: (payload: { name: string; email: string; password: string; role: Role }) =>
    axiosClient.post<AuthResponse>('/auth/register', payload).then((res) => res.data),

  login: (payload: { email: string; password: string }) =>
    axiosClient.post<AuthResponse>('/auth/login', payload).then((res) => res.data),

  googleLogin: (payload: { credential: string; role?: Role }) =>
    axiosClient.post<GoogleLoginResponse>('/auth/google', payload).then((res) => res.data),

  forgotPassword: (payload: { email: string }) =>
    axiosClient
      .post<{ message: string; resetToken?: string }>('/auth/forgot-password', payload)
      .then((res) => res.data),

  resetPassword: (payload: { token: string; password: string }) =>
    axiosClient.post<{ message: string }>('/auth/reset-password', payload).then((res) => res.data),
};
