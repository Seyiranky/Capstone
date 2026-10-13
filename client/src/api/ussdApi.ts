import axiosClient from './axiosClient';

export const ussdApi = {
  simulate: (text: string) => axiosClient.post<{ screen: string }>('/ussd/simulate', { text }).then((res) => res.data.screen),
};
