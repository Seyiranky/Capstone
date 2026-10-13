import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { App, Button, Form, Input, Typography } from 'antd';
import { authApi } from '../../api/authApi';
import { useAppDispatch } from '../../store/hooks';
import { tokenRefreshed } from '../../store/slices/authSlice';
import { apiErrorMessage } from '../../utils/apiError';

interface Values {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/** Changes the password; every other device is signed out, this one stays in. */
const ChangePasswordForm = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm<Values>();
  const [busy, setBusy] = useState(false);

  const submit = async ({ currentPassword, newPassword }: Values) => {
    setBusy(true);
    try {
      const { token } = await authApi.changePassword({ currentPassword, newPassword });
      dispatch(tokenRefreshed(token));
      form.resetFields();
      message.success(t('settings.passwordChanged'));
    } catch (err) {
      message.error(apiErrorMessage(err, t('settings.passwordChangeFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} style={{ maxWidth: 420 }}>
      <Form.Item name="currentPassword" label={t('settings.currentPassword')} rules={[{ required: true }]}>
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Form.Item
        name="newPassword"
        label={t('settings.newPassword')}
        extra={t('settings.passwordRule')}
        rules={[{ required: true, min: 8, message: t('settings.passwordRule') }]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Form.Item
        name="confirm"
        label={t('settings.confirmPassword')}
        dependencies={['newPassword']}
        rules={[
          { required: true },
          ({ getFieldValue }) => ({
            validator: (_, value) =>
              !value || value === getFieldValue('newPassword')
                ? Promise.resolve()
                : Promise.reject(new Error(t('settings.passwordMismatch'))),
          }),
        ]}
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={busy}>
        {t('settings.changePassword')}
      </Button>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, marginTop: 16, marginBottom: 0 }}>
        {t('settings.forgotCurrent')} <Link to="/forgot-password">{t('settings.resetPasswordLink')}</Link>
      </Typography.Paragraph>
    </Form>
  );
};

export default ChangePasswordForm;
