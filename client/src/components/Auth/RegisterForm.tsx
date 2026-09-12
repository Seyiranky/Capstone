import { Alert, Button, Form, Input, Select, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { register } from '../../store/slices/authSlice';
import { ROLE_OPTIONS } from '../../constants/roles';
import type { Role } from '../../types';

interface RegisterValues {
  name: string;
  email: string;
  password: string;
  role: Role;
}

const RegisterForm = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { status, error } = useAppSelector((state) => state.auth);

  const onFinish = async (values: RegisterValues) => {
    const result = await dispatch(register(values));
    if (register.fulfilled.match(result)) navigate('/dashboard');
  };

  return (
    <div>
      <Typography.Title level={2} style={{ marginBottom: 4 }}>
        {t('auth.register.title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {t('auth.register.subtitle')}
      </Typography.Paragraph>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      <Form
        layout="vertical"
        onFinish={onFinish}
        requiredMark={false}
        size="large"
        initialValues={{ role: 'worker' }}
      >
        <Form.Item name="name" label={t('auth.register.nameLabel')} rules={[{ required: true }]}>
          <Input autoComplete="name" />
        </Form.Item>
        <Form.Item
          name="email"
          label={t('auth.register.emailLabel')}
          rules={[{ required: true, type: 'email' }]}
        >
          <Input autoComplete="email" />
        </Form.Item>
        <Form.Item
          name="password"
          label={t('auth.register.passwordLabel')}
          rules={[{ required: true, min: 8 }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="role" label={t('auth.register.roleLabel')} rules={[{ required: true }]}>
          <Select options={ROLE_OPTIONS} />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={status === 'loading'}>
          {t('auth.register.submit')}
        </Button>
      </Form>

      <Typography.Paragraph style={{ textAlign: 'center', marginTop: 24, marginBottom: 0 }}>
        {t('auth.register.haveAccount')} <Link to="/login">{t('auth.register.loginLink')}</Link>
      </Typography.Paragraph>
    </div>
  );
};

export default RegisterForm;
