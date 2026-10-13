import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Card, Empty, Flex, Typography } from 'antd';
import { AlertOutlined, ClockCircleOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import { safeVisitApi, type SafetyAlert } from '../../api/safeVisitApi';
import { fromNow } from '../../lib/time';

/** SOS and overdue-visit alerts, open ones first, each marked handled by an admin. */
const AdminSafety = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [alerts, setAlerts] = useState<SafetyAlert[] | null>(null);
  const load = () => safeVisitApi.alerts().then(setAlerts);
  useEffect(() => {
    load();
  }, []);

  return (
    <PageContainer title={t('safety.adminTitle')} subtitle={t('safety.adminSub')}>
      <Card loading={!alerts} styles={{ body: { paddingBlock: alerts?.length ? 4 : 24 } }}>
        {alerts && alerts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('safety.noAlerts')} />
        ) : (
          alerts?.map((a, i) => (
            <Flex
              key={a.id}
              justify="space-between"
              align="center"
              gap={12}
              wrap="wrap"
              style={{ padding: '14px 0', borderTop: i ? '1px solid var(--isoko-border)' : undefined }}
            >
              <Flex gap={12} align="flex-start" style={{ minWidth: 0 }}>
                <span className="isoko-stat-icon" style={{ color: a.kind === 'sos' ? '#dc2626' : undefined }}>
                  {a.kind === 'sos' ? <AlertOutlined /> : <ClockCircleOutlined />}
                </span>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong style={{ display: 'block' }}>
                    {a.kind === 'sos' ? t('safety.sosAlert') : t('safety.overdueAlert')}
                    {' · '}
                    {a.match?.gig ? <Link to={`/gigs/${a.match.gig.id}`}>{a.match.gig.title}</Link> : '—'}
                  </Typography.Text>
                  <Flex gap={10} wrap="wrap" align="center" style={{ marginTop: 4 }}>
                    {a.user && <IdentityLink id={a.user.id} name={a.user.name} size={20} />}
                    <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                      {fromNow(a.createdAt)}
                      {' · '}
                      {a.contactNotified ? t('safety.contactTexted') : t('safety.contactNotTexted')}
                      {a.lat != null && (
                        <>
                          {' · '}
                          <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer">
                            {t('safety.map')}
                          </a>
                        </>
                      )}
                    </Typography.Text>
                  </Flex>
                </div>
              </Flex>
              {a.resolvedAt ? (
                <StatusTag status="resolved" />
              ) : (
                <Button
                  size="small"
                  onClick={async () => {
                    await safeVisitApi.resolve(a.id);
                    message.success(t('safety.resolved'));
                    load();
                  }}
                >
                  {t('safety.markHandled')}
                </Button>
              )}
            </Flex>
          ))
        )}
      </Card>
    </PageContainer>
  );
};

export default AdminSafety;
