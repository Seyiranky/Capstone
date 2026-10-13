import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Flex, Input, Modal, Radio, Space, Typography } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import MatchExplanation from '../common/MatchExplanation';
import type { GigApplication, RejectionReason } from '../../types';

const REASONS: RejectionReason[] = ['skillLevel', 'distance', 'timing', 'choseAnother', 'other'];

interface ApplicantListProps {
  applicants: GigApplication[];
  budget: number;
  canDecide: boolean;
  busyId: string | null;
  onDecide: (
    applicationId: string,
    decision: 'approved' | 'rejected',
    rejection?: { reason: RejectionReason; note?: string },
  ) => void;
}

/**
 * Applicants as stacked rows rather than a table.
 *
 * The table pinned its action column over the worker's name on phones and
 * clipped the ranking explanation on desktop. Each row here wraps on its own:
 * identity and status on top, the score and reasons beneath, actions last.
 */
const ApplicantList = ({ applicants, budget, canDecide, busyId, onDecide }: ApplicantListProps) => {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<GigApplication | null>(null);
  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [note, setNote] = useState('');

  return (
    <div>
      {applicants.map((a, i) => {
        const breakdown = a.scoreBreakdown;
        const open = openId === a.id;
        const trust =
          a.worker?.reviewCount === 0
            ? t('match.reason.trustProvisional')
            : a.worker
              ? a.worker.trustScore.toFixed(1)
              : '—';
        return (
          <div
            key={a.id}
            style={{
              padding: '14px 0',
              borderTop: i === 0 ? undefined : '1px solid var(--ant-color-border-secondary, #e4e4e7)',
            }}
          >
            <Flex justify="space-between" align="center" gap={12}>
              <div style={{ minWidth: 0 }}>
                {a.worker ? <IdentityLink id={a.worker.id} name={a.worker.name} size={28} /> : '—'}
              </div>
              <StatusTag status={a.status} />
            </Flex>

            <Flex wrap="wrap" gap="4px 14px" style={{ marginTop: 8, paddingInlineStart: 36 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t('match.component.trust')}: <Typography.Text style={{ fontSize: 13 }}>{trust}</Typography.Text>
              </Typography.Text>
              {a.quoteAmount != null && (
                <Typography.Text style={{ fontSize: 13 }}>
                  {t('quote.quoteLine', { amount: Number(a.quoteAmount).toLocaleString() })}
                  {Number(a.quoteAmount) !== budget && (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {' '}
                      ({Number(a.quoteAmount) > budget ? t('quote.overBudget') : t('quote.underBudget')})
                    </Typography.Text>
                  )}
                </Typography.Text>
              )}
              {breakdown && (
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {t('marketplace.gigDetail.matchPercent', {
                    percent: Math.round(breakdown.score * 100),
                  })}
                </Typography.Text>
              )}
            </Flex>

            {a.crew && a.crew.length > 0 && (
              <Typography.Text style={{ fontSize: 13, display: 'block', marginTop: 6, paddingInlineStart: 36 }}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {t('team.crewLine')}:{' '}
                </Typography.Text>
                {a.crew.map((c) => `${c.name ?? '—'} (${c.sharePercent}%)`).join(', ')}
              </Typography.Text>
            )}
            {a.quoteNote && (
              <Typography.Paragraph
                type="secondary"
                style={{ fontSize: 13, margin: '6px 0 0', paddingInlineStart: 36 }}
              >
                “{a.quoteNote}”
              </Typography.Paragraph>
            )}

            {breakdown && (
              <div style={{ marginTop: 8, paddingInlineStart: 36 }}>
                {open ? (
                  <MatchExplanation breakdown={breakdown} />
                ) : (
                  <MatchExplanation breakdown={breakdown} compact />
                )}
              </div>
            )}

            {(breakdown || (canDecide && a.status === 'pending')) && (
              <Flex
                justify="space-between"
                align="center"
                wrap="wrap"
                gap={8}
                style={{ marginTop: 10, paddingInlineStart: 36 }}
              >
                {breakdown ? (
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 0 }}
                    icon={open ? <UpOutlined /> : <DownOutlined />}
                    iconPosition="end"
                    onClick={() => setOpenId(open ? null : a.id)}
                    aria-expanded={open}
                  >
                    {t('match.explainTitle')}
                  </Button>
                ) : (
                  <span />
                )}
                {canDecide && a.status === 'pending' && (
                  <Flex gap={8}>
                    <Button
                      size="small"
                      type="primary"
                      loading={busyId === a.id}
                      onClick={() => onDecide(a.id, 'approved')}
                    >
                      {t('marketplace.gigDetail.approve')}
                    </Button>
                    <Button
                      size="small"
                      danger
                      loading={busyId === a.id}
                      onClick={() => {
                        setReason(null);
                        setNote('');
                        setRejecting(a);
                      }}
                    >
                      {t('marketplace.gigDetail.reject')}
                    </Button>
                  </Flex>
                )}
              </Flex>
            )}
          </div>
        );
      })}
      <Modal
        open={Boolean(rejecting)}
        title={t('rejection.title')}
        okText={t('rejection.confirm')}
        okButtonProps={{ danger: true, disabled: !reason }}
        onCancel={() => setRejecting(null)}
        onOk={() => {
          if (rejecting && reason) {
            onDecide(rejecting.id, 'rejected', { reason, note: note.trim() || undefined });
            setRejecting(null);
          }
        }}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('rejection.help')}
        </Typography.Paragraph>
        <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 14 }}>
          <Space direction="vertical" size={6}>
            {REASONS.map((r) => (
              <Radio key={r} value={r}>
                {t(`rejection.${r}`)}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
        <Input.TextArea
          rows={2}
          maxLength={280}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('rejection.notePlaceholder')}
        />
      </Modal>
    </div>
  );
};

export default ApplicantList;
