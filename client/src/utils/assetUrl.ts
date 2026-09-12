const API_BASE: string = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const ASSET_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

// Uploaded files (e.g. a gig photo) are returned by the API as server-relative
// paths like `/uploads/gigs/xyz.jpg`. The client and server run on different
// origins in dev, so that path needs the API's origin prefixed to resolve.
export const resolveAssetUrl = (path?: string | null): string | undefined => {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${ASSET_ORIGIN}${path}`;
};
