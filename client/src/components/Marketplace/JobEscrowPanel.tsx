import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Checkbox, Flex, Input, Segmented, Typography } from 'antd';
import { LockOutlined, SafetyCertificateOutlined, WarningOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import OpenDisputeModal from '../Disputes/OpenDisputeModal';
import { isAxiosError } from 'axios';
import { matchApi } from '../../api/matchApi';
import { transactionApi } from '../../api/transactionApi';
import { coverApi, type CoverStatus } from '../../api/coverApi';
import { AUTO_RELEASE_AFTER_MS, MAX_CODE_ATTEMPTS } from '../../lib/money';
import type { Dispute, Match } from '../../types';

interface JobEscrowPanelProps {
  match: Match;
  isWorker: boolean;
  /** A dispute that is still open or with an admin, if there is one. */
  liveDispute?: Dispute;
  onChanged: () => void;
}

const box: React.CSSProperties = {
  border: '1px solid var(--ant-color-border-secondary, #e4e4e7)',
  borderRadius: 6,
  padding: 12,
  background: 'var(--ant-color-fill-quaternary, #fafafa)',
};

/**
 * What each side does while a job is in progress and its money is in escrow.
 *
 * The client funds the job, holds the completion code and can release early.
 * The worker sees the money is secured, finishes with the client's code, or
 * reports the job done to start the 72-hour automatic release.
 */
const JobEscrowPanel = ({ match, isWorker, liveDispute, onChanged }: JobEscrowPanelProps) => {
  const { t, i18n } = useTranslation();
  const { message, modal } = App.useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  // Suggested 3% to the worker's safety net, as Alia suggests a small amount per job.
  const [netPercent, setNetPercent] = useState(3);
  // Job Cover for on-site work, offered to the client as they pay in.
  const [cover, setCover] = useState<CoverStatus | null>(null);
  const [addCover, setAddCover] = useState(true);
  useEffect(() => {
    if (isWorker) return;
    coverApi.status(match.id).then(setCover).catch(() => setCover(null));
  }, [isWorker, match.id]);
  const [locked, setLocked] = useState((match.completionCodeAttempts ?? 0) >= MAX_CODE_ATTEMPTS);

  const tx = match.transaction;
  const amount = Number(tx?.amount ?? match.agreedAmount ?? match.gig?.budget ?? 0).toLocaleString();
  const held = tx?.status === 'confirmed' && tx.escrowStatus === 'held';
  const autoReleaseDate = match.workDoneAt
    ? new Date(new Date(match.workDoneAt).getTime() + AUTO_RELEASE_AFTER_MS).toLocaleString(
        i18n.resolvedLanguage,
        { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
      )
    : null;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await action();
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const price = Number(tx?.amount ?? match.agreedAmount ?? match.gig?.budget ?? 0);
  const contribution = Math.round((price * netPercent) / 100);
  const coverOffered = Boolean(cover?.eligible && !cover.covered);
  const premium = coverOffered && addCover ? (cover?.premium ?? 0) : 0;
  // A job accepted before escrow existed has no payment request yet; open one first.
  const fund = () =>
    run('fund', async () => {
      const request = tx ?? (await transactionApi.initiateTransaction(match.id));
      return transactionApi.confirmTransaction(request.id, contribution, premium > 0);
    });

  const release = () =>
    modal.confirm({
      title: t('escrow.releaseConfirmTitle', { amount }),
      content: t('escrow.releaseConfirmBody', { name: match.worker?.name ?? '' }),
      okText: t('escrow.releaseButton'),
      onOk: () => run('release', () => matchApi.updateMatchStatus(match.id, 'completed')),
    });

  const submitCode = () =>
    run('code', async () => {
      try {
        await matchApi.completeWithCode(match.id, code);
        message.success(t('escrow.released'));
      } catch (error) {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status === 423) {
          setLocked(true);
          message.error(t('escrow.locked'));
        } else if (status === 400) {
          const left = isAxiosError(error) ? error.response?.data?.attemptsLeft : undefined;
          message.error(t('escrow.wrongCode', { count: left ?? 0 }));
          setCode('');
        }
        throw error;
      }
    }).catch(() => undefined);

  const reportDone = () => run('done', () => matchApi.markWorkDone(match.id));

  const securedLine = (
    <Flex align="center" gap={8}>
      <SafetyCertificateOutlined style={{ color: 'var(--ant-color-success, #16a34a)' }} />
      <Typography.Text style={{ fontSize: 13 }}>{t('escrow.secured', { amount })}</Typography.Text>
    </Flex>
  );

  // A dispute freezes the money: nothing else on this card applies until it is decided.
  if (liveDispute) {
    return (
      <Flex vertical gap={8} style={{ ...box, borderColor: 'var(--ant-color-warning-border, #fcd34d)' }}>
        <Flex align="flex-start" gap={8}>
          <WarningOutlined style={{ color: 'var(--ant-color-warning, #d97706)', marginTop: 3 }} />
          <Typography.Text style={{ fontSize: 13 }}>{t('dispute.frozen')}</Typography.Text>
        </Flex>
        <Link to="/disputes" style={{ fontSize: 13 }}>
          {t('dispute.viewDispute')}
        </Link>
      </Flex>
    );
  }

  const disputeLink = held && (
    <>
      <Button
        type="link"
        size="small"
        danger
        style={{ paddingInline: 0, alignSelf: 'flex-start' }}
        onClick={() => setDisputing(true)}
      >
        {t('dispute.open')}
      </Button>
      {disputing && (
        <OpenDisputeModal
          match={match}
          isWorker={isWorker}
          onClose={() => setDisputing(false)}
          onOpened={onChanged}
        />
      )}
    </>
  );

  if (!isWorker) {
    if (!held) {
      return (
        <div style={box}>
          <Typography.Text strong style={{ display: 'block' }}>
            {t('escrow.fundTitle')}
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: '4px 0 10px' }}>
            {t('escrow.fundBody', { amount })}
          </Typography.Paragraph>
          <Typography.Text style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            {t('safetyNet.addTitle', { name: match.worker?.name ?? '' })}
          </Typography.Text>
          <Segmented
            block
            size="small"
            value={netPercent}
            onChange={(v) => setNetPercent(Number(v))}
            options={[0, 3, 5].map((p) => ({ value: p, label: p === 0 ? t('safetyNet.none') : `${p}%` }))}
            style={{ marginBottom: 6 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
            {contribution > 0 ? t('safetyNet.addHelp', { amount: contribution.toLocaleString() }) : t('safetyNet.noneHelp')}
          </Typography.Text>
          {coverOffered && cover && (
            <div style={{ marginBottom: 10 }}>
              <Checkbox checked={addCover} onChange={(e) => setAddCover(e.target.checked)}>
                {t('cover.addLabel', { premium: cover.premium.toLocaleString() })}
              </Checkbox>
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2, paddingInlineStart: 24 }}>
                {t('cover.addHelp', { name: match.worker?.name ?? '', limit: cover.limit.toLocaleString() })}
              </Typography.Text>
            </div>
          )}
          <Button type="primary" block loading={busy === 'fund'} onClick={fund}>
            {t('safetyNet.payTotal', { amount: (price + contribution + premium).toLocaleString() })}
          </Button>
        </div>
      );
    }
    return (
      <Flex vertical gap={10}>
        {securedLine}
        {match.completionCode && (
          <div style={{ ...box, textAlign: 'center' }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, letterSpacing: '0.04em' }}>
              {t('escrow.codeLabel').toUpperCase()}
            </Typography.Text>
            <div
              aria-label={t('escrow.codeLabel')}
              style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: '0.3em',
                fontVariantNumeric: 'tabular-nums',
                paddingInlineStart: '0.3em',
                lineHeight: 1.3,
              }}
            >
              {match.completionCode}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('escrow.codeHint')}
            </Typography.Text>
          </div>
        )}
        {autoReleaseDate && (
          <Typography.Text type="warning" style={{ fontSize: 13 }}>
            {t('escrow.workDoneClient', { date: autoReleaseDate })}
          </Typography.Text>
        )}
        <Button block loading={busy === 'release'} onClick={release}>
          {t('escrow.releaseButton')}
        </Button>
        {disputeLink}
      </Flex>
    );
  }

  // Worker
  if (!held) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {t('escrow.waitingFunding')}
      </Typography.Text>
    );
  }
  return (
    <Flex vertical gap={10}>
      {securedLine}
      {locked ? (
        <Flex align="flex-start" gap={8} style={box}>
          <LockOutlined style={{ marginTop: 3 }} />
          <Typography.Text style={{ fontSize: 13 }}>{t('escrow.locked')}</Typography.Text>
        </Flex>
      ) : (
        <div style={box}>
          <Typography.Text style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
            {t('escrow.enterCodeLabel')}
          </Typography.Text>
          <Flex gap={8} wrap="wrap" align="center">
            <Input.OTP
              length={4}
              value={code}
              onChange={setCode}
              inputMode="numeric"
              formatter={(v) => v.replace(/\D/g, '')}
            />
            <Button
              type="primary"
              loading={busy === 'code'}
              disabled={code.length !== 4}
              onClick={submitCode}
            >
              {t('escrow.completeButton')}
            </Button>
          </Flex>
        </div>
      )}
      {autoReleaseDate ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t('escrow.autoReleaseOn', { date: autoReleaseDate })}
        </Typography.Text>
      ) : (
        <Button type="link" size="small" style={{ paddingInline: 0, alignSelf: 'flex-start' }} loading={busy === 'done'} onClick={reportDone}>
          {t('escrow.reportDone')}
        </Button>
      )}
      {disputeLink}
    </Flex>
  );
};

export default JobEscrowPanel;
