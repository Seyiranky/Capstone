import { resolveAssetUrl } from './assetUrl';
import { skillPhoto } from './skillPhotos';
import type { Gig } from '../types';

/** Best cover image for a gig: its uploaded photo, else the skill-category photo. */
export const gigImageSrc = (gig: Pick<Gig, 'imageUrl' | 'skill'>): string | undefined =>
  resolveAssetUrl(gig.imageUrl) ?? skillPhoto(gig.skill?.category);
