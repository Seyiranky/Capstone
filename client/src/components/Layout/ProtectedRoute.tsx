import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Button, Result, Spin } from 'antd';
import { useAppSelector } from '../../store/hooks';
import type { Role } from '../../types';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const { token, role, profile } = useAppSelector((state) => state.auth);

  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (!profile) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="You don't have access to this page."
        extra={
          <Button type="primary" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </Button>
        }
      />
    );
  }

  return <Outlet />;
};

export default ProtectedRoute;
