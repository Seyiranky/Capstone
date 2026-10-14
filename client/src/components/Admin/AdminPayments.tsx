import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Col, Empty, Flex, Grid, Row, Segmented, Skeleton, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, HourglassOutlined, MobileOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import StatTile from '../common/StatTile';
import { fromNow } from '../../lib/time';
import type { AdminPayments as Payments } from '../../types';

type Row = Payments['recent'][number];
type Filter = 'all' | Row['state'];

const STATE: Record<Row['state'], { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'success' },
  pending: { label: 'Awaiting approval', tone: 'warning' },
  failed: { label: 'Failed', tone: 'error' },
};
const TRANSFER: Record<NonNullable<Row['transfer']>, { label: string; tone: string; help: string }> = {
  sent: { label: 'Sent to worker', tone: 'success', help: "Sent to the worker's MoMo number" },
  not_sent: { label: 'Not sent', tone: 'neutral', help: 'MTN Disbursements is not configured, so the payout is recorded but not transferred' },
  failed: { label: 'Transfer failed', tone: 'error', help: 'MTN refused the transfer; it is retried with the next sweep' },
  no_number: { label: 'No MoMo number', tone: 'warning', help: 'The worker has not confirmed a phone number yet' },
};
const rwf = (n: number) => `${Math.round(n).toLocaleString()} RWF`;
const pill = (tone: string, label: string) => <span className={`isoko-status isoko-status--${tone}`}>{label}</span>;

/** Mobile Money on the platform: what is paid, what waits on a phone, what is not paid yet. */
const AdminPayments = () => {
  const { t } = useTranslation();
  const screens = Grid.useBreakpoint();
  const [data, setData] = useState<Payments | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    adminApi.payments().then(setData);
  }, []);

  const rows = useMemo(
    () => (data ? data.recent.filter((r) => filter === 'all' || r.state === filter) : []),
    [data, filter],
  );

  const parties = (r: { client: Row['client']; worker: Row['worker'] }) => (
    <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
      {r.client?.name ?? '—'} → {r.worker?.name ?? '—'}
    </Typography.Text>
  );

  const columns: ColumnsType<Row> = [
    {
      title: 'Job',
      key: 'job',
      render: (_, r) => (
        <div style={{ minWidth: 0 }}>
          {r.gig ? <Link to={`/gigs/${r.gig.id}`} style={{ fontWeight: 500 }}>{r.gig.title}</Link> : '—'}
          <div>{parties(r)}</div>
        </div>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      align: 'right',
      render: (_, r) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <Typography.Text strong>{rwf(r.amount)}</Typography.Text>
          {r.extras > 0 && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                + {rwf(r.extras)} extras
              </Typography.Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'state',
      render: (_, r) => (
        <Flex vertical gap={4} align="flex-start">
          {r.refunded ? (
            pill('neutral', 'Refunded')
          ) : r.paidInAdvance ? (
            <Tooltip title="Paid before the job started, under the old flow; paid out to the worker when the job is marked done">
              {pill('info', 'Paid in advance')}
            </Tooltip>
          ) : r.state === 'failed' && r.failureReason ? (
            <Tooltip title={r.failureReason}>{pill(STATE[r.state].tone, STATE[r.state].label)}</Tooltip>
          ) : (
            pill(STATE[r.state].tone, STATE[r.state].label)
          )}
          {r.transfer && r.transfer !== 'sent' && r.provider !== 'simulated-momo' && (
            <Tooltip title={TRANSFER[r.transfer].help}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {TRANSFER[r.transfer].label}
              </Typography.Text>
            </Tooltip>
          )}
        </Flex>
      ),
    },
    {
      title: 'Receipt',
      key: 'receipt',
      responsive: ['lg'],
      render: (_, r) =>
        r.receiptNumber ? (
          <Link to={`/r/${r.receiptNumber}`} style={{ whiteSpace: 'nowrap' }}>
            {r.receiptNumber}
          </Link>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'When',
      key: 'when',
      align: 'right',
      responsive: ['md'],
      render: (_, r) => <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{fromNow(r.updatedAt)}</Typography.Text>,
    },
  ];

  const providerLabel = !data
    ? ''
    : data.provider.name === 'mtn-momo'
      ? `MTN MoMo · ${data.provider.environment === 'sandbox' ? 'sandbox' : 'live'}`
      : 'Simulated MoMo';

  return (
    <PageContainer
      title={t('adminNav.payments')}
      subtitle={t('adminNav.paymentsSub')}
      extra={data && pill(data.provider.name === 'mtn-momo' ? 'success' : 'neutral', providerLabel)}
    >
      {!data ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={16}>
          <Row gutter={[16, 16]}>
            <Col xs={12} xl={6}>
              <StatTile icon={<CheckCircleOutlined />} label="Paid" value={data.totals.paid.amount.toLocaleString()} suffix="RWF" footer={`${data.totals.paid.count} payments`} />
            </Col>
            <Col xs={12} xl={6}>
              <StatTile icon={<HourglassOutlined />} label="Awaiting approval" value={data.totals.pending.amount.toLocaleString()} suffix="RWF" footer={`${data.totals.pending.count} on a client's phone`} />
            </Col>
            <Col xs={12} xl={6}>
              <StatTile icon={<ClockCircleOutlined />} label="Jobs not yet paid" value={data.totals.awaiting.amount.toLocaleString()} suffix="RWF" footer={`${data.totals.awaiting.count} finished jobs`} />
            </Col>
            <Col xs={12} xl={6}>
              <StatTile icon={<CloseCircleOutlined />} label="Failed" value={data.totals.failed.count} footer="payments that did not go through" />
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={16}>
              <Card
                title="Payments"
                extra={
                  <Segmented
                    size="small"
                    value={filter}
                    onChange={(v) => setFilter(v as Filter)}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'paid', label: 'Paid' },
                      { value: 'pending', label: screens.sm ? 'Awaiting' : 'Waiting' },
                      { value: 'failed', label: 'Failed' },
                    ]}
                  />
                }
                styles={{ body: { padding: rows.length ? '4px 0 0' : 24 } }}
              >
                {rows.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments here yet." />
                ) : screens.md ? (
                  <Table
                    rowKey="id"
                    size="middle"
                    columns={columns}
                    dataSource={rows}
                    pagination={{ pageSize: 10, hideOnSinglePage: true, size: 'small' }}
                  />
                ) : (
                  // Phones: one stacked row per payment instead of squeezed columns.
                  rows.slice(0, 20).map((r, i) => (
                    <div key={r.id} style={{ padding: '12px 16px', borderTop: i ? '1px solid var(--isoko-border)' : undefined }}>
                      <Flex justify="space-between" gap={12} align="flex-start">
                        <div style={{ minWidth: 0 }}>
                          {r.gig ? <Link to={`/gigs/${r.gig.id}`} style={{ fontWeight: 500 }}>{r.gig.title}</Link> : '—'}
                          <div>{parties(r)}</div>
                        </div>
                        <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>{rwf(r.amount)}</Typography.Text>
                      </Flex>
                      <Flex justify="space-between" align="center" style={{ marginTop: 6 }}>
                        {columns[2].render?.(null, r, i) as React.ReactNode}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{fromNow(r.updatedAt)}</Typography.Text>
                      </Flex>
                    </div>
                  ))
                )}
              </Card>
            </Col>

            <Col xs={24} xl={8}>
              <Flex vertical gap={16}>
                <Card title="Jobs not yet paid" extra={<Typography.Text type="secondary">{data.awaiting.length}</Typography.Text>} styles={{ body: { paddingBlock: data.awaiting.length ? 4 : 20 } }}>
                  {data.awaiting.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Every finished job is paid." />
                  ) : (
                    data.awaiting.map((a, i) => (
                      <Flex key={a.matchId} justify="space-between" gap={12} style={{ padding: '12px 0', borderTop: i ? '1px solid var(--isoko-border)' : undefined }}>
                        <div style={{ minWidth: 0 }}>
                          <Link to={`/gigs/${a.gig.id}`} style={{ display: 'block', fontWeight: 500 }}>
                            <Typography.Text ellipsis style={{ maxWidth: 220, color: 'inherit' }}>{a.gig.title}</Typography.Text>
                          </Link>
                          {parties(a)}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <Typography.Text strong style={{ display: 'block', whiteSpace: 'nowrap' }}>{rwf(a.amount)}</Typography.Text>
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>done {fromNow(a.since)}</Typography.Text>
                        </div>
                      </Flex>
                    ))
                  )}
                </Card>

                <Card title={<Flex align="center" gap={8}><MobileOutlined />Payouts to workers</Flex>}>
                  <Flex vertical gap={10}>
                    {(Object.keys(TRANSFER) as (keyof typeof TRANSFER)[]).map((k) => (
                      <Flex key={k} justify="space-between" align="center">
                        <Tooltip title={TRANSFER[k].help}>{pill(TRANSFER[k].tone, TRANSFER[k].label)}</Tooltip>
                        <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>{data.transfers[k] ?? 0}</Typography.Text>
                      </Flex>
                    ))}
                  </Flex>
                  {data.provider.name !== 'mtn-momo' && (
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
                      Payouts are sent to workers' MoMo numbers automatically once the MTN MoMo Disbursements product is configured.
                    </Typography.Paragraph>
                  )}
                  {data.liveDisputes > 0 && (
                    <Typography.Paragraph style={{ fontSize: 12.5, margin: '12px 0 0' }}>
                      <Link to="/disputes">{data.liveDisputes} dispute{data.liveDisputes === 1 ? '' : 's'} being decided →</Link>
                    </Typography.Paragraph>
                  )}
                </Card>
              </Flex>
            </Col>
          </Row>
        </Flex>
      )}
    </PageContainer>
  );
};

export default AdminPayments;
