import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Result, Spin } from 'antd';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/Auth/AuthLayout';
import { authApi } from '../api/authApi';

/**
 * Lands the link from a confirmation email.
 *
 * Public, like the password reset page: the link is opened from a mail client
 * where the user may not be signed in, and the token in the URL is the proof.
 */
const VerifyEmailPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'done' | 'failed'>('pending');
  // The token is single use, so a second submission would always fail. React
  // mounts effects twice in development, which is exactly that second call.
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) {
      return;
    }
    submitted.current = true;
    authApi
      .verifyEmail({ token })
      .then(() => setState('done'))
      .catch(() => setState('failed'));
  }, [token]);

  if (!token) {
    return (
      <AuthLayout>
        <Alert type="error" showIcon message={t('verifyEmail.missingToken')} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {state === 'pending' && <Spin size="large" tip={t('verifyEmail.checking')} fullscreen />}

      {state === 'done' && (
        <Result
          status="success"
          title={t('verifyEmail.successTitle')}
          subTitle={t('verifyEmail.successBody')}
          extra={
            <Link to="/settings">
              <Button type="primary">{t('verifyEmail.backToSettings')}</Button>
            </Link>
          }
        />
      )}

      {state === 'failed' && (
        <Result
          status="warning"
          title={t('verifyEmail.failedTitle')}
          subTitle={t('verifyEmail.failedBody')}
          extra={
            <Link to="/settings">
              <Button>{t('verifyEmail.backToSettings')}</Button>
            </Link>
          }
        />
      )}
    </AuthLayout>
  );
};

export default VerifyEmailPage;
