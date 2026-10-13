import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Flex, Input, Typography } from 'antd';
import { LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { matchApi } from '../../api/matchApi';
import { transactionApi } from '../../api/transactionApi';
import { AUTO_RELEASE_AFTER_MS, MAX_CODE_ATTEMPTS } from '../../lib/money';
import type { Match } from '../../types';

interface JobEscrowPanelProps {
  match: Match;
  isWorker: boolean;
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
const JobEscrowPanel = ({ match, isWorker, onChanged }: JobEscrowPanelProps) => {
  const { t, i18n } = useTranslation();
  const { message, modal } = App.useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
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

  const fund = () => tx && run('fund', () => transactionApi.confirmTransaction(tx.id));

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
          <Button type="primary" block loading={busy === 'fund'} onClick={fund} disabled={!tx}>
            {t('escrow.fundButton')}
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
    </Flex>
  );
};

export default JobEscrowPanel;
