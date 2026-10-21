import type { StorageDriver } from './index';

/**
 * The files on this server's disk are the lasting copy: development, tests, and
 * Docker Compose with its uploads volume. Saving and reading are left to multer
 * and the static file server, so this driver does nothing of its own.
 */
export const localDriver: StorageDriver = {
  name: 'local',
  save: async () => undefined,
  read: async () => null,
  remove: async () => undefined,
};
