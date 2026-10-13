import axiosClient from './axiosClient';
import type { FairworkScorecard } from '../types';

export const fairworkApi = {
  scorecard: () => axiosClient.get<FairworkScorecard>('/fairwork').then((res) => res.data),
};
