import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Form, Input, Result, Select, Skeleton, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import LanguageToggle from '../components/common/LanguageToggle';
import RequesterTicketView from '../components/Support/RequesterTicketView';
import { CategoryIcon } from '../components/Support/supportUi';
import { SUPPORT_CATEGORIES, browserContext, supportApi, type SupportCategory, type SupportTicketDetail } from '../api/supportApi';
import logo from '../assets/logo.png';

const Frame = ({ children, wide }: { children: React.ReactNode; wide?: boolean }) => (
  <div className="isoko-guest-support">
    <div className="isoko-guest-support__top">
      <Link to="/login">
        <img src={logo} alt="Isoko" style={{ height: 44, display: 'block' }} />
      </Link>
      <LanguageToggle />
    </div>
    <div style={{ width: '100%', maxWidth: wide ? 820 : 520, margin: '0 auto' }}>{children}</div>
  </div>
);

/** "Can't sign in?": a request by email, for someone who cannot reach their account. */
export const GuestContactPage = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (v: { name: string; email: string; category: SupportCategory; subject?: string; body: string; website?: string }) => {
    setBusy(true);
    try {
      const { number } = await supportApi.guestCreate({ ...v, subject: v.subject ?? '', context: browserContext('/support/contact') });
      setSent(number);
    } catch (err) {
      message.error((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? t('support.failed'));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Frame>
        <Result
          icon={<CheckCircleFilled style={{ color: '#16a34a' }} />}
          title={t('support.guestSent', { number: sent })}
          subTitle={t('support.guestSentBody')}
          extra={<Link to="/login"><Button type="primary">{t('support.backToLogin')}</Button></Link>}
        />
      </Frame>
    );
  }

  return (
    <Frame>
      <Typography.Title level={3} style={{ marginBottom: 4 }}>{t('support.guestTitle')}</Typography.Title>
      <Typography.Paragraph type="secondary">{t('support.guestSubtitle')}</Typography.Paragraph>
      <Form layout="vertical" requiredMark={false} onFinish={submit} initialValues={{ category: 'account' }}>
        <Flex gap={12} wrap="wrap">
          <Form.Item name="name" label={t('support.name')} rules={[{ required: true }]} style={{ flex: '1 1 200px' }}>
            <Input autoComplete="name" maxLength={80} />
          </Form.Item>
          <Form.Item name="email" label={t('support.email')} extra={t('support.emailHint')} rules={[{ required: true, type: 'email' }]} style={{ flex: '1 1 200px' }}>
            <Input autoComplete="email" maxLength={160} />
          </Form.Item>
        </Flex>
        <Form.Item name="category" label={t('support.topic')}>
          <Select
            options={SUPPORT_CATEGORIES.map((c) => ({
              value: c,
              label: (
                <Flex align="center" gap={8}>
                  <CategoryIcon category={c} size={20} />
                  {t(`support.cat_${c}`)}
                </Flex>
              ),
            }))}
          />
        </Form.Item>
        <Form.Item name="subject" label={t('support.subject')}>
          <Input maxLength={140} placeholder={t('support.subjectPlaceholder')} />
        </Form.Item>
        <Form.Item name="body" label={t('support.message')} rules={[{ required: true, min: 10, message: t('support.messageTooShort') }]}>
          <Input.TextArea rows={5} maxLength={4000} showCount placeholder={t('support.messagePlaceholder')} />
        </Form.Item>
        {/* Left empty by people; bots fill it in. Hidden from view and from screen readers. */}
        <Form.Item name="website" hidden>
          <Input tabIndex={-1} autoComplete="off" aria-hidden />
        </Form.Item>
        <Flex justify="space-between" align="center" gap={12}>
          <Link to="/login">{t('support.backToLogin')}</Link>
          <Button type="primary" htmlType="submit" loading={busy}>{t('support.send')}</Button>
        </Flex>
      </Form>
    </Frame>
  );
};

/** The private link from the email: follow and answer the request without signing in. */
export const GuestTicketPage = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!token) return;
    supportApi.guestGet(token).then(setTicket).catch(() => setInvalid(true));
  }, [token]);

  if (invalid) {
    return (
      <Frame>
        <Result status="warning" title={t('support.guestInvalid')} extra={<Link to="/support/contact"><Button>{t('support.contactUs')}</Button></Link>} />
      </Frame>
    );
  }
  return (
    <Frame wide>
      <Typography.Title level={4} style={{ marginBottom: 12 }}>{t('support.guestThreadTitle')}</Typography.Title>
      {!ticket ? (
        <Skeleton active />
      ) : (
        <RequesterTicketView
          ticket={ticket}
          requesterName={ticket.guestName ?? ''}
          onReply={async (body, file) => setTicket(await supportApi.guestReply(token!, body, file))}
        />
      )}
    </Frame>
  );
};
