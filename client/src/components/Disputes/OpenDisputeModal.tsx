import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Input, Modal, Radio, Space, Typography } from 'antd';
import { isAxiosError } from 'axios';
import { disputeApi } from '../../api/disputeApi';
import type { DisputeReason, Match } from '../../types';

const REASONS: DisputeReason[] = ['notDone', 'poorQuality', 'noShow', 'notReleased', 'other'];

interface OpenDisputeModalProps {
  match: Match;
  isWorker: boolean;
  onClose: () => void;
  onOpened: () => void;
}

const OpenDisputeModal = ({ match, isWorker, onClose, onOpened }: OpenDisputeModalProps) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [reason, setReason] = useState<DisputeReason | null>(null);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  // "Not released" is the worker's complaint, "did not show up" either side's;
  // offering the client a reason only a worker can have would just confuse.
  const reasons = REASONS.filter((r) => isWorker || r !== 'notReleased');

  const submit = async () => {
    if (!reason) return;
    setSaving(true);
    try {
      await disputeApi.open(match.id, reason, details);
      onOpened();
      onClose();
    } catch (error) {
      message.error(
        isAxiosError(error) ? (error.response?.data?.message ?? 'Could not open the dispute') : 'Could not open the dispute',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('dispute.openTitle', { title: match.gig?.title ?? '' })}
      okText={t('dispute.submit')}
      okButtonProps={{ danger: true, disabled: !reason || details.trim().length < 10 }}
      confirmLoading={saving}
      onOk={submit}
      onCancel={onClose}
    >
      <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
        {t('dispute.openBody')}
      </Typography.Paragraph>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t('dispute.reasonLabel')}
      </Typography.Text>
      <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={6}>
          {reasons.map((r) => (
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
