import { skillPhoto } from '../../utils/skillPhotos';
import type { SkillCategory } from '../../types';

interface SkillThumbnailProps {
  category?: SkillCategory | string | null;
  size?: number;
}

const SkillThumbnail = ({ category, size = 40 }: SkillThumbnailProps) => {
  const src = skillPhoto(category);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        objectFit: 'cover',
        flexShrink: 0,
        display: 'block',
      }}
    />
  );
};

export default SkillThumbnail;
