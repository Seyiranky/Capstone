import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Typography } from 'antd';
import { AlertOutlined, CheckCircleFilled, LoginOutlined, LogoutOutlined, PhoneOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { safeVisitApi, type VisitStatus } from '../../api/safeVisitApi';
import { useAppSelector } from '../../store/hooks';

/** Best-effort position: a recent fix is fine, and it never holds the action up for long. */
const position = () =>
  new Promise<{ lat?: number; lng?: number }>((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { timeout: 3000, maximumAge: 60_000 },
    );
  });

const EMPTY: VisitStatus = { checkedIn: false, since: null, sos: null };
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Check in, check out and SOS for someone working on site. It is always shown
 * for a job in progress, even if its status cannot be loaded, so the SOS is
 * never missing when it is needed. After an SOS it follows the alert: sent,
 * seen by Isoko, closed; with 112 one tap away throughout.
 */
const SafeVisitBar = ({ matchId, active = true }: { matchId: string; active?: boolean }) => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const hasContact = Boolean(useAppSelector((s) => s.auth.profile?.trustedContactPhone));
  const [status, setStatus] = useState<VisitStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () => safeVisitApi.status(matchId).then(setStatus).catch(() => setStatus((s) => s ?? EMPTY)),
    [matchId],
  );
  useEffect(() => {
    load();
  }, [load]);

  const sos = status?.sos;
  const sosOpen = Boolean(sos && !sos.resolvedAt);
  // While an SOS is open, follow it so the worker sees when Isoko picks it up.
  useEffect(() => {
    if (!sosOpen) return;
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [sosOpen, load]);

  const call112 = (
    <Button danger icon={<PhoneOutlined />} href="tel:112">
      {t('safety.call112')}
    </Button>
  );

  const act = async (key: string, fn: (id: string, c: { lat?: number; lng?: number }) => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn(matchId, await position());
      message.success(done);
      await load();
    } catch (error) {
      const reason = isAxiosError(error) ? error.response?.data?.message : null;
      if (key === 'sos') {
        // An SOS that did not get through must say what to do instead.
        modal.error({ title: t('safety.sosFailedTitle'), content: reason ?? t('safety.sosFailedBody'), okText: t('safety.close'), footer: (_, { OkBtn }) => <Flex gap={8} justify="flex-end">{call112}<OkBtn /></Flex> });
      } else {
        message.error(reason ?? t('safety.failed'));
      }
    } finally {
      setBusy(null);
    }
  };

  const confirmSos = () =>
    modal.confirm({
      title: t('safety.sosTitle'),
      content: (
        <>
          <Typography.Paragraph style={{ marginBottom: 8 }}>{t('safety.sosBody')}</Typography.Paragraph>
          <Typography.Text strong>{t('safety.dangerNow')}</Typography.Text>
        </>
      ),
      okText: t('safety.sosConfirm'),
      okButtonProps: { danger: true },
      footer: (_, { OkBtn, CancelBtn }) => (
        <Flex gap={8} justify="flex-end" wrap="wrap">
          {call112}
          <CancelBtn />
          <OkBtn />
        </Flex>
      ),
      onOk: () => act('sos', safeVisitApi.sos, t('safety.sosSent')),
    });

  const shown = status ?? EMPTY;
  // A closed job keeps the bar only while someone is still checked in or an SOS is open.
  if (!active && !shown.checkedIn && !sosOpen) return null;

  return (
    <div className={`isoko-visit${sosOpen ? ' isoko-visit--sos' : ''}`}>
      {sosOpen && sos ? (
        <div className="isoko-visit__sos">
          <Typography.Text strong style={{ display: 'block' }}>
            <AlertOutlined /> {t('safety.sosSentAt', { time: time(sos.at) })}
          </Typography.Text>
          <ul className="isoko-visit__steps">
            <li className="is-done">
              <CheckCircleFilled /> {t('safety.stepAdmins')}
            </li>
            <li className={sos.contactNotified ? 'is-done' : 'is-missed'}>
              <CheckCircleFilled /> {sos.contactNotified ? t('safety.stepContact') : t('safety.stepNoContact')}
            </li>
            <li className={sos.acknowledgedAt ? 'is-done' : 'is-waiting'}>
              <CheckCircleFilled />{' '}
              {sos.acknowledgedAt ? t('safety.stepSeen', { time: time(sos.acknowledgedAt) }) : t('safety.stepWaiting')}
            </li>
          </ul>
          <Flex gap={8} wrap="wrap" style={{ marginTop: 10 }}>
            {call112}
            <Button loading={busy === 'sos'} onClick={() => act('sos', safeVisitApi.sos, t('safety.sosResent'))}>
              {t('safety.sendAgain')}
            </Button>
          </Flex>
        </div>
      ) : null}

      <Flex justify="space-between" align="center" gap={8} wrap="wrap">
        <Typography.Text style={{ fontSize: 13 }}>
          {shown.checkedIn && shown.since ? t('safety.checkedInSince', { time: time(shown.since) }) : t('safety.safeVisit')}
        </Typography.Text>
        <Flex gap={6}>
          {shown.checkedIn ? (
            <Button size="small" icon={<LogoutOutlined />} loading={busy === 'out'} onClick={() => act('out', safeVisitApi.checkOut, t('safety.checkedOut'))}>
              {t('safety.checkOut')}
            </Button>
          ) : (
            active && (
              <Button size="small" icon={<LoginOutlined />} loading={busy === 'in'} onClick={() => act('in', safeVisitApi.checkIn, t('safety.checkedIn'))}>
                {t('safety.checkIn')}
              </Button>
            )
          )}
          {!sosOpen && (
            <Button size="small" type="primary" danger icon={<AlertOutlined />} loading={busy === 'sos'} onClick={confirmSos}>
              SOS
            </Button>
          )}
        </Flex>
      </Flex>
      {!hasContact && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
          {t('safety.noContact')} <Link to="/settings?tab=safety">{t('safety.addContact')}</Link>
        </Typography.Text>
      )}
    </div>
  );
};

export default SafeVisitBar;
