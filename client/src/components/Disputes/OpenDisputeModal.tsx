import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Input, Modal, Radio, Space, Typography } from 'antd';
import { isAxiosError } from 'axios';
import { disputeApi, type DisputeEligibility } from '../../api/disputeApi';
import type { DisputeReason } from '../../types';

interface OpenDisputeModalProps {
  /** The job and what the server allows on it: the stage and this person's reasons. */
  job: Pick<DisputeEligibility, 'matchId' | 'gigTitle' | 'stage' | 'reasons' | 'price'>;
  onClose: () => void;
  onOpened: () => void;
}

/**
 * Opening a dispute. The reasons offered are the ones the server allows this
 * person at this stage, and the form says what a decision would mean here:
 * before payment it sets what is owed; after, what is paid back.
 */
const OpenDisputeModal = ({ job, onClose, onOpened }: OpenDisputeModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [reason, setReason] = useState<DisputeReason | null>(job.reasons.length === 1 ? job.reasons[0] : null);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const stage = job.stage ?? 'in_progress';

  const submit = async () => {
    if (!reason) return;
    setSaving(true);
    try {
      await disputeApi.open(job.matchId, reason, details);
      message.success(t('dispute.opened'));
      onOpened();
      onClose();
    } catch (error) {
      message.error(
        isAxiosError(error) ? (error.response?.data?.message ?? t('dispute.openFailed')) : t('dispute.openFailed'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('dispute.openTitle', { title: job.gigTitle })}
      okText={t('dispute.submit')}
      okButtonProps={{ danger: true, disabled: !reason || details.trim().length < 10 }}
      confirmLoading={saving}
      onOk={submit}
      onCancel={onClose}
    >
      <div className={`isoko-dispute-stage isoko-dispute-stage--${stage}`}>
        <strong>{t(`dispute.stage_${stage}`)}</strong>
        <span>{t(`dispute.stageBody_${stage}`, { amount: job.price.toLocaleString() })}</span>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        {t('dispute.openBody')}
      </Typography.Paragraph>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t('dispute.reasonLabel')}
      </Typography.Text>
      <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={6}>
          {job.reasons.map((r) => (
            <Radio key={r} value={r}>
              {t(`dispute.reason_${r}`)}
            </Radio>
          ))}
        </Space>
      </Radio.Group>
      <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
        {t('dispute.detailsLabel')}
      </Typography.Text>
      <Input.TextArea
        rows={4}
        maxLength={2000}
        showCount
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder={t('dispute.detailsPlaceholder')}
        style={{ marginBottom: 16 }}
      />
    </Modal>
  );
};

export default OpenDisputeModal;
