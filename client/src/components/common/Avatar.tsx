import { Avatar as AntdAvatar } from 'antd';

// Monochrome greys, picked deterministically from the name.
// Drawn from the logo's palette: navy, terracotta, ochre, slate blue, olive.
const GREYS = ['#1E3A5F', '#B5562F', '#9A7A2E', '#4C6E96', '#6B7A4B'];

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
}

const Avatar = ({ name, size = 36 }: AvatarProps) => (
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

export default Avatar;
