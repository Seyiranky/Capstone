import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/authApi';

const ResetPasswordForm = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const onFinish = async ({ password }: { password: string; confirm: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      await authApi.resetPassword({ token, password });
      navigate('/login');
    } catch {
      setError(t('auth.resetPassword.invalidTokenError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div>
        <Typography.Title level={2}>{t('auth.resetPassword.missingTokenTitle')}</Typography.Title>
        <Alert type="error" showIcon message={t('auth.resetPassword.missingTokenError')} />
        <Typography.Paragraph style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/forgot-password">{t('auth.resetPassword.requestNewLink')}</Link>
        </Typography.Paragraph>
      </div>
    );
  }

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 24 }}>
        {t('auth.resetPassword.title')}
      </Typography.Title>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
        <Form.Item
          name="password"
          label={t('auth.resetPassword.newPasswordLabel')}
          rules={[{ required: true, min: 8 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label={t('auth.resetPassword.confirmPasswordLabel')}
          dependencies={['password']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('auth.resetPassword.mismatchError'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>
          {t('auth.resetPassword.submit')}
        </Button>
      </Form>

      <Typography.Paragraph style={{ textAlign: 'center', marginTop: 24, marginBottom: 0 }}>
        <Link to="/login">{t('auth.resetPassword.backToLogin')}</Link>
      </Typography.Paragraph>
    </div>
  );
};

export default ResetPasswordForm;
