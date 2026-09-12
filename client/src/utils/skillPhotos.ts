import digitalWeb from '../assets/skills/digital_web.jpg';
import electronicsRepair from '../assets/skills/electronics_repair.jpg';
import tailoring from '../assets/skills/tailoring.jpg';
import tutoring from '../assets/skills/tutoring.jpg';
import type { SkillCategory } from '../types';

const PHOTOS: Record<SkillCategory, string> = {
  digital_web: digitalWeb,
  electronics_repair: electronicsRepair,
  tailoring,
  tutoring,
};

export const skillPhoto = (category?: SkillCategory | string | null): string | undefined =>
  category ? PHOTOS[category as SkillCategory] : undefined;
