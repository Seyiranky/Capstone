import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Empty, Flex, Input, Tag, Typography } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
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
 * out of line with what the trade usually pays. Rejecting asks for an optional
 * reason in place, which the client receives.
 */
const GigApprovalQueue = ({ gigs, onReviewed, limit }: GigApprovalQueueProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const decide = async (gig: Gig, decision: 'approved' | 'rejected') => {
    setBusyId(gig.id);
    try {
      await adminApi.reviewGig(gig.id, decision, decision === 'rejected' ? note.trim() || undefined : undefined);
      message.success(`${gig.title}: ${decision === 'approved' ? t('gigApproval.approve') : t('gigApproval.reject')}`);
      setRejectingId(null);
      setNote('');
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
        const rejecting = rejectingId === gig.id;
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
                  <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
                    {Number(gig.budget).toLocaleString()} RWF
                  </Typography.Text>
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

                {rejecting ? (
                  <Flex vertical gap={8} style={{ marginTop: 10 }}>
                    <Input.TextArea
                      autoFocus
                      rows={2}
                      maxLength={280}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('gigApproval.rejectReason')}
                    />
                    <Flex gap={8}>
                      <Button danger type="primary" size="small" loading={busyId === gig.id} onClick={() => decide(gig, 'rejected')}>
                        {t('gigApproval.confirmReject')}
                      </Button>
                      <Button size="small" onClick={() => setRejectingId(null)}>
                        {t('gigApproval.cancel')}
                      </Button>
                    </Flex>
                  </Flex>
                ) : (
                  <Flex gap={8} style={{ marginTop: 10 }}>
                    <Button type="primary" size="small" loading={busyId === gig.id} onClick={() => decide(gig, 'approved')}>
                      {t('gigApproval.approve')}
                    </Button>
                    <Button
                      danger
                      size="small"
                      onClick={() => {
                        setNote('');
                        setRejectingId(gig.id);
                      }}
                    >
                      {t('gigApproval.reject')}
                    </Button>
                  </Flex>
                )}
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
