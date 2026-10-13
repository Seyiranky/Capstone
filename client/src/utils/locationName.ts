import { KIGALI_LOCATIONS } from '../constants/locations';

/**
 * The Kigali area a point is in: the nearest named area within about 3 km,
 * so a location set slightly off a named point still gets its name, and one
 * far from all of them gets none rather than a wrong one.
 */
export const locationName = (lat?: number | null, lng?: number | null): string | undefined => {
  if (lat == null || lng == null) return undefined;
  let best: { name: string; d: number } | undefined;
  for (const l of KIGALI_LOCATIONS) {
    const d = Math.hypot(l.lat - lat, (l.lng - lng) * Math.cos((lat * Math.PI) / 180));
    if (!best || d < best.d) best = { name: l.name, d };
  }
  return best && best.d < 0.027 ? best.name : undefined;
};
