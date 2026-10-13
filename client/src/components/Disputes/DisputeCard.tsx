import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Card, Flex, Input, Radio, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import { disputeApi } from '../../api/disputeApi';
import { useAppSelector } from '../../store/hooks';
import type { Dispute, DisputeOutcome } from '../../types';

const OUTCOMES: DisputeOutcome[] = ['release', 'refund', 'split'];

const STATUS_COLOR: Record<Dispute['status'], string> = {
  open: 'processing',
  escalated: 'warning',
  decided: 'success',
  settled: 'default',
};

const Quote = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div
    style={{
      borderInlineStart: '3px solid var(--ant-color-border, #e4e4e7)',
      paddingInlineStart: 12,
      margin: '12px 0',
    }}
  >
    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
      {label}
    </Typography.Text>
    <Typography.Paragraph style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{children}</Typography.Paragraph>
  </div>
);

/**
 * One dispute, from whichever seat the viewer occupies.
 *
 * The other party can add their side once. A mediator votes with a reason. An
 * admin decides escalated disputes and must record why. Everyone sees the
 * same progress, but votes stay hidden until the dispute closes.
 */
const DisputeCard = ({ dispute, onChanged }: { dispute: Dispute; onChanged: () => void }) => {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const me = useAppSelector((s) => s.auth.profile);
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<DisputeOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const match = dispute.match;
  const live = dispute.status === 'open' || dispute.status === 'escalated';
  const isOpener = dispute.openedById === me?.id;
  const mySeat = dispute.votes.find((v) => v.mediator?.id === me?.id);
  const voted = dispute.votes.filter((v) => v.voted).length;
  const amount = Number(match?.transaction?.amount ?? 0).toLocaleString();
  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.resolvedLanguage, { day: 'numeric', month: 'short', year: 'numeric' });

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      setText('');
      setChoice(null);
      onChanged();
    } catch (error) {
      message.error(isAxiosError(error) ? (error.response?.data?.message ?? 'Something went wrong') : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const canRespond = live && dispute.myRole === 'party' && !isOpener && !dispute.response;
  const canVote = dispute.status === 'open' && dispute.myRole === 'mediator' && mySeat && !mySeat.vote;
  const canResolve = live && dispute.myRole === 'admin';

  return (
    <Card>
      <Flex justify="space-between" align="flex-start" gap={12} wrap="wrap">
        <div style={{ minWidth: 0 }}>
          {match?.gig ? (
            <Link to={`/gigs/${match.gigId}`} style={{ fontWeight: 600 }}>
              {match.gig.title}
            </Link>
          ) : null}
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
            {match?.worker?.name} · {match?.gig?.client?.name} · {t('dispute.held', { amount })}
          </Typography.Text>
        </div>
        <Tag color={STATUS_COLOR[dispute.status]} style={{ marginInlineEnd: 0 }}>
          {t(`dispute.status_${dispute.status}`)}
        </Tag>
      </Flex>

      <Quote label={`${t(`dispute.reason_${dispute.reason}`)} · ${t('dispute.openedBy', { name: dispute.openedBy?.name ?? '' })}`}>
        {dispute.details}
      </Quote>
      {dispute.response ? (
        <Quote label={t('dispute.response')}>{dispute.response}</Quote>
      ) : (
        !canRespond && (
          <Typography.Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 12 }}>
            {t('dispute.noResponse')}
          </Typography.Text>
        )
      )}

      {canRespond && (
        <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 12 }}>
          <Typography.Text strong>{t('dispute.addSide')}</Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('dispute.addSidePlaceholder')}
          />
          <Button
            type="primary"
            disabled={text.trim().length < 10}
            loading={busy}
            onClick={() => act(() => disputeApi.respond(dispute.id, text))}
          >
            {t('dispute.sendResponse')}
          </Button>
        </Space>
      )}

      {/* Progress: who has voted, never how, until it closes. */}
      {dispute.votes.length > 0 && (
        <Flex align="center" gap={10} wrap="wrap" style={{ marginBottom: 8 }}>
          <Flex gap={4} aria-hidden>
            {dispute.votes.map((v) => (
              <span
                key={v.id}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: v.voted ? 'var(--ant-color-text, #18181b)' : 'var(--ant-color-fill-secondary, #e4e4e7)',
                }}
              />
            ))}
          </Flex>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t('dispute.votesProgress', { count: voted })}
          </Typography.Text>
        </Flex>
      )}
      {dispute.status === 'open' && (
        <Flex align="center" gap={6} style={{ marginBottom: 4 }}>
          <ClockCircleOutlined style={{ fontSize: 12, opacity: 0.6 }} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('dispute.deadline', { date: date(dispute.deadlineAt) })}
          </Typography.Text>
        </Flex>
      )}
      {dispute.myRole !== 'party' && dispute.panelPoolSize != null && dispute.votes.length > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
          {t('dispute.panelNote', { count: dispute.panelPoolSize })}
        </Typography.Text>
      )}

      {mySeat?.vote && (
        <Typography.Text style={{ display: 'block', marginTop: 10 }}>
          <CheckCircleFilled style={{ marginInlineEnd: 6 }} />
          {t('dispute.youVoted', { vote: t(`dispute.vote_${mySeat.vote}`) })}
        </Typography.Text>
      )}

      {(canVote || canResolve) && (
        <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 14 }}>
          <Typography.Text strong>{canResolve ? t('dispute.resolveTitle') : t('dispute.vote')}</Typography.Text>
          <Radio.Group value={choice} onChange={(e) => setChoice(e.target.value)}>
            <Space direction="vertical" size={4}>
              {OUTCOMES.map((o) => (
                <Radio key={o} value={o}>
                  {t(`dispute.vote_${o}`)}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
          <Input.TextArea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={canResolve ? t('dispute.resolveNote') : t('dispute.rationalePlaceholder')}
          />
          <Button
            type="primary"
            disabled={!choice || (canResolve && text.trim().length < 5)}
            loading={busy}
            onClick={() =>
              choice &&
              act(() =>
                canResolve
                  ? disputeApi.resolve(dispute.id, choice, text)
                  : disputeApi.vote(dispute.id, choice, text || undefined),
              )
            }
          >
            {canResolve ? t('dispute.resolve') : t('dispute.submitVote')}
          </Button>
        </Space>
      )}

      {!live && dispute.outcome && (
        <div style={{ marginTop: 12 }}>
          <Typography.Text>
            {t('dispute.outcome')}: <strong>{t(`dispute.vote_${dispute.outcome}`)}</strong>
          </Typography.Text>
          {dispute.adminNote && (
            <Quote label={t('dispute.adminNote')}>{dispute.adminNote}</Quote>
          )}
          {dispute.votes.some((v) => v.vote) && (
            <ul style={{ margin: '8px 0 0', paddingInlineStart: 18 }}>
              {dispute.votes
                .filter((v) => v.vote)
                .map((v) => (
                  <li key={v.id} style={{ fontSize: 13 }}>
                    {v.mediator?.name ? `${v.mediator.name}: ` : ''}
                    {t(`dispute.vote_${v.vote}`)}
                    {v.rationale ? `: “${v.rationale}”` : ''}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
};

export default DisputeCard;
