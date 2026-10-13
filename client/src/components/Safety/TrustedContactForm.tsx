import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Form, Input, Typography } from 'antd';
import { isAxiosError } from 'axios';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { userApi } from '../../api/userApi';
import { fetchCurrentUser } from '../../store/slices/authSlice';

/** Who is texted when the worker arrives at a job, leaves it, or raises an SOS. */
const TrustedContactForm = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => s.auth.profile);
  const [saving, setSaving] = useState(false);

  const save = async (values: { trustedContactName?: string; trustedContactPhone?: string }) => {
    setSaving(true);
    try {
      await userApi.updateProfile(values);
      await dispatch(fetchCurrentUser());
      message.success(t('safety.saved'));
    } catch (error) {
      message.error(isAxiosError(error) ? (error.response?.data?.message ?? 'Could not save') : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Typography.Paragraph type="secondary">{t('safety.contactHelp')}</Typography.Paragraph>
      <Form
        layout="vertical"
        requiredMark={false}
        initialValues={{
          trustedContactName: profile?.trustedContactName ?? '',
          trustedContactPhone: profile?.trustedContactPhone ?? '',
        }}
        onFinish={save}
        style={{ maxWidth: 420 }}
      >
        <Form.Item name="trustedContactName" label={t('safety.contactName')}>
          <Input placeholder={t('safety.contactNamePlaceholder')} />
        </Form.Item>
        <Form.Item name="trustedContactPhone" label={t('safety.contactPhone')} extra={t('safety.contactPhoneHelp')}>
          <Input placeholder="078 123 4567" inputMode="tel" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>
          {t('safety.save')}
        </Button>
      </Form>
    </>
  );
};

export default TrustedContactForm;
