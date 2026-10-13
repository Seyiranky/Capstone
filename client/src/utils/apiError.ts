import { isAxiosError } from 'axios';

/** The server's own explanation when it sent one (they are written for users), else the fallback. */
export const apiErrorMessage = (err: unknown, fallback: string): string => {
  const text = isAxiosError(err) ? err.response?.data?.message : undefined;
  return typeof text === 'string' && text ? text : fallback;
};
