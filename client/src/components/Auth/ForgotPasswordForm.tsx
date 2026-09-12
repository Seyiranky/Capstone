import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/authApi';

const ForgotPasswordForm = () => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const onFinish = async ({ email }: { email: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.forgotPassword({ email });
      if (result.resetToken) {
        setResetLink(`/reset-password?token=${result.resetToken}`);
      } else {
        setError(t('auth.forgotPassword.noAccountError'));
      }
    } catch {
      setError(t('auth.forgotPassword.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 4 }}>
        {t('auth.forgotPassword.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {t('auth.forgotPassword.subtitle')}
      </Typography.Paragraph>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {resetLink ? (
        <Alert
          type="success"
          showIcon
          message={t('auth.forgotPassword.noEmailNotice')}
          description={<Link to={resetLink}>{t('auth.forgotPassword.continueLink')}</Link>}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
          <Form.Item
            name="email"
            label={t('auth.forgotPassword.emailLabel')}
            rules={[{ required: true, type: 'email' }]}
          >
            <Input autoComplete="email" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            {t('auth.forgotPassword.submit')}
          </Button>
        </Form>
      )}

      <Typography.Paragraph style={{ textAlign: 'center', marginTop: 24, marginBottom: 0 }}>
        {t('auth.forgotPassword.remembered')}{' '}
        <Link to="/login">{t('auth.forgotPassword.loginLink')}</Link>
      </Typography.Paragraph>
    </div>
  );
};

export default ForgotPasswordForm;
