import { useNavigate } from 'react-router-dom';
import { Button, Result } from 'antd';

const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="Page not found"
      subTitle="The page you're looking for doesn't exist or has moved."
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </Button>
      }
    />
  );
};

export default NotFoundPage;
