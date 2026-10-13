import { useTranslation } from 'react-i18next';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { CodeOutlined, ReadOutlined, ScissorOutlined, ToolOutlined, AppstoreOutlined } from '@ant-design/icons';
import { resolveAssetUrl } from '../../utils/assetUrl';
import type { Gig, SkillCategory } from '../../types';

/**
 * The picture at the top of a gig.
 *
 * A photo the client uploaded is shown as it is. Without one, the gig gets a
 * drawn cover for its trade rather than a stock photo: a stock photo repeats
 * on every gig in the trade and suggests a job that may look nothing like it.
 * The pattern's angle and scale come from the gig's id, so
 * two gigs in the same trade still look different side by side.
 */

const ICONS: Record<SkillCategory, ReactNode> = {
  digital_web: <CodeOutlined />,
  electronics_repair: <ToolOutlined />,
  tailoring: <ScissorOutlined />,
  tutoring: <ReadOutlined />,
};

/** One tile of each trade's pattern, drawn in currentColor. */
const PATTERNS: Record<SkillCategory, { size: number; body: ReactNode }> = {
  // A layout grid with the odd filled cell.
  digital_web: {
    size: 28,
    body: (
      <>
        <path d="M28 0H0V28" fill="none" stroke="currentColor" strokeWidth="1" />
        <rect x="4" y="4" width="6" height="3" rx="1" fill="currentColor" />
      </>
    ),
  },
  // Circuit traces with solder pads.
  electronics_repair: {
    size: 48,
    body: (
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M0 14H16L24 22H48" />
        <path d="M14 48V36L22 28" />
        <circle cx="24" cy="22" r="2.5" fill="currentColor" />
        <circle cx="22" cy="28" r="2" />
      </g>
    ),
  },
  // Rows of running stitches.
  tailoring: {
    size: 16,
    body: <path d="M0 8H16" stroke="currentColor" strokeWidth="1.6" strokeDasharray="5 3" strokeLinecap="round" />,
  },
  // Ruled exercise-book lines.
  tutoring: {
    size: 18,
    body: (
      <>
        <path d="M0 17H18" stroke="currentColor" strokeWidth="1" />
        <circle cx="9" cy="9" r="0.9" fill="currentColor" />
      </>
    ),
  },
};

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const isCategory = (c: unknown): c is SkillCategory => typeof c === 'string' && c in ICONS;

interface CoverArtProps {
  category?: SkillCategory | string | null;
  seed?: string;
  iconSize?: number;
  /** Where the icon tile sits; `center` for small squares. */
  tile?: 'offset' | 'center';
  /** Show the trade's name beside the tile. */
  labelled?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/** The drawn cover alone, at whatever size its container gives it. */
export const CoverArt = ({ category, seed = '', iconSize = 26, tile = 'offset', labelled = false, children, style, className }: CoverArtProps) => {
  const { t } = useTranslation();
  const id = useId().replace(/:/g, '');
  const cat = isCategory(category) ? category : null;
  const h = hash(seed + (cat ?? ''));
  const pattern = cat ? PATTERNS[cat] : PATTERNS.digital_web;
  const angle = [-30, -15, 0, 15, 30, 45][h % 6];
  const scale = [1, 1.25, 1.5][(h >> 3) % 3];
  const box = Math.round(iconSize * 2.2);
  const place: CSSProperties =
    tile === 'center'
      ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
      : { left: '7%', bottom: '13%' };
  return (
    <div className={`isoko-cover isoko-cover--${cat ?? 'other'} ${className ?? ''}`} style={style}>
      <svg className="isoko-cover__pattern" aria-hidden="true">
        <defs>
          <pattern
            id={`p${id}`}
            width={pattern.size}
            height={pattern.size}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${angle}) scale(${scale})`}
          >
            {pattern.body}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#p${id})`} />
      </svg>
      <span
        className="isoko-cover__tile"
        style={{ width: box, height: box, fontSize: iconSize, borderRadius: Math.max(6, box / 5), ...place }}
      >
        {cat ? ICONS[cat] : <AppstoreOutlined />}
      </span>
      {labelled && cat && tile === 'offset' && (
        <span className="isoko-cover__label" style={{ left: `calc(7% + ${box + 12}px)`, bottom: `calc(13% + ${box / 2}px)` }}>
          {t(`marketplace.trade.${cat}`)}
        </span>
      )}
      {children}
    </div>
  );
};

interface GigCoverProps {
  gig: Pick<Gig, 'id' | 'imageUrl' | 'skill'>;
  style?: CSSProperties;
  iconSize?: number;
  children?: ReactNode;
}

/** A gig's photo when it has one, otherwise its drawn cover. Overlays go in `children`. */
const GigCover = ({ gig, style, iconSize, children }: GigCoverProps) => {
  const photo = resolveAssetUrl(gig.imageUrl);
  if (photo) {
    return (
      <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--ant-color-fill-tertiary)', ...style }}>
        <img src={photo} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {children}
      </div>
    );
  }
  return (
    <CoverArt category={gig.skill?.category} seed={gig.id} iconSize={iconSize} style={style} labelled>
      {children}
    </CoverArt>
  );
};

export default GigCover;
