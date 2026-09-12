import { Alert, Button, Divider, Form, Input, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { login } from '../../store/slices/authSlice';
import GoogleLoginButton from './GoogleLoginButton';

const LoginForm = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((state) => state.auth);

  const onFinish = async (values: { email: string; password: string }) => {
    const result = await dispatch(login(values));
    if (login.fulfilled.match(result)) navigate('/dashboard');
  };

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 4 }}>
        {t('auth.login.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {t('auth.login.subtitle')}
      </Typography.Paragraph>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item
          name="email"
          label={t('auth.login.emailLabel')}
          rules={[{ required: true, type: 'email' }]}
        >
          <Input autoComplete="email" />
        </Form.Item>
        <Form.Item
          name="password"
          label={t('auth.login.passwordLabel')}
          rules={[{ required: true }]}
          style={{ marginBottom: 8 }}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <Link to="/forgot-password">{t('auth.login.forgotPassword')}</Link>
        </div>
        <Button type="primary" htmlType="submit" block loading={status === 'loading'}>
          {t('auth.login.submit')}
        </Button>
      </Form>

      <Divider plain style={{ color: 'rgba(128,128,128,0.7)' }}>
        {t('auth.login.or')}
      </Divider>

      <GoogleLoginButton />

      <Typography.Paragraph style={{ textAlign: 'center', marginTop: 24, marginBottom: 0 }}>
        {t('auth.login.noAccount')} <Link to="/register">{t('auth.login.registerLink')}</Link>
      </Typography.Paragraph>
    </div>
  );
};

export default LoginForm;
