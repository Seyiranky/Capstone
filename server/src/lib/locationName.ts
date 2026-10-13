/**
 * Kigali areas, as the web app offers them when a gig is posted (kept in step
 * with client/src/constants/locations.ts). Used where the server has to name a
 * place in text, such as a USSD screen.
 */
const AREAS: [string, number, number][] = [
  ['Nyarugenge', -1.9441, 30.0619],
  ['Kimisagara', -1.935, 30.04],
  ['Nyamirambo', -1.9706, 30.0394],
  ['Kiyovu', -1.95, 30.058],
  ['Nyabugogo', -1.9436, 30.0508],
  ['Remera', -1.9558, 30.1044],
  ['Kacyiru', -1.935, 30.0889],
  ['Kimihurura', -1.95, 30.09],
  ['Gisozi', -1.9167, 30.0667],
  ['Gikondo', -1.9833, 30.0667],
  ['Kicukiro', -1.9889, 30.1],
  ['Kanombe', -1.9706, 30.1361],
];

/** The nearest named area, if one is within about 3 km; otherwise nothing rather than a wrong name. */
export const locationName = (lat?: number | null, lng?: number | null): string | null => {
  if (lat == null || lng == null) return null;
  let best: { name: string; d: number } | null = null;
  for (const [name, a, b] of AREAS) {
    const d = Math.hypot(a - lat, (b - lng) * Math.cos((lat * Math.PI) / 180));
    if (!best || d < best.d) best = { name, d };
  }
  return best && best.d < 0.027 ? best.name : null;
};
