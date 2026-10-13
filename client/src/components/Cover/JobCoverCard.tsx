import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Form, Input, InputNumber, Modal, Typography } from 'antd';
import { MedicineBoxOutlined } from '@ant-design/icons';
import StatusTag from '../common/StatusTag';
import { coverApi, type CoverStatus } from '../../api/coverApi';
import { apiErrorMessage } from '../../utils/apiError';

/**
 * Shown on a covered job: the policy, what it pays for, and for a worker on
 * the job, a way to claim after an accident and where their claims stand.
 */
const JobCoverCard = ({ matchId }: { matchId: string }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [cover, setCover] = useState<CoverStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<{ description: string; amount: number }>();

  const load = () => coverApi.status(matchId).then(setCover).catch(() => setCover(null));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (!cover?.covered) return null;

  const submit = async (values: { description: string; amount: number }) => {
    setBusy(true);
    try {
      await coverApi.claim(matchId, values);
      message.success(t('cover.claimSent'));
      setOpen(false);
      form.resetFields();
      load();
    } catch (err) {
      message.error(apiErrorMessage(err, t('cover.claimFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--isoko-border)', marginBottom: 10 }}>
      <Flex justify="space-between" align="center" gap={10} wrap="wrap">
        <Flex gap={10} align="center" style={{ minWidth: 0 }}>
          <MedicineBoxOutlined style={{ fontSize: 18, color: '#16a34a' }} />
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ display: 'block', fontSize: 13.5 }}>
              {t('cover.covered')}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
              {t('cover.policyLine', { policy: cover.policyNumber, limit: cover.limit.toLocaleString() })}
            </Typography.Text>
          </div>
        </Flex>
        {cover.canClaim && (
          <Button size="small" onClick={() => setOpen(true)}>
            {t('cover.fileClaim')}
          </Button>
        )}
      </Flex>

      {cover.claims.map((c) => (
        <Flex key={c.id} justify="space-between" gap={10} style={{ marginTop: 10, fontSize: 12.5 }}>
          <Typography.Text style={{ fontSize: 12.5, minWidth: 0 }} ellipsis>
            {t('cover.claimLine', { amount: c.amountRequested.toLocaleString() })}
            {c.status === 'approved' && c.amountApproved != null && ` · ${t('cover.paidLine', { amount: c.amountApproved.toLocaleString() })}`}
            {c.status === 'declined' && c.decisionNote && ` · ${c.decisionNote}`}
          </Typography.Text>
          <StatusTag status={c.status === 'submitted' ? 'pending' : c.status} />
        </Flex>
      ))}

      <Modal
        open={open}
        title={t('cover.claimTitle')}
        okText={t('cover.sendClaim')}
        confirmLoading={busy}
        onOk={() => form.submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t('cover.claimIntro', { limit: cover.limit.toLocaleString(), days: cover.claimWindowDays })}
        </Typography.Paragraph>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item name="description" label={t('cover.whatHappened')} rules={[{ required: true, min: 20, max: 2000 }]}>
            <Input.TextArea rows={4} placeholder={t('cover.whatHappenedHint')} />
          </Form.Item>
          <Form.Item name="amount" label={t('cover.cost')} rules={[{ required: true }]}>
            <InputNumber min={1} max={cover.limit} addonAfter="RWF" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default JobCoverCard;
