import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Empty, Flex, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, EnvironmentOutlined } from '@ant-design/icons';
import ActionMenu from '../common/ActionMenu';
import { adminApi } from '../../api/adminApi';
import IdentityLink from '../common/IdentityLink';
import GigThumbnail from '../common/GigThumbnail';
import RateHint from '../Marketplace/RateHint';
import { locationName } from '../../utils/locationName';
import { fromNow } from '../../lib/time';
import type { Gig } from '../../types';

interface GigApprovalQueueProps {
  gigs: Gig[];
  onReviewed: () => void;
  /** Show at most this many, with the rest a link away (the Dashboard uses this). */
  limit?: number;
}

/**
 * Gigs waiting for approval, laid open so an admin decides without opening
 * anything: what the job is, who posted it, where, and whether its budget is
 * out of line with what the trade usually pays. Decisions sit behind a "⋯" menu
 * and a confirmation, so a stray tap cannot approve or reject; a rejection can
 * carry a reason, which the client receives.
 */
const GigApprovalQueue = ({ gigs, onReviewed, limit }: GigApprovalQueueProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (gig: Gig, decision: 'approved' | 'rejected', note?: string) => {
    setBusyId(gig.id);
    try {
      await adminApi.reviewGig(gig.id, decision, note);
      message.success(`${gig.title}: ${decision === 'approved' ? t('gigApproval.approved') : t('gigApproval.rejected')}`);
      onReviewed();
    } finally {
      setBusyId(null);
    }
  };

  const pending = gigs.filter((g) => g.status === 'pending_review');
  const shown = limit ? pending.slice(0, limit) : pending;

  if (pending.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('gigApproval.empty')} />;
  }

  return (
    <div>
      {shown.map((gig, i) => {
        const place = locationName(gig.locationLat, gig.locationLng);
        return (
          <div
            key={gig.id}
            style={{
              padding: '14px 0',
              borderTop: i === 0 ? undefined : '1px solid var(--ant-color-border-secondary, #e4e4e7)',
            }}
          >
            <Flex gap={12} align="flex-start">
              <GigThumbnail gig={gig} size={48} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Flex justify="space-between" align="flex-start" gap={8} wrap="wrap">
                  <Link to={`/gigs/${gig.id}`} style={{ fontWeight: 600 }}>
                    {gig.title}
                  </Link>
                  <Flex align="center" gap={10}>
                    <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
                      {Number(gig.budget).toLocaleString()} RWF
                    </Typography.Text>
                    <ActionMenu
                      disabled={busyId === gig.id}
                      actions={[
                        {
                          key: 'approve',
                          label: t('gigApproval.approve'),
                          icon: <CheckOutlined />,
                          confirmTitle: t('gigApproval.approveTitle', { title: gig.title }),
                          confirmBody: t('gigApproval.approveBody'),
                          onConfirm: () => decide(gig, 'approved'),
                        },
                        {
                          key: 'reject',
                          label: t('gigApproval.reject'),
                          icon: <CloseOutlined />,
                          danger: true,
                          confirmTitle: t('gigApproval.rejectTitle', { title: gig.title }),
                          confirmLabel: t('gigApproval.confirmReject'),
                          reason: { placeholder: t('gigApproval.rejectReason') },
                          onConfirm: (reason) => decide(gig, 'rejected', reason),
                        },
                      ]}
                    />
                  </Flex>
                </Flex>
                <Flex gap="4px 10px" wrap="wrap" align="center" style={{ marginTop: 4 }}>
                  {gig.skill?.name && <Tag style={{ margin: 0 }}>{gig.skill.name}</Tag>}
                  {gig.client && <IdentityLink id={gig.client.id} name={gig.client.name} size={18} />}
                  {place && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      <EnvironmentOutlined /> {place}
                    </Typography.Text>
                  )}
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('gigApproval.posted', { when: fromNow(gig.createdAt) })}
                  </Typography.Text>
                </Flex>
                <RateHint skillId={gig.skillId} amount={Number(gig.budget)} audience="admin" />
                <Typography.Paragraph
                  type="secondary"
                  style={{ margin: '8px 0 0', fontSize: 13 }}
                  ellipsis={{ rows: 3, expandable: 'collapsible', symbol: (open) => (open ? t('gigApproval.less') : t('gigApproval.more')) }}
                >
                  {gig.description}
                </Typography.Paragraph>

              </div>
            </Flex>
          </div>
        );
      })}
      {limit && pending.length > limit && (
        <Link to="/admin/gigs/pending" style={{ display: 'block', paddingTop: 10, fontSize: 13 }}>
          {t('gigApproval.waiting', { count: pending.length - limit })} →
        </Link>
      )}
    </div>
  );
};

export default GigApprovalQueue;
