import { Link } from 'react-router-dom';
import Avatar from './Avatar';

interface IdentityLinkProps {
  id: string;
  name: string;
  size?: number;
  /** Profile picture, if they have one. */
  src?: string | null;
}

const IdentityLink = ({ id, name, size = 28, src }: IdentityLinkProps) => (
  <Link
    to={`/profile/${id}`}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      color: 'inherit',
      maxWidth: '100%',
    }}
  >
    <Avatar name={name} size={size} src={src} />
    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
  </Link>
);

export default IdentityLink;
