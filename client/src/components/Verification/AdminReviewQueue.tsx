import { useState } from 'react';
import { App, Button, Empty, Flex, Input, List, Select, Space, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { apiErrorMessage } from '../../utils/apiError';
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
  const { message } = App.useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [level, setLevel] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  // An admin's decision settles the submission whoever it was assigned to; the
  // assigned peer is released. (Through the peer route an admin without an
  // assignment of their own was refused.)
  const decide = async (taskId: string, decision: 'approved' | 'rejected') => {
    setBusyId(taskId);
    try {
      await skillTaskApi.adminDecide(taskId, decision, {
        proficiencyLevel: decision === 'approved' ? level[taskId] : undefined,
        notes: notes[taskId] || undefined,
      });
      message.success(decision === 'approved' ? t('review.adminApproved') : t('review.adminRejected'));
      onReviewed();
    } catch (err) {
      message.error(apiErrorMessage(err, t('review.decideFailed')));
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
                {(() => {
                  const open = task.assignments?.find((a) => a.status === 'pending');
                  return (
                    <Typography.Text type="secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 8 }}>
                      <UserOutlined />
                      {open?.reviewer
                        ? t('review.assignedTo', { name: open.reviewer.name })
                        : t('review.unassigned')}
                      {' · '}
                      {t('review.adminDecides')}
                    </Typography.Text>
                  );
                })()}
                <EvidenceViewer evidence={task.evidence} />
                {task.notes && (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                    {task.notes}
                  </Typography.Paragraph>
                )}

                <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 12 }}>
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
