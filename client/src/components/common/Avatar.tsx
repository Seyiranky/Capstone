import { useState } from 'react';
import { Avatar as AntdAvatar } from 'antd';
import { resolveAssetUrl } from '../../utils/assetUrl';

// Monochrome greys, picked deterministically from the name.
const GREYS = ['#3f3f46', '#52525b', '#71717a', '#27272a', '#5b5b64'];

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
};

const greyFor = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GREYS[hash % GREYS.length];
};

interface AvatarProps {
  name: string;
  size?: number;
  /** The person's profile picture; initials show when there is none or it fails to load. */
  src?: string | null;
}

const Avatar = ({ name, size = 36, src }: AvatarProps) => {
  const [failed, setFailed] = useState<string | null>(null);
  const url = src && failed !== src ? resolveAssetUrl(src) : undefined;
  if (url) {
    return (
      <AntdAvatar
        size={size}
        src={url}
        alt={name}
        style={{ flexShrink: 0 }}
        onError={() => {
          setFailed(src!);
          return false;
        }}
      />
    );
  }
  return (
  <AntdAvatar
    size={size}
    style={{
      backgroundColor: greyFor(name || '?'),
      color: '#fff',
      fontSize: Math.max(11, size * 0.4),
      fontWeight: 600,
      flexShrink: 0,
    }}
  >
    {initialsOf(name)}
  </AntdAvatar>
  );
};

export default Avatar;
