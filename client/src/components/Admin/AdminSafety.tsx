import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Card, Empty, Flex, Input, Modal, Segmented, Skeleton, Typography } from 'antd';
import { AlertOutlined, ClockCircleOutlined, EnvironmentOutlined, PhoneOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import { safeVisitApi, type SafetyAlert } from '../../api/safeVisitApi';
import { apiErrorMessage } from '../../utils/apiError';
import { fromNow } from '../../lib/time';

const at = (iso: string) => new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** One person to reach: a name, a role, and a number to tap. */
const Contact = ({ role, name, phone }: { role: string; name?: string | null; phone?: string | null }) => (
  <div className="isoko-alert-contact">
    <span className="isoko-alert-contact__role">{role}</span>
    <span className="isoko-alert-contact__name">{name || '—'}</span>
    {phone ? (
      <a className="isoko-alert-contact__call" href={`tel:${phone}`}>
        <PhoneOutlined /> {phone}
      </a>
    ) : (
      <span className="isoko-alert-contact__none">no number</span>
    )}
  </div>
);

/**
 * SOS and overdue-visit alerts. Each one shows everyone to call and where the
 * job is; an admin says "I'm on it" (the worker is told) and closes it with a
 * note of what was done. The page refreshes itself, open alerts first.
 */
const AdminSafety = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [alerts, setAlerts] = useState<SafetyAlert[] | null>(null);
  const [view, setView] = useState<'open' | 'all'>('open');
  const [closing, setClosing] = useState<SafetyAlert | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => safeVisitApi.alerts().then(setAlerts).catch(() => setAlerts((a) => a ?? [])), []);
  useEffect(() => {
    load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      message.success(done);
      await load();
      return true;
    } catch (err) {
      message.error(apiErrorMessage(err, t('safety.failed')));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const shown = (alerts ?? []).filter((a) => view === 'all' || !a.resolvedAt);
  const openCount = (alerts ?? []).filter((a) => !a.resolvedAt).length;

  return (
    <PageContainer title={t('safety.adminTitle')} subtitle={t('safety.adminSub')}>
      <Segmented
        value={view}
        onChange={(v) => setView(v as 'open' | 'all')}
        style={{ marginBottom: 16 }}
        options={[
          { value: 'open', label: `${t('safety.viewOpen')} (${openCount})` },
          { value: 'all', label: t('safety.viewAll') },
        ]}
      />
      {!alerts ? (
        <Card>
          <Skeleton active />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={view === 'open' ? t('safety.noOpenAlerts') : t('safety.noAlerts')} />
        </Card>
      ) : (
        <Flex vertical gap={14}>
          {shown.map((a) => {
            const sos = a.kind === 'sos';
            const state = a.resolvedAt ? 'closed' : a.acknowledgedAt ? 'picked' : 'new';
            return (
              <Card key={a.id} className={`isoko-alert isoko-alert--${sos ? 'sos' : 'overdue'} isoko-alert--${state}`} styles={{ body: { padding: 0 } }}>
                <div className="isoko-alert__head">
                  <span className="isoko-alert__icon">{sos ? <AlertOutlined /> : <ClockCircleOutlined />}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Typography.Text strong style={{ display: 'block', fontSize: 15 }}>
                      {sos ? t('safety.sosAlert') : t('safety.overdueAlert')} · {a.user?.name ?? '—'}
                    </Typography.Text>
                    <span className="isoko-alert__meta">
                      {at(a.createdAt)} ({fromNow(a.createdAt)})
                      {' · '}
                      {a.match?.gig ? <Link to={`/gigs/${a.match.gig.id}`}>{a.match.gig.title}</Link> : '—'}
                      {a.area ? ` · ${a.area}` : ''}
                    </span>
                  </div>
                  <span className={`isoko-alert__state isoko-alert__state--${state}`}>
                    {state === 'new' ? t('safety.stateNew') : state === 'picked' ? t('safety.statePicked', { name: a.acknowledger?.name ?? '' }) : t('safety.stateClosed')}
                  </span>
                </div>

                <div className="isoko-alert__body">
                  <div className="isoko-alert__people">
                    <Contact role={t('safety.roleWorker')} name={a.user?.name} phone={a.user?.phone} />
                    <Contact role={t('safety.roleContact')} name={a.user?.trustedContactName} phone={a.user?.trustedContactPhone} />
                    <Contact role={t('safety.roleClient')} name={a.client?.name} phone={a.client?.phone} />
                  </div>
                  <div className="isoko-alert__facts">
                    <span>{a.contactNotified ? t('safety.contactTexted') : t('safety.contactNotTexted')}</span>
                    {a.checkedInSince && <span>{t('safety.checkedInAt', { time: at(a.checkedInSince) })}</span>}
                    {a.lat != null && a.lng != null ? (
                      <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer">
                        <EnvironmentOutlined /> {t('safety.openMap')}
                      </a>
                    ) : (
                      <span>{t('safety.noLocation')}</span>
                    )}
                  </div>
                  {a.resolvedAt && (
                    <div className="isoko-alert__closed">
                      <strong>{t('safety.closedBy', { name: a.resolver?.name ?? '', time: at(a.resolvedAt) })}</strong>
                      {a.resolutionNote && <p>{a.resolutionNote}</p>}
                    </div>
                  )}
                </div>

                {!a.resolvedAt && (
                  <Flex gap={8} justify="flex-end" wrap="wrap" className="isoko-alert__actions">
                    {!a.acknowledgedAt && (
                      <Button
                        type="primary"
                        danger={sos}
                        loading={busy === `ack-${a.id}`}
                        onClick={() => run(`ack-${a.id}`, () => safeVisitApi.acknowledge(a.id), t('safety.acknowledged'))}
                      >
                        {t('safety.onIt')}
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        setNote('');
                        setClosing(a);
                      }}
                    >
                      {t('safety.closeWithNote')}
                    </Button>
                  </Flex>
                )}
              </Card>
            );
          })}
        </Flex>
      )}

      <Modal
        open={Boolean(closing)}
        title={t('safety.closeTitle')}
        okText={t('safety.closeAlert')}
        okButtonProps={{ disabled: note.trim().length < 3, loading: Boolean(busy?.startsWith('close')) }}
        onCancel={() => setClosing(null)}
        onOk={async () => {
          if (!closing) return;
          const ok = await run(`close-${closing.id}`, () => safeVisitApi.resolve(closing.id, note.trim()), t('safety.resolved'));
          if (ok) setClosing(null);
        }}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('safety.closeHelp')}
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('safety.closePlaceholder')}
        />
      </Modal>
    </PageContainer>
  );
};

export default AdminSafety;
