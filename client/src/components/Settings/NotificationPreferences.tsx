import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, App, Button, Radio, Space, Typography } from 'antd';
import { BellOutlined, MailOutlined, MessageOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchCurrentUser } from '../../store/slices/authSlice';
import { userApi } from '../../api/userApi';
import { authApi } from '../../api/authApi';
import type { PreferredChannel } from '../../types';

/**
 * How the user hears from us, beyond the in-app bell.
 *
 * Its own component rather than a section of ProfileEditor: that is one form
 * behind a submit button, and a preference should take effect when it is
 * chosen. A radio rather than switches because the choice is exclusive -- the
 * column behind it holds one value, and two toggles could describe states it
 * cannot store.
 */
const NotificationPreferences = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const { profile } = useAppSelector((state) => state.auth);

  const [saving, setSaving] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  const choice: PreferredChannel = profile?.preferredChannel ?? 'none';
  const verified = Boolean(profile?.emailVerifiedAt);

  const onChange = async (next: PreferredChannel) => {
    setSaving(true);
    try {
      await userApi.updateProfile({ preferredChannel: next });
      await dispatch(fetchCurrentUser());
      message.success(t('settings.saved'));
    } catch {
      // The radio reads from the store, so a failed save leaves the old value
      // on screen by itself -- there is nothing local to roll back.
      message.error(t('settings.notifications.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const sendLink = async () => {
    setSendingLink(true);
    try {
      const result = await authApi.sendVerificationEmail();
      if (result.verified) {
        await dispatch(fetchCurrentUser());
      }
      message.success(t('settings.notifications.verifySent'));
    } catch {
      message.error(t('settings.notifications.verifyFailed'));
    } finally {
      setSendingLink(false);
    }
  };

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t('settings.notifications.desc')}
      </Typography.Paragraph>

      <Radio.Group
        value={choice}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as PreferredChannel)}
      >
        <Space direction="vertical" size={12}>
          <Radio value="none">
            <Space size={8}>
              <BellOutlined />
              {t('settings.notifications.inAppOnly')}
            </Space>
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              {t('settings.notifications.inAppAlways')}
            </Typography.Paragraph>
          </Radio>

          <Radio value="email">
            <Space size={8}>
              <MailOutlined />
              {t('settings.notifications.emailLabel')}
            </Space>
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              {t('settings.notifications.emailHint')}
              {profile?.email ? ` ${t('settings.notifications.sentTo', { email: profile.email })}` : ''}
            </Typography.Paragraph>
          </Radio>

          {/* Shown rather than hidden: the choice is real and the shape is
              built, but SMS needs a paid gateway, so it is not offered yet.
              Anyone already on SMS keeps receiving it. */}
          <Radio value="sms" disabled={choice !== 'sms'}>
            <Space size={8}>
              <MessageOutlined />
              {t('settings.notifications.smsLabel')}
            </Space>
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              {t('settings.notifications.smsSoon')}
            </Typography.Paragraph>
          </Radio>
        </Space>
      </Radio.Group>

      {choice === 'email' && !verified && (
        <Alert
          type="warning"
          showIcon
          message={t('settings.notifications.verifyTitle')}
          description={t('settings.notifications.verifyPending')}
          action={
            <Button size="small" loading={sendingLink} onClick={sendLink}>
              {t('settings.notifications.verifyCta')}
            </Button>
          }
        />
      )}

      {choice === 'email' && verified && (
        <Alert type="success" showIcon message={t('settings.notifications.verifiedNotice')} />
      )}
    </Space>
  );
};

export default NotificationPreferences;
