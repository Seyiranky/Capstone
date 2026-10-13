import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Card, Empty, Flex, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, FlagOutlined, StopOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import ActionMenu from '../common/ActionMenu';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import { adminApi } from '../../api/adminApi';
import { reportApi, type UserReport } from '../../api/reportApi';
import { fromNow } from '../../lib/time';

/**
 * Reports users have made about each other, open ones first.
 *
 * Each closes as handled or dismissed, and the reporter is told which. A
 * suspension is offered beside them but is a separate decision.
 */
const AdminReports = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [reports, setReports] = useState<UserReport[] | null>(null);
  const load = () => reportApi.list().then(setReports);
  useEffect(() => {
    load();
  }, []);

  const resolve = async (r: UserReport, status: 'actioned' | 'dismissed', note?: string) => {
    await reportApi.resolve(r.id, status, note);
    message.success(t(status === 'actioned' ? 'trust.markedHandled' : 'trust.markedDismissed'));
    load();
  };

  return (
    <PageContainer title={t('trust.adminTitle')} subtitle={t('trust.adminSub')}>
      <Card loading={!reports} styles={{ body: { paddingBlock: reports?.length ? 4 : 24 } }}>
        {reports && reports.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('trust.noReports')} />
        ) : (
          reports?.map((r, i) => (
            <Flex
              key={r.id}
              justify="space-between"
              align="flex-start"
              gap={12}
              style={{ padding: '14px 0', borderTop: i ? '1px solid var(--isoko-border)' : undefined }}
            >
              <Flex gap={12} align="flex-start" style={{ minWidth: 0 }}>
                <span className="isoko-stat-icon">
                  <FlagOutlined />
                </span>
                <div style={{ minWidth: 0 }}>
                  <Flex gap={8} wrap="wrap" align="center">
                    {r.reportedUser && <IdentityLink id={r.reportedUser.id} name={r.reportedUser.name} size={22} />}
                    <Typography.Text strong>{t(`trust.reason.${r.reason}`)}</Typography.Text>
                    {r.timesReported > 1 && (
                      <span className="isoko-status isoko-status--warning">
                        {t('trust.timesReported', { count: r.timesReported })}
                      </span>
                    )}
                    {r.reportedUser?.status === 'suspended' && <StatusTag status="suspended" />}
                  </Flex>
                  {r.note && (
                    <Typography.Paragraph style={{ margin: '6px 0 0', fontSize: 13 }}>“{r.note}”</Typography.Paragraph>
                  )}
                  <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 4 }}>
                    {t('trust.reportedBy', { name: r.reporter?.name ?? '—' })} · {fromNow(r.createdAt)}
                    {r.resolutionNote ? ` · ${r.resolutionNote}` : ''}
                  </Typography.Text>
                </div>
              </Flex>
              {r.status === 'open' ? (
                <ActionMenu
                  size="small"
                  actions={[
                    {
                      key: 'handled',
                      label: t('trust.markHandled'),
                      icon: <CheckOutlined />,
                      confirmTitle: t('trust.markHandled'),
                      confirmBody: t('trust.handledBody'),
                      reason: { placeholder: t('trust.resolutionNote') },
                      onConfirm: (note) => resolve(r, 'actioned', note),
                    },
                    {
                      key: 'dismiss',
                      label: t('trust.dismiss'),
                      icon: <CloseOutlined />,
                      confirmTitle: t('trust.dismiss'),
                      confirmBody: t('trust.dismissBody'),
                      reason: { placeholder: t('trust.resolutionNote') },
                      onConfirm: (note) => resolve(r, 'dismissed', note),
                    },
                    ...(r.reportedUser && r.reportedUser.status !== 'suspended'
                      ? [
                          {
                            key: 'suspend',
                            label: t('trust.suspend', { name: r.reportedUser.name }),
                            icon: <StopOutlined />,
                            danger: true,
                            confirmTitle: t('trust.suspend', { name: r.reportedUser.name }),
                            confirmBody: t('trust.suspendBody'),
                            onConfirm: async () => {
                              await adminApi.moderateUser(r.reportedUser!.id, 'suspend');
                              await resolve(r, 'actioned', t('trust.suspendedNote'));
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              ) : (
                <StatusTag status={r.status === 'actioned' ? 'resolved' : 'dismissed'} />
              )}
            </Flex>
          ))
        )}
      </Card>
    </PageContainer>
  );
};

export default AdminReports;
