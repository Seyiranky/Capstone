import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Col, Progress, Row, Skeleton, Statistic, Table, Typography } from 'antd';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import type { AcceptanceStats, PilotMetrics, TimeSummary } from '../../types';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const hours = (s: TimeSummary) =>
  s.n === 0 || s.medianHours == null ? '—' : s.medianHours < 1 ? '< 1 h' : `${Math.round(s.medianHours)} h`;

const Section = ({ title, question, children }: { title: string; question: string; children: React.ReactNode }) => (
  <Card title={title} style={{ marginTop: 16 }}>
    <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -4 }}>
      {question}
    </Typography.Paragraph>
    {children}
  </Card>
);

/**
 * The pilot's measurements, as the research questions ask them.
 *
 * Every figure comes from /api/admin/metrics, computed from the live records,
 * so what is shown in the defence is what the platform recorded.
 */
const AdminMetrics = () => {
  const { t } = useTranslation();
  const [m, setM] = useState<PilotMetrics | null>(null);

  useEffect(() => {
    adminApi.metrics().then(setM);
  }, []);

  if (!m) {
    return (
      <PageContainer title={t('adminNav.metrics')} subtitle={t('adminNav.metricsSub')}>
        <Skeleton active />
      </PageContainer>
    );
  }

  const origin = Object.entries(m.matchAcceptance.byOrigin).map(([key, s]: [string, AcceptanceStats]) => ({
    key,
    arm: key === 'ranked' ? 'Ranked invitation' : key === 'manual' ? 'Worker applied' : key,
    ...s,
  }));
  const na = m.newcomerAccess;
  const alloc = m.experimentAllocation;

  return (
    <PageContainer title={t('adminNav.metrics')} subtitle={t('adminNav.metricsSub')}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic title="Acceptance rate" value={pct(m.matchAcceptance.overall.acceptanceRate)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic title="Median response" value={hours(m.matchAcceptance.overall.responseTime)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic title="Newcomer share of invites" value={pct(na.invitations.share)} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic title="Median time to first match" value={hours(m.timeToFirstMatch.toFirstAcceptedMatch)} />
          </Card>
        </Col>
      </Row>

      <Section
        title="RQ2 · Does ranking get work accepted?"
        question="Acceptance and response time for ranked invitations compared with workers who applied themselves."
      >
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={origin}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Arm', dataIndex: 'arm', key: 'arm' },
            { title: 'Offers', dataIndex: 'total', key: 'total', align: 'right' },
            { title: 'Answered', dataIndex: 'responded', key: 'responded', align: 'right' },
            { title: 'Accepted', dataIndex: 'accepted', key: 'accepted', align: 'right' },
            { title: 'Rate', key: 'rate', align: 'right', render: (_, r) => pct(r.acceptanceRate) },
            { title: 'Median response', key: 'resp', align: 'right', render: (_, r) => hours(r.responseTime) },
            { title: 'Answered offline', dataIndex: 'queuedOffline', key: 'offline', align: 'right', responsive: ['md'] },
          ]}
        />
      </Section>

      <Section
        title="Newcomer access"
        question={`Do workers with fewer than ${na.threshold.reviewsBelow} reviews get a fair start, or does the ranking lock them out?`}
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} md={12}>
            <Typography.Text>Invitations going to newcomers</Typography.Text>
            <Progress percent={Math.round((na.invitations.share ?? 0) * 100)} strokeColor="var(--isoko-navy)" />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {na.invitations.toNewcomers} of {na.invitations.total} · {na.invitations.byReason.exploration} through the
              exploration slot, {na.invitations.byReason.ranked} on merit
            </Typography.Text>
          </Col>
          <Col xs={24} md={12}>
            <Typography.Text>Accepted jobs going to newcomers</Typography.Text>
            <Progress percent={Math.round((na.acceptedMatches.share ?? 0) * 100)} strokeColor="#4C6E96" />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {na.acceptedMatches.byNewcomers} of {na.acceptedMatches.total} · {na.newcomers} newcomers,{' '}
              {na.newcomersNeverInvited} never invited yet
            </Typography.Text>
          </Col>
        </Row>
      </Section>

      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Section title="Time to first match" question="How long a live gig waits for its first offer, and its first yes.">
            <Typography.Paragraph style={{ marginBottom: 4 }}>
              First offer: <strong>{hours(m.timeToFirstMatch.toFirstMatch)}</strong> median
            </Typography.Paragraph>
            <Typography.Paragraph style={{ marginBottom: 4 }}>
              First acceptance: <strong>{hours(m.timeToFirstMatch.toFirstAcceptedMatch)}</strong> median
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {m.timeToFirstMatch.gigsOpened} gigs opened · {m.timeToFirstMatch.openedNeverMatched} never matched
            </Typography.Text>
          </Section>
        </Col>
        <Col xs={24} md={12}>
          <Section title="Skill review turnaround" question="How quickly submitted evidence gets a decision.">
            <Typography.Paragraph style={{ marginBottom: 4 }}>
              Median decision time: <strong>{hours(m.skillReviewTurnaround.turnaround)}</strong>
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {m.skillReviewTurnaround.submitted} submitted · {m.skillReviewTurnaround.approved} approved ·{' '}
              {m.skillReviewTurnaround.rejected} rejected · {m.skillReviewTurnaround.pending} pending
            </Typography.Text>
          </Section>
        </Col>
      </Row>

      <Section
        title={`RQ3 · Experiment allocation (${alloc.experiment})`}
        question="Workers are assigned to arms from a seeded, published sequence, so the split can be checked."
      >
        <Typography.Paragraph style={{ marginBottom: 4 }}>
          {alloc.claimed} of {alloc.total} places assigned · {alloc.remaining} left · imbalance {alloc.imbalance}
        </Typography.Paragraph>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {Object.entries(alloc.byArm)
            .map(([arm, n]) => `${arm}: ${n}`)
            .join(' · ')}
        </Typography.Text>
      </Section>
    </PageContainer>
  );
};

export default AdminMetrics;
