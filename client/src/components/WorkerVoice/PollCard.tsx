import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App, Button, Card, Flex, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { workerVoiceApi, type VoicePoll } from '../../api/workerVoiceApi';
import { apiErrorMessage } from '../../utils/apiError';
import { fromNow } from '../../lib/time';
import type { ReactNode } from 'react';

/**
 * One poll: the question, a bar per option with its share, and once it is
 * closed, what the platform did. A worker who may vote picks an option here.
 */
const PollCard = ({ poll, onChange, extra }: { poll: VoicePoll; onChange?: () => void; extra?: ReactNode }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState<number | null>(null);

  const vote = async (i: number) => {
    setBusy(i);
    try {
      await workerVoiceApi.vote(poll.id, i);
      message.success(t('workerVoice.voted'));
      onChange?.();
    } catch (err) {
      message.error(apiErrorMessage(err, t('workerVoice.voteFailed')));
    } finally {
      setBusy(null);
    }
  };

  const status =
    poll.phase === 'voting'
      ? t('workerVoice.closes', { when: fromNow(poll.closesAt) })
      : poll.phase === 'awaiting_response'
        ? t('workerVoice.awaiting')
        : t('workerVoice.closedOn', { date: new Date(poll.closedAt ?? poll.closesAt).toLocaleDateString() });

  return (
    <Card styles={{ body: { padding: 20 } }}>
      <Flex justify="space-between" align="flex-start" gap={12}>
        <div style={{ minWidth: 0 }}>
          <span className={`isoko-status isoko-status--${poll.phase === 'voting' ? 'info' : poll.phase === 'closed' ? 'success' : 'warning'}`}>
            {t(`workerVoice.phase_${poll.phase}`)}
          </span>
          <Typography.Title level={5} style={{ margin: '10px 0 4px' }}>
            {poll.question}
          </Typography.Title>
          {poll.details && (
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: 0 }}>
              {poll.details}
            </Typography.Paragraph>
          )}
        </div>
        {extra}
      </Flex>

      <Flex vertical gap={10} style={{ marginTop: 16 }}>
        {poll.options.map((option, i) => {
          const share = poll.total ? poll.counts[i] / poll.total : 0;
          const leading = poll.total > 0 && poll.counts[i] === Math.max(...poll.counts);
          return (
            <div key={option}>
              <Flex justify="space-between" align="center" gap={10}>
                <Typography.Text strong={leading} style={{ fontSize: 13.5 }}>
                  {poll.myVote === i && <CheckCircleFilled style={{ color: '#16a34a', marginRight: 6 }} />}
                  {option}
                </Typography.Text>
                <Flex align="center" gap={10}>
                  <Typography.Text type="secondary" style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(share * 100)}% · {poll.counts[i]}
                  </Typography.Text>
                  {poll.canVote && (
                    <Button size="small" loading={busy === i} disabled={busy !== null} onClick={() => vote(i)}>
                      {t('workerVoice.vote')}
                    </Button>
                  )}
                </Flex>
              </Flex>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--ant-color-fill-secondary)', marginTop: 6 }}>
                <div
                  style={{
                    width: `${share * 100}%`,
                    height: '100%',
                    borderRadius: 3,
                    background: leading ? 'var(--isoko-navy)' : 'var(--isoko-muted)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </Flex>

      <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginTop: 14 }}>
        {t('workerVoice.votes', { count: poll.total })} · {status}
      </Typography.Text>

      {poll.outcome && (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--ant-color-fill-quaternary)' }}>
          <Typography.Text strong style={{ fontSize: 12.5, display: 'block' }}>
            {t('workerVoice.outcome')}
          </Typography.Text>
          <Typography.Text style={{ fontSize: 13.5 }}>{poll.outcome}</Typography.Text>
        </div>
      )}
    </Card>
  );
};

export default PollCard;
