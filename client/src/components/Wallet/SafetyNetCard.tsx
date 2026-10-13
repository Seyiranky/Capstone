import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Card, Col, Flex, Input, InputNumber, Modal, Row, Segmented, Typography } from 'antd';
import { HeartOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { safetyNetApi } from '../../api/safetyNetApi';
import { fromNow } from '../../lib/time';
import type { SafetyNet } from '../../types';

const Figure = ({ label, value }: { label: string; value: number }) => (
  <div>
    <Typography.Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
      {label}
    </Typography.Text>
    <span style={{ fontSize: 20, fontWeight: 700 }}>
      {value.toLocaleString()}{' '}
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--isoko-muted)' }}>RWF</span>
    </span>
  </div>
);

/**
 * The worker's safety net: what clients have added, what they can draw on now,
 * and the share of each payout they save toward Ejo Heza.
 */
const SafetyNetCard = () => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [net, setNet] = useState<SafetyNet | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    safetyNetApi.mine().then(setNet).catch(() => undefined);
  }, []);

  if (!net) return null;

  const fail = (error: unknown) =>
    message.error(isAxiosError(error) ? (error.response?.data?.message ?? 'Something went wrong') : 'Something went wrong');

  const withdraw = async () => {
    if (!amount) return;
    setBusy(true);
    try {
      setNet(await safetyNetApi.withdraw(amount, note || undefined));
      setWithdrawing(false);
      setAmount(null);
      setNote('');
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <HeartOutlined style={{ color: 'var(--isoko-navy)' }} />
          {t('safetyNet.title')}
        </Flex>
      }
      extra={
        <Button size="small" disabled={net.balance < 100} onClick={() => setWithdrawing(true)}>
          {t('safetyNet.withdraw')}
        </Button>
      }
      style={{ marginTop: 16 }}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: -4, fontSize: 13 }}>
        {t('safetyNet.subtitle')}
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Figure label={t('safetyNet.balance')} value={net.balance} />
        </Col>
        <Col xs={12} md={6}>
          <Figure label={t('safetyNet.contributed')} value={net.contributed} />
        </Col>
        <Col xs={12} md={6}>
          <Figure label={t('safetyNet.withdrawn')} value={net.withdrawn} />
        </Col>
        <Col xs={12} md={6}>
          <Figure label={t('safetyNet.ejoHeza')} value={net.ejoHeza} />
        </Col>
      </Row>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--isoko-border)' }}>
        <Typography.Text strong style={{ display: 'block' }}>
          {t('safetyNet.ejoHeza')}
        </Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', margin: '2px 0 8px' }}>
          {t('safetyNet.ejoHezaHelp')}
        </Typography.Text>
        <Segmented
          value={net.savingsPercent}
          onChange={(v) => safetyNetApi.setSavings(Number(v)).then(setNet).catch(fail)}
          options={[0, 5, 10, 15, 20].map((p) => ({ value: p, label: `${p}%` }))}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
          {t('safetyNet.simulated')}
        </Typography.Text>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--isoko-border)' }}>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
          {t('safetyNet.recent')}
        </Typography.Text>
        {net.entries.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t('safetyNet.empty')}
          </Typography.Text>
        ) : (
          net.entries.slice(0, 6).map((e) => (
            <Flex key={e.id} justify="space-between" align="center" gap={12} style={{ padding: '6px 0' }}>
              <div style={{ minWidth: 0 }}>
                <Typography.Text style={{ fontSize: 13 }}>{t(`safetyNet.kind_${e.kind}`)}</Typography.Text>
                {e.note && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {' · '}
                    {e.note}
                  </Typography.Text>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  {fromNow(e.createdAt)}
                </Typography.Text>
              </div>
              <Typography.Text strong style={{ whiteSpace: 'nowrap', color: e.kind === 'withdrawal' ? 'var(--isoko-muted)' : undefined }}>
                {e.kind === 'withdrawal' ? '−' : '+'}
                {Number(e.amount).toLocaleString()} RWF
              </Typography.Text>
            </Flex>
          ))
        )}
      </div>

      <Modal
        open={withdrawing}
        title={t('safetyNet.withdrawTitle')}
        okText={t('safetyNet.withdraw')}
        okButtonProps={{ disabled: !amount || amount < 100 || amount > net.balance }}
        confirmLoading={busy}
        onOk={withdraw}
        onCancel={() => setWithdrawing(false)}
        destroyOnHidden
      >
        <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
          {t('safetyNet.amount')}
        </Typography.Text>
        <InputNumber min={100} max={net.balance} value={amount} onChange={setAmount} style={{ width: '100%' }} addonAfter="RWF" />
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', margin: '4px 0 14px' }}>
          {t('safetyNet.balance')}: {net.balance.toLocaleString()} RWF
        </Typography.Text>
        <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
          {t('safetyNet.why')}
        </Typography.Text>
        <Input.TextArea rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('safetyNet.whyPlaceholder')} />
      </Modal>
    </Card>
  );
};

export default SafetyNetCard;
