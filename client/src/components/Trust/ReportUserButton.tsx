import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Input, Modal, Radio, Space, Typography } from 'antd';
import { FlagOutlined } from '@ant-design/icons';
import { apiErrorMessage } from '../../utils/apiError';
import { REPORT_REASONS, reportApi, type ReportReason } from '../../api/reportApi';

/**
 * Tells the admins about someone. Kept quiet (a text button) so it is there
 * when needed without suggesting the other person is suspect.
 */
const ReportUserButton = ({ userId, name, size = 'small' }: { userId: string; name: string; size?: 'small' | 'middle' }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await reportApi.create({ reportedUserId: userId, reason, note: note.trim() || undefined });
      message.success(t('trust.reportSent'));
      setOpen(false);
      setReason(null);
      setNote('');
    } catch (err) {
      message.error(apiErrorMessage(err, t('trust.reportFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="text" size={size} icon={<FlagOutlined />} onClick={() => setOpen(true)} style={{ color: 'var(--isoko-muted)' }}>
        {t('trust.report')}
      </Button>
      <Modal
        open={open}
        title={t('trust.reportTitle', { name })}
        okText={t('trust.reportSend')}
        okButtonProps={{ disabled: !reason, danger: true }}
        confirmLoading={busy}
        onOk={submit}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('trust.reportIntro')}
        </Typography.Paragraph>
        <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 12 }}>
          <Space direction="vertical">
            {REPORT_REASONS.map((r) => (
              <Radio key={r} value={r}>
                {t(`trust.reason.${r}`)}
              </Radio>
            ))}
          </Space>
        </Radio.Group>
        <Input.TextArea
          rows={3}
          maxLength={1000}
          showCount
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('trust.reportNote')}
        />
      </Modal>
    </>
  );
};

export default ReportUserButton;
