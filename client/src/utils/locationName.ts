import { KIGALI_LOCATIONS } from '../constants/locations';

// Gig and profile locations are always set by picking a name from
// KIGALI_LOCATIONS, so their lat/lng always exactly matches one entry.
export const locationName = (lat?: number | null, lng?: number | null): string | undefined =>
  KIGALI_LOCATIONS.find((l) => l.lat === lat && l.lng === lng)?.name;
