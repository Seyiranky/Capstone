import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Modal, Typography } from 'antd';
import { AlertOutlined, LoginOutlined, LogoutOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { safeVisitApi } from '../../api/safeVisitApi';
import { useAppSelector } from '../../store/hooks';

/** Best-effort position for an SOS or check-in; never blocks the action. */
const position = () =>
  new Promise<{ lat?: number; lng?: number }>((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { timeout: 4000 },
    );
  });

/**
 * Check in, check out and SOS for the worker on an on-site job. The trusted
 * contact is texted at each step; without one, the bar says so and links to
 * Settings.
 */
const SafeVisitBar = ({ matchId }: { matchId: string }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const hasContact = Boolean(useAppSelector((s) => s.auth.profile?.trustedContactPhone));
  const [status, setStatus] = useState<{ checkedIn: boolean; since: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => safeVisitApi.status(matchId).then(setStatus).catch(() => undefined);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const act = async (fn: (id: string, coords: { lat?: number; lng?: number }) => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn(matchId, await position());
      message.success(done);
      await load();
    } catch (error) {
      message.error(isAxiosError(error) ? (error.response?.data?.message ?? 'Something went wrong') : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <div style={{ border: '1px solid var(--isoko-border)', borderRadius: 6, padding: 10, marginBottom: 10 }}>
      <Flex justify="space-between" align="center" gap={8} wrap="wrap">
        <Typography.Text style={{ fontSize: 13 }}>
          {status.checkedIn
            ? t('safety.checkedInSince', { time: new Date(status.since as string).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
            : t('safety.safeVisit')}
        </Typography.Text>
        <Flex gap={6}>
          {status.checkedIn ? (
            <Button size="small" icon={<LogoutOutlined />} loading={busy} onClick={() => act(safeVisitApi.checkOut, t('safety.checkedOut'))}>
              {t('safety.checkOut')}
            </Button>
          ) : (
            <Button size="small" icon={<LoginOutlined />} loading={busy} onClick={() => act(safeVisitApi.checkIn, t('safety.checkedIn'))}>
              {t('safety.checkIn')}
            </Button>
          )}
          <Button
            size="small"
            danger
            icon={<AlertOutlined />}
            onClick={() =>
              Modal.confirm({
                title: t('safety.sosTitle'),
                content: t('safety.sosBody'),
                okText: t('safety.sosConfirm'),
                okButtonProps: { danger: true },
                onOk: () => act(safeVisitApi.sos, t('safety.sosSent')),
              })
            }
          >
            SOS
          </Button>
        </Flex>
      </Flex>
      {!hasContact && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
          {t('safety.noContact')} <Link to="/settings">{t('safety.addContact')}</Link>
        </Typography.Text>
      )}
    </div>
  );
};

export default SafeVisitBar;
