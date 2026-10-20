import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { App, Button, Flex, Input, Segmented, Spin, Typography } from 'antd';
import { CheckCircleOutlined, MedicineBoxOutlined, MobileOutlined, WarningOutlined } from '@ant-design/icons';
import HelpLink from '../Support/HelpLink';
import { matchApi } from '../../api/matchApi';
import { transactionApi } from '../../api/transactionApi';
import { coverApi, type CoverStatus } from '../../api/coverApi';
import { useAppSelector } from '../../store/hooks';
import { apiErrorMessage } from '../../utils/apiError';
import type { Dispute, Match, Transaction } from '../../types';

interface JobPaymentPanelProps {
  match: Match;
  isWorker: boolean;
  /** A dispute that is still open or with an admin, if there is one. */
  liveDispute?: Dispute;
  onChanged: () => void;
}

const rwf = (n: number) => `${Math.round(n).toLocaleString()} RWF`;
/** 0788123456 from +250788123456, for the number field. */
const localNumber = (msisdn?: string | null) => (msisdn ? msisdn.replace(/^\+?250/, '0') : '');

/**
 * Paying for a job with Mobile Money, on the job card.
 *
 * While the job is in progress the client can add Job Cover and, when the work
 * is done, marks it done. Then they pay: a request goes to their MoMo number,
 * they approve it with their PIN, and this panel follows the payment until it
 * is confirmed. The worker sees each step from their side.
 */
const JobPaymentPanel = ({ match, isWorker, liveDispute, onChanged }: JobPaymentPanelProps) => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const myPhone = useAppSelector((s) => s.auth.profile?.phone);
  const [busy, setBusy] = useState<string | null>(null);
  const [phone, setPhone] = useState(localNumber(myPhone));
  // Suggested 3% to the worker's safety net, as Alia suggests a small amount per job.
  const [netPercent, setNetPercent] = useState(3);
  const [cover, setCover] = useState<CoverStatus | null>(null);
  const [payment, setPayment] = useState<Transaction | null>(match.transaction ?? null);
  const poll = useRef<number | undefined>(undefined);

  const price = Number(match.agreedAmount ?? match.gig?.budget ?? 0);
  const premium = Number(match.coverPremium ?? 0);
  const contribution = Math.round((price * netPercent) / 100);
  const total = price + contribution + premium;
  const workerName = match.worker?.name ?? '';
  const clientName = match.gig?.client?.name ?? '';
  const waiting = payment?.status === 'initiated';

  useEffect(() => {
    if (!isWorker && match.status === 'accepted') coverApi.status(match.id).then(setCover).catch(() => setCover(null));
  }, [isWorker, match.id, match.status]);

  useEffect(() => setPayment(match.transaction ?? null), [match.transaction]);

  // While the client approves on their phone, ask every 3 seconds where the payment stands.
  useEffect(() => {
    if (isWorker || !waiting || !payment) return;
    poll.current = window.setInterval(async () => {
      try {
        const latest = await transactionApi.get(payment.id);
        setPayment(latest);
        if (latest.status === 'confirmed') {
          message.success(t('pay.paidToast', { name: workerName }));
          onChanged();
        } else if (latest.status === 'failed') {
          message.error(t('pay.failedToast'));
        }
      } catch {
        /* a missed check is retried on the next tick */
      }
    }, 3000);
    return () => window.clearInterval(poll.current);
  }, [isWorker, waiting, payment, message, t, workerName, onChanged]);

  const run = async (key: string, action: () => Promise<unknown>, fallback: string) => {
    setBusy(key);
    try {
      await action();
    } catch (err) {
      message.error(apiErrorMessage(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  const markDone = () =>
    modal.confirm({
      title: t('pay.markDoneTitle'),
      content: t('pay.markDoneBody', { name: workerName, amount: rwf(price) }),
      okText: t('pay.markDone'),
      onOk: () => run('done', async () => {
        await matchApi.updateMatchStatus(match.id, 'completed');
        onChanged();
      }, t('pay.genericError')),
    });

  // The worker cannot mark the job done (that is the client's word), but they
  // can say it is finished, which asks the client to check and pay.
  const reportFinished = () =>
    modal.confirm({
      title: t('pay.finishedTitle'),
      content: t('pay.finishedBody', { name: clientName }),
      okText: t('pay.finished'),
      onOk: () => run('finished', async () => {
        await matchApi.reportWorkDone(match.id);
        message.success(t('pay.finishedToast', { name: clientName }));
        onChanged();
      }, t('pay.genericError')),
    });

  // Either side can call off a job under way; it counts against whoever does.
  const callOff = () => {
    let reason = '';
    modal.confirm({
      title: t('pay.callOffTitle'),
      okText: t('pay.callOff'),
      okButtonProps: { danger: true },
      content: (
        <Flex vertical gap={8}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t(isWorker ? 'pay.callOffBodyWorker' : 'pay.callOffBodyClient', { name: isWorker ? clientName : workerName })}
          </Typography.Text>
          <Input.TextArea
            rows={2}
            maxLength={280}
            placeholder={t('pay.callOffReason')}
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </Flex>
      ),
      onOk: () => run('calloff', async () => {
        await matchApi.updateMatchStatus(match.id, 'cancelled', reason.trim() || undefined);
        message.success(t('pay.calledOff'));
        onChanged();
      }, t('pay.genericError')),
    });
  };

  const addCover = () =>
    run('cover', async () => {
      setCover(await coverApi.buy(match.id));
      message.success(t('pay.coverAdded'));
      onChanged();
    }, t('pay.genericError'));

  const pay = () =>
    run('pay', async () => {
      setPayment(await transactionApi.pay({ matchId: match.id, phone, safetyNet: contribution }));
    }, t('pay.genericError'));

  const approveSimulated = () =>
    run('approve', async () => {
      if (!payment) return;
      setPayment(await transactionApi.approveSimulated(payment.id));
      message.success(t('pay.paidToast', { name: workerName }));
      onChanged();
    }, t('pay.genericError'));


  const body = (() => {
    if (liveDispute) {
      return (
        <div className="isoko-paybox isoko-paybox--warning">
          <Flex align="flex-start" gap={8}>
            <WarningOutlined style={{ marginTop: 3 }} />
            <Typography.Text style={{ fontSize: 13 }}>{t('pay.disputeOpen')}</Typography.Text>
          </Flex>
          <Link to="/disputes" style={{ fontSize: 13 }}>
            {t('dispute.viewDispute')}
          </Link>
        </div>
      );
    }

    // ── The job is in progress ─────────────────────────────────────────────
    if (match.status === 'accepted') {
      return (
        <div className="isoko-paybox">
          <Typography.Text strong style={{ display: 'block' }}>
            {t('pay.inProgress')}
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: '4px 0 12px' }}>
            {isWorker
              ? t('pay.inProgressWorker', { name: clientName, amount: rwf(price) })
              : t('pay.inProgressClient', { name: workerName, amount: rwf(price) })}
          </Typography.Paragraph>
          {!isWorker && cover?.canBuy && (
            <Flex className="isoko-paybox__offer" align="center" gap={10} wrap="wrap">
              <MedicineBoxOutlined />
              <Typography.Text style={{ flex: 1, minWidth: 180, fontSize: 13 }}>
                {t('pay.coverOffer', { name: workerName, premium: rwf(cover.premium), limit: rwf(cover.limit) })}
              </Typography.Text>
              <Button size="small" loading={busy === 'cover'} onClick={addCover}>
                {t('pay.addCover')}
              </Button>
            </Flex>
          )}
          {match.workDoneAt && (
            <Flex align="center" gap={8} className="isoko-paybox__note">
              <CheckCircleOutlined />
              <Typography.Text style={{ fontSize: 13 }}>
                {isWorker
                  ? t('pay.finishedToldClient', { name: clientName, date: new Date(match.workDoneAt).toLocaleDateString() })
                  : t('pay.workerSaysFinished', { name: workerName })}
              </Typography.Text>
            </Flex>
          )}
          {!isWorker && (
            <Button type="primary" block loading={busy === 'done'} onClick={markDone} style={{ marginTop: 12 }}>
              {t('pay.markDone')}
            </Button>
          )}
          {isWorker && !match.workDoneAt && (
            <Button type="primary" block loading={busy === 'finished'} onClick={reportFinished} style={{ marginTop: 12 }}>
              {t('pay.finished')}
            </Button>
          )}
          <Button type="link" danger size="small" loading={busy === 'calloff'} onClick={callOff} style={{ padding: 0, marginTop: 8 }}>
            {t('pay.callOff')}
          </Button>
        </div>
      );
    }

    // ── Done, not paid yet ─────────────────────────────────────────────────
    if (match.status !== 'completed' || payment?.status === 'confirmed') return null;

    if (isWorker) {
      return (
        <div className="isoko-paybox">
          <Typography.Text strong style={{ display: 'block' }}>
            {t('pay.awaitingTitle')}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {waiting ? t('pay.awaitingApproval', { name: clientName, amount: rwf(price) }) : t('pay.awaitingClient', { name: clientName, amount: rwf(price) })}
          </Typography.Text>
        </div>
      );
    }

    if (waiting && payment) {
      return (
        <div className="isoko-paybox">
          <Flex align="center" gap={12}>
            <Spin />
            <div>
              <Typography.Text strong style={{ display: 'block' }}>
                {t('pay.approveTitle')}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t('pay.approveBody', { number: localNumber(payment.payerMsisdn) })}
              </Typography.Text>
            </div>
          </Flex>
          {payment.provider === 'simulated-momo' && (
            <Button block style={{ marginTop: 12 }} loading={busy === 'approve'} onClick={approveSimulated}>
              {t('pay.approveSimulated')}
            </Button>
          )}
          <div style={{ marginTop: 10 }}>
            <HelpLink category="payment" relatedType="transaction" relatedId={payment.id} />
          </div>
        </div>
      );
    }

    return (
      <div className="isoko-paybox">
        <Flex align="center" gap={8} style={{ marginBottom: 4 }}>
          <MobileOutlined />
          <Typography.Text strong>{t('pay.title', { name: workerName })}</Typography.Text>
        </Flex>
        {payment?.status === 'failed' && (
          <Typography.Text type="danger" style={{ display: 'block', fontSize: 13, marginBottom: 8 }}>
            {t('pay.failedBefore')} <HelpLink category="payment" relatedType="transaction" relatedId={payment.id} />
          </Typography.Text>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          {t('pay.numberLabel')}
        </Typography.Text>
        <Input
          inputMode="tel"
          prefix="+250"
          value={phone.replace(/^0/, '')}
          onChange={(e) => setPhone(`0${e.target.value.replace(/\D/g, '').replace(/^0/, '').slice(0, 9)}`)}
          placeholder="788 123 456"
          style={{ margin: '4px 0 12px' }}
        />
        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
          {t('safetyNet.addTitle', { name: workerName })}
        </Typography.Text>
        <Segmented
          block
          size="small"
          value={netPercent}
          onChange={(v) => setNetPercent(Number(v))}
          options={[0, 3, 5].map((p) => ({ value: p, label: p === 0 ? t('safetyNet.none') : `${p}%` }))}
          style={{ margin: '4px 0 12px' }}
        />
        <div className="isoko-paybox__lines">
          <Flex justify="space-between"><span>{t('pay.lineJob')}</span><span>{rwf(price)}</span></Flex>
          {contribution > 0 && <Flex justify="space-between"><span>{t('pay.lineSafetyNet')}</span><span>{rwf(contribution)}</span></Flex>}
          {premium > 0 && <Flex justify="space-between"><span>{t('pay.lineCover')}</span><span>{rwf(premium)}</span></Flex>}
          <Flex justify="space-between" className="isoko-paybox__total"><span>{t('pay.lineTotal')}</span><span>{rwf(total)}</span></Flex>
        </div>
        <Button type="primary" block loading={busy === 'pay'} disabled={phone.length < 10} onClick={pay} style={{ marginTop: 12 }}>
          {t('pay.payButton', { amount: rwf(total) })}
        </Button>
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
          {t('pay.howItWorks')}
        </Typography.Text>
      </div>
    );
  })();

  if (!body) return null;
  return (
    <Flex vertical gap={8}>
      {body}
    </Flex>
  );
};

export default JobPaymentPanel;
