import { useState } from 'react';
import { App, Button, Card, Empty, Flex, Input, Modal, Radio, Select, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { skillTaskApi, type RecusalReason } from '../../api/skillTaskApi';
import { apiErrorMessage } from '../../utils/apiError';
import EvidenceViewer from './EvidenceViewer';
import IdentityLink from '../common/IdentityLink';
import type { SkillTask } from '../../types';

const REASONS: RecusalReason[] = ['knowsWorker', 'conflict', 'notQualified'];

/**
 * A peer reviewer's open submissions.
 *
 * Each one is judged on its evidence alone: the reviewer does not see what
 * anyone else decided. They say how sure they are (an unsure verdict brings in
 * a second reviewer) and the level they saw. If they know the worker, they step
 * aside instead, and the submission goes to someone else.
 */
const PeerReviewQueue = ({ tasks, onChanged }: { tasks: SkillTask[]; onChanged: () => void }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [level, setLevel] = useState<Record<string, number>>({});
  const [confidence, setConfidence] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [recusing, setRecusing] = useState<SkillTask | null>(null);
  const [reason, setReason] = useState<RecusalReason>('knowsWorker');
  const [reasonNote, setReasonNote] = useState('');

  const decide = async (task: SkillTask, decision: 'approved' | 'rejected') => {
    setBusyId(task.id);
    try {
      await skillTaskApi.reviewTask(task.id, decision, {
        confidence: confidence[task.id],
        proficiencyLevel: decision === 'approved' ? level[task.id] : undefined,
        notes: notes[task.id]?.trim() || undefined,
      });
      message.success(decision === 'approved' ? t('peerReview.approved') : t('peerReview.rejected'));
      onChanged();
    } catch (err) {
      message.error(apiErrorMessage(err, t('review.decideFailed')));
    } finally {
      setBusyId(null);
    }
  };

  const recuse = async () => {
    if (!recusing) return;
    setBusyId(recusing.id);
    try {
      const res = await skillTaskApi.recuse(recusing.id, reason, reasonNote.trim() || undefined);
      message.success(res.reassigned ? t('peerReview.recusedReassigned') : t('peerReview.recusedToAdmin'));
      setRecusing(null);
      onChanged();
    } catch (err) {
      message.error(apiErrorMessage(err, t('review.decideFailed')));
    } finally {
      setBusyId(null);
    }
  };

  if (tasks.length === 0) {
    return (
      <Card>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('review.nothingToReview')} />
      </Card>
    );
  }

  return (
    <Flex vertical gap={16}>
      {tasks.map((task) => (
        <Card
          key={task.id}
          title={task.skill?.name}
          extra={task.worker ? <IdentityLink id={task.worker.id} name={task.worker.name} size={20} /> : null}
        >
          <EvidenceViewer evidence={task.evidence} />
          {task.notes && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
              {task.notes}
            </Typography.Paragraph>
          )}

          <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 12 }}>
            <Flex gap={16} wrap>
              <Flex align="center" gap={8}>
                <Typography.Text style={{ fontSize: 13 }}>{t('review.confidenceLabel')}</Typography.Text>
                <Select
                  size="small"
                  style={{ width: 150 }}
                  placeholder={t('peerReview.choose')}
                  value={confidence[task.id]}
                  onChange={(v) => setConfidence((c) => ({ ...c, [task.id]: v }))}
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: t(`peerReview.confidence.${n}`) }))}
                />
              </Flex>
              <Flex align="center" gap={8}>
                <Typography.Text style={{ fontSize: 13 }}>{t('review.levelLabel')}</Typography.Text>
                <Select
                  size="small"
                  style={{ width: 90 }}
                  value={level[task.id]}
                  onChange={(v) => setLevel((l) => ({ ...l, [task.id]: v }))}
                  options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
                />
              </Flex>
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {t('review.confidenceHint')}
            </Typography.Text>
            <Input.TextArea
              rows={2}
              maxLength={1000}
              placeholder={t('review.notesLabel')}
              value={notes[task.id] ?? ''}
              onChange={(e) => setNotes((n) => ({ ...n, [task.id]: e.target.value }))}
            />
            <Flex gap={8} justify="space-between" wrap>
              <Button
                type="link"
                style={{ paddingInline: 0 }}
                onClick={() => {
                  setReason('knowsWorker');
                  setReasonNote('');
                  setRecusing(task);
                }}
              >
                {t('peerReview.stepAside')}
              </Button>
              <Flex gap={8}>
                <Button
                  danger
                  loading={busyId === task.id}
                  disabled={!confidence[task.id]}
                  onClick={() => decide(task, 'rejected')}
                >
                  {t('review.reject')}
                </Button>
                <Button
                  type="primary"
                  loading={busyId === task.id}
                  disabled={!confidence[task.id] || !level[task.id]}
                  onClick={() => decide(task, 'approved')}
                >
                  {t('review.approve')}
                </Button>
              </Flex>
            </Flex>
          </Space>
        </Card>
      ))}

      <Modal
        open={Boolean(recusing)}
        title={t('peerReview.stepAsideTitle')}
        okText={t('peerReview.stepAsideConfirm')}
        okButtonProps={{ loading: busyId === recusing?.id }}
        onOk={recuse}
        onCancel={() => setRecusing(null)}
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('peerReview.stepAsideHelp')}
        </Typography.Paragraph>
        <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }}>
          <Flex vertical gap={8}>
            {REASONS.map((r) => (
              <Radio key={r} value={r}>
                {t(`peerReview.reason.${r}`)}
              </Radio>
            ))}
          </Flex>
        </Radio.Group>
        <Input.TextArea
          rows={2}
          maxLength={500}
          style={{ marginTop: 12 }}
          placeholder={t('peerReview.stepAsideNote')}
          value={reasonNote}
          onChange={(e) => setReasonNote(e.target.value)}
        />
      </Modal>
    </Flex>
  );
};

export default PeerReviewQueue;
