import { CoverArt } from './GigCover';
import type { SkillCategory } from '../../types';

interface SkillThumbnailProps {
  category?: SkillCategory | string | null;
  size?: number;
  seed?: string;
}

/** A small square in the trade's cover style, for lists. */
const SkillThumbnail = ({ category, size = 40, seed }: SkillThumbnailProps) => (
  <CoverArt
    category={category}
    seed={seed}
    tile="center"
    iconSize={Math.round(size * 0.3)}
    style={{ width: size, height: size, borderRadius: 8, flexShrink: 0 }}
  />
);

export default SkillThumbnail;
