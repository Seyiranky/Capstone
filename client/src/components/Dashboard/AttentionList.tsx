import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Empty, Flex, Typography } from 'antd';
import {
  BellOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  KeyOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { Match, Role } from '../../types';

interface Item {
  key: string;
  icon: React.ReactNode;
  title: string;
  detail: string;
  to: string;
}

/**
 * What the user should do next, worked out from their matches: answer an
 * invitation, pay into escrow, hand over or enter a code, release payment, join
 * a team, leave a review. Ordered by urgency, so the top line is the next step.
 */
const AttentionList = ({ matches, role, userId }: { matches: Match[]; role: Role; userId: string }) => {
  const { t } = useTranslation();
  const items: Item[] = [];
  const toMatches = '/marketplace?tab=matches';

  for (const m of matches) {
    const title = m.gig?.title ?? 'Job';
    const tx = m.transaction;
    const held = tx?.status === 'confirmed' && tx.escrowStatus === 'held';
    const reviewed = m.reviews?.some((r) => r.authorId === userId);
    const isLead = m.workerId === userId;
    const invite = m.members?.find((x) => x.userId === userId && x.status === 'invited');

    if (role === 'worker') {
      if (invite && m.status === 'accepted') {
        items.push({ key: `team-${m.id}`, icon: <TeamOutlined />, title: t('attention.teamInvite', { title }), detail: t('attention.teamInviteDetail', { percent: invite.sharePercent }), to: toMatches });
      } else if (isLead && m.status === 'pending') {
        items.push({ key: `inv-${m.id}`, icon: <BellOutlined />, title: t('attention.invitation', { title }), detail: t('attention.invitationDetail'), to: toMatches });
      } else if (isLead && m.status === 'accepted' && held) {
        items.push({ key: `code-${m.id}`, icon: <KeyOutlined />, title: t('attention.inProgress', { title }), detail: t('attention.enterCode'), to: toMatches });
      } else if (isLead && m.status === 'accepted') {
        items.push({ key: `wait-${m.id}`, icon: <DollarOutlined />, title: t('attention.awaitingFunds', { title }), detail: t('attention.awaitingFundsDetail'), to: toMatches });
      } else if (isLead && m.status === 'completed' && !reviewed) {
        items.push({ key: `rev-${m.id}`, icon: <StarOutlined />, title: t('attention.review', { title }), detail: t('attention.reviewDetailWorker'), to: toMatches });
      }
    }
    if (role === 'client') {
      if (m.status === 'accepted' && tx?.status === 'initiated') {
        items.push({ key: `fund-${m.id}`, icon: <DollarOutlined />, title: t('attention.fund', { title }), detail: t('attention.fundDetail', { amount: Number(tx.amount).toLocaleString() }), to: toMatches });
      } else if (m.status === 'accepted' && held && m.workDoneAt) {
        items.push({ key: `rel-${m.id}`, icon: <CheckCircleOutlined />, title: t('attention.release', { title }), detail: t('attention.releaseDetail'), to: toMatches });
      } else if (m.status === 'accepted' && held) {
        items.push({ key: `code-${m.id}`, icon: <KeyOutlined />, title: t('attention.inProgress', { title }), detail: t('attention.handCode', { code: m.completionCode ?? '' }), to: toMatches });
      } else if (m.status === 'completed' && !reviewed) {
        items.push({ key: `rev-${m.id}`, icon: <StarOutlined />, title: t('attention.review', { title }), detail: t('attention.reviewDetailClient'), to: toMatches });
      }
    }
  }

  return (
    <Card
      title={t('attention.title')}
      extra={items.length > 0 ? <Typography.Text type="secondary">{items.length}</Typography.Text> : null}
      styles={{ body: { paddingBlock: items.length ? 4 : 20 } }}
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('attention.allClear')} />
      ) : (
        items.slice(0, 6).map((item, i) => (
          <Link
            key={item.key}
            to={item.to}
            style={{
              display: 'block',
              color: 'inherit',
              padding: '12px 0',
              borderTop: i === 0 ? undefined : '1px solid var(--isoko-border)',
            }}
          >
            <Flex gap={12} align="center">
              <span className="isoko-stat-icon" style={{ width: 32, height: 32, fontSize: 15 }}>
                {item.icon}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Text strong ellipsis style={{ display: 'block' }}>
                  {item.title}
                </Typography.Text>
                <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: 13 }}>
                  {item.detail}
                </Typography.Text>
              </div>
              <Typography.Text type="secondary" style={{ fontSize: 16 }}>
                ›
              </Typography.Text>
            </Flex>
          </Link>
        ))
      )}
    </Card>
  );
};

export default AttentionList;
