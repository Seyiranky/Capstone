import { useLocation, useNavigate } from 'react-router-dom';
import { Segmented } from 'antd';

const OPTIONS = [
  { label: 'Overview', value: '/admin' },
  { label: 'Users', value: '/admin/users' },
  { label: 'Pending gigs', value: '/admin/gigs/pending' },
  { label: 'Completed gigs', value: '/admin/gigs/completed' },
];

const AdminNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const value = OPTIONS.slice().reverse().find((o) => pathname.startsWith(o.value))?.value ?? '/admin';

  return (
    <Segmented
      value={value}
      onChange={(v) => navigate(v as string)}
      options={OPTIONS}
      style={{ marginBottom: 20 }}
    />
  );
};

export default AdminNav;
