import { useState } from 'react';
import { Button, Empty, Flex, Input, List, Rate, Select, Space, Tooltip, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { skillTaskApi } from '../../api/skillTaskApi';
import EvidenceViewer from './EvidenceViewer';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { SkillTask } from '../../types';

interface AdminReviewQueueProps {
  tasks: SkillTask[];
  onReviewed: () => void;
}

const AdminReviewQueue = ({ tasks, onReviewed }: AdminReviewQueueProps) => {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Confidence drives quorum on the server: a reviewer who says they are
  // unsure gets a second opinion rather than deciding alone.
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [level, setLevel] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = async (taskId: string, decision: 'approved' | 'rejected') => {
    setBusyId(taskId);
    try {
      await skillTaskApi.reviewTask(taskId, decision, {
        confidence: confidence[taskId],
        proficiencyLevel: decision === 'approved' ? level[taskId] : undefined,
        notes: notes[taskId] || undefined,
      });
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
        <Typography.Title level={5}>{t('review.awaitingYou')}</Typography.Title>
        {pending.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('review.nothingToReview')} />
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
                    {t('review.approve')}
                  </Button>,
                  <Button
                    key="r"
                    danger
                    size="small"
                    loading={busyId === task.id}
                    onClick={() => decide(task.id, 'rejected')}
                  >
                    {t('review.reject')}
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
                <EvidenceViewer evidence={task.evidence} />
                {task.notes && (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                    {task.notes}
                  </Typography.Paragraph>
                )}

                <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
                  <Flex align="center" gap={10} wrap>
                    <Tooltip title={t('review.confidenceHint')}>
                      <Typography.Text style={{ fontSize: 13 }}>
                        {t('review.confidenceLabel')}
                      </Typography.Text>
                    </Tooltip>
                    <Rate
                      count={5}
                      value={confidence[task.id] ?? 0}
                      onChange={(v) => setConfidence((c) => ({ ...c, [task.id]: v }))}
                    />
                  </Flex>
                  <Flex align="center" gap={10} wrap>
                    <Typography.Text style={{ fontSize: 13 }}>
                      {t('review.levelLabel')}
                    </Typography.Text>
                    <Select
                      size="small"
                      style={{ width: 90 }}
                      value={level[task.id]}
                      onChange={(v) => setLevel((l) => ({ ...l, [task.id]: v }))}
                      options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
                    />
                  </Flex>
                  <Input.TextArea
                    rows={2}
                    placeholder={t('review.notesLabel')}
                    value={notes[task.id] ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [task.id]: e.target.value }))}
                  />
                </Space>
              </List.Item>
            )}
          />
        )}
      </div>

      <div>
        <Typography.Title level={5}>{t('review.pastReviews')}</Typography.Title>
        {decided.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('review.noPastReviews')} />
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
