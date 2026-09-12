import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { Alert, Form, Modal, Select, Typography } from 'antd';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { googleLogin } from '../../store/slices/authSlice';
import { ROLE_OPTIONS } from '../../constants/roles';
import type { Role } from '../../types';

const GoogleLoginButton = () => {
  const [pendingCredential, setPendingCredential] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState('');
  const [role, setRole] = useState<Role>('worker');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((state) => state.auth);

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
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <GoogleLogin onSuccess={handleSuccess} onError={() => undefined} width="320" />
      </div>
      {error && !pendingCredential && (
        <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />
      )}

      <Modal
        open={!!pendingCredential}
        title="Finish setting up your account"
        okText="Continue"
        confirmLoading={status === 'loading'}
        onOk={() => pendingCredential && finishLogin(pendingCredential, role)}
        onCancel={() => setPendingCredential(null)}
      >
        <Typography.Paragraph type="secondary">
          Welcome, {pendingName}! Tell us how you'll be using Isoko Talents.
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="I am a...">
            <Select value={role} onChange={(v) => setRole(v as Role)} options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
        {error && <Alert type="error" showIcon message={error} />}
      </Modal>
    </>
  );
};

export default GoogleLoginButton;
