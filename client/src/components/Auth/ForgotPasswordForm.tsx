import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/authApi';

const ForgotPasswordForm = () => {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const onFinish = async ({ email }: { email: string }) => {
    setError(null);
    setSubmitting(true);
    try {
      // The answer is the same whether or not the address has an account.
      await authApi.forgotPassword({ email });
      setSentTo(email);
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

      {sentTo ? (
        <Alert
          type="success"
          showIcon
          message={t('auth.forgotPassword.sentTitle')}
          description={t('auth.forgotPassword.sentBody', { email: sentTo })}
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
