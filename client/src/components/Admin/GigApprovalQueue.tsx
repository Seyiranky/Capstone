import { useState } from 'react';
import { Button, Empty, List, Space, Typography } from 'antd';
import { adminApi } from '../../api/adminApi';
import IdentityLink from '../common/IdentityLink';
import GigThumbnail from '../common/GigThumbnail';
import type { Gig } from '../../types';

interface GigApprovalQueueProps {
  gigs: Gig[];
  onReviewed: () => void;
}

const GigApprovalQueue = ({ gigs, onReviewed }: GigApprovalQueueProps) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (gigId: string, decision: 'approved' | 'rejected') => {
    setBusyId(gigId);
    try {
      await adminApi.reviewGig(gigId, decision);
      onReviewed();
    } finally {
      setBusyId(null);
    }
  };

  const pending = gigs.filter((g) => g.status === 'pending_review');

  if (pending.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to review right now." />;
  }

  return (
    <List
      itemLayout="vertical"
      dataSource={pending}
      renderItem={(gig) => (
        <List.Item
          key={gig.id}
          actions={[
            <Button
              key="a"
              type="primary"
              size="small"
              loading={busyId === gig.id}
              onClick={() => decide(gig.id, 'approved')}
            >
              Approve
            </Button>,
            <Button
              key="r"
              danger
              size="small"
              loading={busyId === gig.id}
              onClick={() => decide(gig.id, 'rejected')}
            >
              Reject
            </Button>,
          ]}
        >
          <List.Item.Meta
            avatar={<GigThumbnail gig={gig} size={40} />}
            title={gig.title}
            description={
              <Space size={8} wrap>
                {gig.client && (
                  <IdentityLink id={gig.client.id} name={gig.client.name} size={20} />
                )}
                <Typography.Text type="secondary">
                  {Number(gig.budget).toLocaleString()} RWF
                </Typography.Text>
              </Space>
            }
          />
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {gig.description}
          </Typography.Paragraph>
        </List.Item>
      )}
    />
  );
};

export default GigApprovalQueue;
