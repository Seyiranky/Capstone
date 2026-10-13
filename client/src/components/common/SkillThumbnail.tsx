import { tradePhoto } from '../../utils/gigPhotos';
import type { SkillCategory } from '../../types';

interface SkillThumbnailProps {
  category?: SkillCategory | string | null;
  size?: number;
  /** Picks which of the trade's photos to show, so a list of gigs varies. */
  seed?: string;
}

const SkillThumbnail = ({ category, size = 40, seed }: SkillThumbnailProps) => {
  const src = tradePhoto(category, seed);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0, display: 'block' }}
    />
  );
};

export default SkillThumbnail;
