import { useState } from 'react';
import { Button, Empty, List, Space, Typography } from 'antd';
import { skillTaskApi } from '../../api/skillTaskApi';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { SkillTask } from '../../types';

interface AdminReviewQueueProps {
  tasks: SkillTask[];
  onReviewed: () => void;
}

const AdminReviewQueue = ({ tasks, onReviewed }: AdminReviewQueueProps) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (taskId: string, decision: 'approved' | 'rejected') => {
    setBusyId(taskId);
    try {
      await skillTaskApi.reviewTask(taskId, decision);
      onReviewed();
    } finally {
      setBusyId(null);
    }
  };

  const pending = tasks.filter((x) => x.status === 'pending');
  const decided = tasks.filter((x) => x.status !== 'pending');

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={5}>Tasks awaiting your review</Typography.Title>
        {pending.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing to review right now." />
        ) : (
          <List
            itemLayout="vertical"
            dataSource={pending}
            renderItem={(task) => (
              <List.Item
                key={task.id}
                actions={[
                  <Button
                    key="a"
                    type="primary"
                    size="small"
                    loading={busyId === task.id}
                    onClick={() => decide(task.id, 'approved')}
                  >
                    Approve
                  </Button>,
                  <Button
                    key="r"
                    danger
                    size="small"
                    loading={busyId === task.id}
                    onClick={() => decide(task.id, 'rejected')}
                  >
                    Reject
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={task.skill?.name}
                  description={
                    task.worker ? (
                      <IdentityLink id={task.worker.id} name={task.worker.name} size={20} />
                    ) : null
                  }
                />
                <Typography.Paragraph style={{ marginBottom: task.notes ? 4 : 0 }}>
                  Evidence:{' '}
                  <a href={task.evidenceUrl} target="_blank" rel="noreferrer">
                    {task.evidenceUrl}
                  </a>
                </Typography.Paragraph>
                {task.notes && (
                  <Typography.Text type="secondary">{task.notes}</Typography.Text>
                )}
              </List.Item>
            )}
          />
        )}
      </div>

      <div>
        <Typography.Title level={5}>Past reviews</Typography.Title>
        {decided.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No reviews completed yet." />
        ) : (
          <List
            dataSource={decided}
            renderItem={(task) => (
              <List.Item actions={[<StatusTag key="s" status={task.status} />]}>
                <List.Item.Meta
                  title={task.skill?.name}
                  description={
                    task.worker ? (
                      <IdentityLink id={task.worker.id} name={task.worker.name} size={20} />
                    ) : null
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </Space>
  );
};

export default AdminReviewQueue;
