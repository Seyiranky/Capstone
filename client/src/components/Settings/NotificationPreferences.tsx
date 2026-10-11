import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { Alert, App, Button, Card, Flex, Input, Radio, Space, Typography } from 'antd';
import { BellOutlined, MailOutlined, MessageOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchCurrentUser } from '../../store/slices/authSlice';
import { userApi } from '../../api/userApi';
import { authApi } from '../../api/authApi';
import type { PreferredChannel } from '../../types';

// The sender name texts arrive from. Pindo's shared test sender until "Isoko"
// is registered with RURA and the networks; the server's SMS_SENDER_ID is the
// one that actually decides it, this only has to describe it.
const SMS_SENDER = import.meta.env.VITE_SMS_SENDER_NAME || 'PindoTest';

// MTN 078/079 and Airtel 072/073 -- the same rule the server applies.
const LOCAL_MOBILE = /^7[2389]\d{7}$/;

/** "+250788123456" or "0788 123 456" -> "788123456", for the input after "+250". */
const localDigits = (phone?: string | null) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('250')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
};

/**
 * "+250788123456" -> "+250 78• ••• 456": enough to recognise, not to copy.
 * Non-breaking spaces, so a narrow screen never splits the number in two.
 */
const maskPhone = (phone?: string | null) => {
  const local = localDigits(phone);
  return local.length === 9
    ? `+250\u00A0${local.slice(0, 2)}•\u00A0•••\u00A0${local.slice(6)}`
    : (phone ?? '');
};

/**
 * How the user hears from us, beyond the in-app bell.
 *
 * Its own component rather than a section of ProfileEditor: that is one form
 * behind a submit button, and a preference should take effect when it is
 * chosen. A radio rather than switches because the choice is exclusive -- the
 * column behind it holds one value, and two toggles could describe states it
 * cannot store.
 *
 * Choosing SMS before the number is confirmed opens the number-and-code step in
 * place instead of saving: the server refuses SMS for an unconfirmed number,
 * and a radio that showed SMS while nothing could be sent would be a lie.
 */
const NotificationPreferences = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const dispatch = useAppDispatch();
  const { profile } = useAppSelector((state) => state.auth);

  const [saving, setSaving] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);

  // The SMS step, open while the user is adding or changing a number.
  const [smsSetup, setSmsSetup] = useState(false);
  const [phone, setPhone] = useState(localDigits(profile?.phone));
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const choice: PreferredChannel = profile?.preferredChannel ?? 'none';
  const verified = Boolean(profile?.emailVerifiedAt);
  const phoneVerified = Boolean(profile?.phoneVerifiedAt);
  const phoneValid = LOCAL_MOBILE.test(phone);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const save = async (next: PreferredChannel) => {
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

  const openSmsSetup = () => {
    setSmsSetup(true);
    setCodeSentTo(null);
    setCode('');
    setCodeError(null);
  };

  const onChange = (next: PreferredChannel) => {
    if (next === 'sms' && !phoneVerified) {
      openSmsSetup();
      return;
    }
    setSmsSetup(false);
    void save(next);
  };

  const sendCode = async () => {
    setSendingCode(true);
    setCodeError(null);
    try {
      const result = await authApi.sendPhoneCode({ phone: `+250${phone}` });
      if (result.verified) {
        // Already confirmed for this number: nothing to type, just choose SMS.
        setSmsSetup(false);
        await save('sms');
        return;
      }
      setCodeSentTo(result.phone ?? `+250${phone}`);
      setCode('');
      setCooldown(result.retryAfter ?? 60);
      await dispatch(fetchCurrentUser());
    } catch (error) {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      if (status === 429) {
        setCooldown(Number(isAxiosError(error) && error.response?.data?.retryAfter) || 60);
      } else {
        message.error(
          t(
            status === 400
              ? 'settings.notifications.smsPhoneInvalid'
              : 'settings.notifications.smsSendFailed',
          ),
        );
      }
    } finally {
      setSendingCode(false);
    }
  };

  const confirmCode = async (value = code) => {
    if (!/^\d{6}$/.test(value)) return;
    setConfirming(true);
    setCodeError(null);
    try {
      await authApi.verifyPhone({ code: value });
      setSmsSetup(false);
      await save('sms');
    } catch (error) {
      const data = isAxiosError(error) ? error.response?.data : undefined;
      setCode('');
      if (data?.expired) {
        setCodeError(t('settings.notifications.smsCodeExpired'));
      } else if (typeof data?.attemptsLeft === 'number') {
        setCodeError(
          t('settings.notifications.smsCodeWrong', {
            count: data.attemptsLeft,
          }),
        );
      } else {
        setCodeError(t('settings.notifications.saveFailed'));
      }
    } finally {
      setConfirming(false);
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
        value={smsSetup ? 'sms' : choice}
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
              {profile?.email
                ? ` ${t('settings.notifications.sentTo', { email: profile.email })}`
                : ''}
            </Typography.Paragraph>
          </Radio>

          <Radio value="sms">
            <Space size={8}>
              <MessageOutlined />
              {t('settings.notifications.smsLabel')}
            </Space>
            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
              {t('settings.notifications.smsHint')}
              {phoneVerified && profile?.phone
                ? ` ${t('settings.notifications.smsSentTo', { phone: maskPhone(profile.phone) })}`
                : ''}
            </Typography.Paragraph>
          </Radio>
        </Space>
      </Radio.Group>

      {smsSetup && (
        <Card size="small" title={t('settings.notifications.smsSetupTitle')}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Text style={{ fontSize: 13 }}>
                {t('settings.notifications.smsPhoneLabel')}
              </Typography.Text>
              <Flex gap={8} wrap="wrap" style={{ marginTop: 4 }}>
                <Input
                  addonBefore="+250"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="78X XXX XXX"
                  value={phone}
                  maxLength={12}
                  onChange={(e) => setPhone(localDigits(e.target.value).slice(0, 9))}
                  status={phone && !phoneValid ? 'error' : undefined}
                  style={{ flex: '1 1 200px', maxWidth: 280 }}
                />
                <Button
                  onClick={sendCode}
                  loading={sendingCode}
                  disabled={!phoneValid || cooldown > 0}
                >
                  {cooldown > 0
                    ? t('settings.notifications.smsResendIn', {
                        seconds: cooldown,
                      })
                    : t('settings.notifications.smsSendCode')}
                </Button>
              </Flex>
              {phone && !phoneValid && (
                <Typography.Text type="danger" style={{ fontSize: 12 }}>
                  {t('settings.notifications.smsPhoneInvalid')}
                </Typography.Text>
              )}
            </div>

            {codeSentTo && (
              <div>
                <Typography.Paragraph style={{ margin: 0, fontSize: 13 }}>
                  {t('settings.notifications.smsCodeSent', {
                    phone: maskPhone(codeSentTo),
                  })}
                </Typography.Paragraph>
                <Typography.Text style={{ fontSize: 13 }}>
                  {t('settings.notifications.smsCodeLabel')}
                </Typography.Text>
                <Flex gap={8} wrap="wrap" align="center" style={{ marginTop: 4 }}>
                  <Input.OTP
                    length={6}
                    value={code}
                    disabled={confirming}
                    onChange={(value) => {
                      setCode(value);
                      void confirmCode(value);
                    }}
                  />
                  <Button
                    type="primary"
                    loading={confirming}
                    disabled={code.length !== 6}
                    onClick={() => confirmCode()}
                  >
                    {t('settings.notifications.smsConfirm')}
                  </Button>
                </Flex>
                {codeError && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {codeError}
                  </Typography.Text>
                )}
              </div>
            )}

            <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
              {t('settings.notifications.smsConsent')}{' '}
              {t('settings.notifications.smsSender', { sender: SMS_SENDER })}
            </Typography.Paragraph>

            <div>
              <Button
                size="small"
                type="text"
                onClick={() => setSmsSetup(false)}
                style={{ paddingInline: 0 }}
              >
                {t('settings.notifications.smsCancel')}
              </Button>
            </div>
          </Space>
        </Card>
      )}

      {choice === 'sms' && phoneVerified && !smsSetup && (
        <Alert
          type="success"
          showIcon
          message={t('settings.notifications.smsVerifiedNotice', {
            phone: maskPhone(profile?.phone),
          })}
          description={
            // The button sits under the text rather than in `action`, which on a
            // phone squeezes the message into a column a few words wide.
            <Space direction="vertical" size={8}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('settings.notifications.smsSender', { sender: SMS_SENDER })}
              </Typography.Text>
              <Button size="small" onClick={openSmsSetup}>
                {t('settings.notifications.smsChangeNumber')}
              </Button>
            </Space>
          }
        />
      )}

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
