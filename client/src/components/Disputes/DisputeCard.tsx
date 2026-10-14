import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { App, Button, Card, Col, Flex, Input, Row, Typography } from 'antd';
import { CheckCircleFilled, ClockCircleOutlined, TeamOutlined } from '@ant-design/icons';
import { disputeApi } from '../../api/disputeApi';
import { useAppSelector } from '../../store/hooks';
import { apiErrorMessage } from '../../utils/apiError';
import type { Dispute, DisputeOutcome } from '../../types';

const OUTCOMES: DisputeOutcome[] = ['release', 'split', 'refund'];

const STATUS_TONE: Record<Dispute['status'], string> = {
  open: 'info',
  escalated: 'warning',
  decided: 'success',
  settled: 'neutral',
};

const Statement = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="isoko-dispute__statement">
    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
      {label}
    </Typography.Text>
    <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{children}</Typography.Paragraph>
  </div>
);

/**
 * One dispute, from whichever seat the viewer occupies.
 *
 * The other party can add their side once. A mediator chooses an outcome with
 * a reason. An admin decides escalated disputes and must record why. Everyone
 * sees the same progress, but votes stay hidden until the dispute closes.
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
  const price = Number(match?.agreedAmount ?? match?.gig?.budget ?? 0).toLocaleString();
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
      message.error(apiErrorMessage(error, t('pay.genericError')));
    } finally {
      setBusy(false);
    }
  };

  const canRespond = live && dispute.myRole === 'party' && !isOpener && !dispute.response;
  const canVote = dispute.status === 'open' && dispute.myRole === 'mediator' && mySeat && !mySeat.vote;
  const canResolve = live && dispute.myRole === 'admin';

  return (
    <Card styles={{ body: { padding: 0 } }} className="isoko-dispute">
      {/* What the dispute is about */}
      <Flex justify="space-between" align="flex-start" gap={12} wrap="wrap" className="isoko-dispute__head">
        <div style={{ minWidth: 0 }}>
          {match?.gig ? (
            <Link to={`/gigs/${match.gigId}`} style={{ fontWeight: 600, fontSize: 15 }}>
              {match.gig.title}
            </Link>
          ) : null}
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13, marginTop: 2 }}>
            {t('dispute.people', { worker: match?.worker?.name ?? '—', client: match?.gig?.client?.name ?? '—' })} ·{' '}
            {t('dispute.price', { amount: price })}
          </Typography.Text>
        </div>
        <span className={`isoko-status isoko-status--${STATUS_TONE[dispute.status]}`}>{t(`dispute.status_${dispute.status}`)}</span>
      </Flex>

      <Row gutter={[20, 16]} className="isoko-dispute__body">
        <Col xs={24} lg={15}>
          <Flex vertical gap={12}>
            <Statement label={`${t(`dispute.reason_${dispute.reason}`)} · ${t('dispute.openedBy', { name: dispute.openedBy?.name ?? '' })}`}>
              {dispute.details}
            </Statement>
            {dispute.response ? (
              <Statement label={t('dispute.response')}>{dispute.response}</Statement>
            ) : (
              !canRespond && (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {t('dispute.noResponse')}
                </Typography.Text>
              )
            )}
          </Flex>
        </Col>
        <Col xs={24} lg={9}>
          <div className="isoko-dispute__panel">
            <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
              <TeamOutlined />
              <Typography.Text strong style={{ fontSize: 13 }}>
                {t('dispute.panelTitle')}
              </Typography.Text>
            </Flex>
            {dispute.votes.length > 0 && (
              <Flex align="center" gap={10} style={{ marginBottom: 6 }}>
                <Flex gap={5} aria-hidden>
                  {dispute.votes.map((v) => (
                    <span key={v.id} className={`isoko-dispute__dot${v.voted ? ' isoko-dispute__dot--on' : ''}`} />
                  ))}
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {t('dispute.votesProgress', { count: voted })}
                </Typography.Text>
              </Flex>
            )}
            {live && (
              <Flex align="center" gap={6}>
                <ClockCircleOutlined style={{ fontSize: 12, opacity: 0.6 }} />
                <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                  {dispute.status === 'escalated' ? t('dispute.withAdmin') : t('dispute.deadline', { date: date(dispute.deadlineAt) })}
                </Typography.Text>
              </Flex>
            )}
            {dispute.myRole !== 'party' && dispute.panelPoolSize != null && dispute.votes.length > 0 && (
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                {t('dispute.panelNote', { count: dispute.panelPoolSize })}
              </Typography.Text>
            )}
            {mySeat?.vote && (
              <Typography.Text style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
                <CheckCircleFilled style={{ marginInlineEnd: 6, color: '#16a34a' }} />
                {t('dispute.youVoted', { vote: t(`dispute.vote_${mySeat.vote}`) })}
              </Typography.Text>
            )}
          </div>
        </Col>
      </Row>

      {/* What the viewer can do now */}
      {canRespond && (
        <div className="isoko-dispute__foot">
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('dispute.addSide')}
          </Typography.Text>
          <Input.TextArea rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('dispute.addSidePlaceholder')} />
          <Button type="primary" style={{ marginTop: 10 }} disabled={text.trim().length < 10} loading={busy} onClick={() => act(() => disputeApi.respond(dispute.id, text))}>
            {t('dispute.sendResponse')}
          </Button>
        </div>
      )}

      {(canVote || canResolve) && (
        <div className="isoko-dispute__foot">
          <Typography.Text strong style={{ display: 'block', marginBottom: 10 }}>
            {canResolve ? t('dispute.resolveTitle') : t('dispute.vote')}
          </Typography.Text>
          <Row gutter={[10, 10]}>
            {OUTCOMES.map((o) => (
              <Col key={o} xs={24} md={8}>
                <button
                  type="button"
                  className={`isoko-dispute__choice${choice === o ? ' isoko-dispute__choice--on' : ''}`}
                  aria-pressed={choice === o}
                  onClick={() => setChoice(o)}
                >
                  <span className="isoko-dispute__choice-title">{t(`dispute.vote_${o}`)}</span>
                  <span className="isoko-dispute__choice-body">{t(`dispute.means_${o}`, { amount: price })}</span>
                </button>
              </Col>
            ))}
          </Row>
          <Input.TextArea
            rows={2}
            style={{ marginTop: 12 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={canResolve ? t('dispute.resolveNote') : t('dispute.rationalePlaceholder')}
          />
          <Button
            type="primary"
            style={{ marginTop: 10 }}
            disabled={!choice || (canResolve && text.trim().length < 5)}
            loading={busy}
            onClick={() =>
              choice &&
              act(() => (canResolve ? disputeApi.resolve(dispute.id, choice, text) : disputeApi.vote(dispute.id, choice, text || undefined)))
            }
          >
            {canResolve ? t('dispute.resolve') : t('dispute.submitVote')}
          </Button>
        </div>
      )}

      {/* How it ended */}
      {!live && dispute.outcome && (
        <div className="isoko-dispute__foot isoko-dispute__result">
          <Typography.Text strong style={{ display: 'block' }}>
            {t('dispute.outcome')}: {t(`dispute.vote_${dispute.outcome}`)}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t(`dispute.means_${dispute.outcome}`, { amount: price })}
          </Typography.Text>
          {dispute.adminNote && (
            <div style={{ marginTop: 10 }}>
              <Statement label={t('dispute.adminNote')}>{dispute.adminNote}</Statement>
            </div>
          )}
          {dispute.votes.some((v) => v.vote) && (
            <Flex vertical gap={6} style={{ marginTop: 10 }}>
              {dispute.votes
                .filter((v) => v.vote)
                .map((v) => (
                  <Typography.Text key={v.id} style={{ fontSize: 13 }}>
                    <strong>{v.mediator?.name ?? t('dispute.aMediator')}</strong>: {t(`dispute.vote_${v.vote}`)}
                    {v.rationale ? <Typography.Text type="secondary"> · “{v.rationale}”</Typography.Text> : null}
                  </Typography.Text>
                ))}
            </Flex>
          )}
        </div>
      )}
    </Card>
  );
};

export default DisputeCard;
