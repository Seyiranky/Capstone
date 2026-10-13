import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Card, Empty, Flex, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, MedicineBoxOutlined } from '@ant-design/icons';
import PageContainer from '../Layout/PageContainer';
import ActionMenu from '../common/ActionMenu';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import { coverApi, type CoverClaim } from '../../api/coverApi';
import { fromNow } from '../../lib/time';

/** Job Cover claims, waiting ones first. The insurer is simulated; the decision is an admin's. */
const AdminCover = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [claims, setClaims] = useState<CoverClaim[] | null>(null);
  const load = () => coverApi.list().then(setClaims);
  useEffect(() => {
    load();
  }, []);

  const decide = async (c: CoverClaim, status: 'approved' | 'declined', note?: string) => {
    await coverApi.decide(c.id, { status, note });
    message.success(t(status === 'approved' ? 'cover.approvedMsg' : 'cover.declinedMsg'));
    load();
  };

  return (
    <PageContainer title={t('cover.adminTitle')} subtitle={t('cover.adminSub')}>
      <Card loading={!claims} styles={{ body: { paddingBlock: claims?.length ? 4 : 24 } }}>
        {claims && claims.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('cover.noClaims')} />
        ) : (
          claims?.map((c, i) => (
            <Flex
              key={c.id}
              justify="space-between"
              align="flex-start"
              gap={12}
              style={{ padding: '14px 0', borderTop: i ? '1px solid var(--isoko-border)' : undefined }}
            >
              <Flex gap={12} align="flex-start" style={{ minWidth: 0 }}>
                <span className="isoko-stat-icon">
                  <MedicineBoxOutlined />
                </span>
                <div style={{ minWidth: 0 }}>
                  <Flex gap={8} wrap="wrap" align="center">
                    {c.user && <IdentityLink id={c.user.id} name={c.user.name} size={22} />}
                    <Typography.Text strong>{c.amountRequested.toLocaleString()} RWF</Typography.Text>
                    <StatusTag status={c.status === 'submitted' ? 'pending' : c.status} />
                  </Flex>
                  <Typography.Paragraph style={{ margin: '6px 0 0', fontSize: 13 }}>{c.description}</Typography.Paragraph>
                  <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginTop: 4 }}>
                    {c.match?.gig ? <Link to={`/gigs/${c.match.gig.id}`}>{c.match.gig.title}</Link> : '—'}
                    {' · '}
                    {c.transaction?.coverPolicyNumber}
                    {' · '}
                    {fromNow(c.createdAt)}
                    {c.decisionNote ? ` · ${c.decisionNote}` : ''}
                  </Typography.Text>
                </div>
              </Flex>
              {c.status === 'submitted' && (
                <ActionMenu
                  size="small"
                  actions={[
                    {
                      key: 'approve',
                      label: t('cover.approve'),
                      icon: <CheckOutlined />,
                      confirmTitle: t('cover.approve'),
                      confirmBody: t('cover.approveBody', { amount: c.amountRequested.toLocaleString() }),
                      reason: { placeholder: t('cover.noteHint') },
                      onConfirm: (note) => decide(c, 'approved', note),
                    },
                    {
                      key: 'decline',
                      label: t('cover.decline'),
                      icon: <CloseOutlined />,
                      danger: true,
                      confirmTitle: t('cover.decline'),
                      confirmBody: t('cover.declineBody'),
                      reason: { placeholder: t('cover.declineHint'), required: true },
                      onConfirm: (note) => decide(c, 'declined', note),
                    },
                  ]}
                />
              )}
            </Flex>
          ))
        )}
      </Card>
    </PageContainer>
  );
};

export default AdminCover;
