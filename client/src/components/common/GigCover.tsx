import type { CSSProperties, ReactNode } from 'react';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { tradePhoto } from '../../utils/gigPhotos';
import type { Gig } from '../../types';

interface GigCoverProps {
  gig: Pick<Gig, 'id' | 'imageUrl' | 'skill'>;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * The picture at the top of a gig: the client's own photo when there is one,
 * otherwise a photo of the trade. Overlays (save, "New", voice note) go in `children`.
 */
const GigCover = ({ gig, style, children }: GigCoverProps) => {
  const src = resolveAssetUrl(gig.imageUrl) ?? tradePhoto(gig.skill?.category, gig.id);
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--ant-color-fill-tertiary)', ...style }}>
      {src && (
        <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {children}
    </div>
  );
};

export default GigCover;
