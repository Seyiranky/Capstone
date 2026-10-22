import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { Alert, Form, Modal, Select, Typography } from 'antd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { googleLogin } from '../../store/slices/authSlice';
import { ROLE_OPTIONS } from '../../constants/roles';
import type { Role } from '../../types';

const GoogleLoginButton = () => {
  const { t } = useTranslation();
  const [pendingCredential, setPendingCredential] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [role, setRole] = useState<Role>('worker');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((state) => state.auth);
  const containerRef = useRef<HTMLDivElement>(null);
  const [buttonWidth, setButtonWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setButtonWidth(Math.min(400, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const finishLogin = async (credential: string, chosenRole?: Role) => {
    const result = await dispatch(googleLogin({ credential, role: chosenRole }));
    if (googleLogin.fulfilled.match(result)) {
      if ('needsRole' in result.payload) {
        setPendingCredential(credential);
        setPendingName(result.payload.name);
      } else {
        setPendingCredential(null);
        navigate('/dashboard');
      }
    }
  };

  const handleSuccess = (credentialResponse: CredentialResponse) => {
    if (credentialResponse.credential) finishLogin(credentialResponse.credential);
  };

  return (
    <>
      {/* Google draws its button at a fixed pixel width, so it is measured to
          match the form's full-width fields and buttons (Google caps it at 400). */}
      <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 40 }}>
        {buttonWidth > 0 && (
          <GoogleLogin onSuccess={handleSuccess} onError={() => undefined} width={String(buttonWidth)} />
        )}
      </div>
      {/* A failed sign-in is shown once, by the form above (LoginForm), which
          shares this error; the role dialog below shows its own, as it covers the form. */}

      <Modal
        open={!!pendingCredential}
        title={t('common.finishSetup')}
        okText={t('common.continueAction')}
        confirmLoading={status === 'loading'}
        onOk={() => pendingCredential && finishLogin(pendingCredential, role)}
        onCancel={() => setPendingCredential(null)}
      >
        <Typography.Paragraph type="secondary">
          Welcome, {pendingName}! Tell us how you'll be using Isoko.
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label={t('common.iAmA')}>
            <Select value={role} onChange={(v) => setRole(v as Role)} options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
        {error && <Alert type="error" showIcon message={error} />}
      </Modal>
    </>
  );
};

export default GoogleLoginButton;
