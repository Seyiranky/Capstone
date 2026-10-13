import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Col, Row, Skeleton, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { AdminPayments as Payments } from '../../types';

type Row = Payments['recent'][number];

const TILES: { key: keyof Payments['totals']; label: string; help: string }[] = [
  { key: 'awaiting', label: 'Awaiting payment', help: 'Accepted jobs the client has not paid into escrow yet' },
  { key: 'held', label: 'Held in escrow', help: 'Paid in, waiting for the job to finish' },
  { key: 'released', label: 'Paid out', help: 'Released to workers, each with a receipt' },
  { key: 'refunded', label: 'Refunded', help: 'Returned to clients after a cancellation or dispute' },
];

/**
 * Where the money on the platform is: waiting to be collected, held, paid out
 * or refunded, and the latest transactions with their receipts.
 */
const AdminPayments = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<Payments | null>(null);

  useEffect(() => {
    adminApi.payments().then(setData);
  }, []);

  const columns: ColumnsType<Row> = [
    {
      title: 'Job',
      key: 'gig',
      render: (_, r) => (r.gig ? <Link to={`/gigs/${r.gig.id}`}>{r.gig.title}</Link> : '—'),
    },
    {
      title: 'Client → worker',
      key: 'parties',
      responsive: ['md'],
      render: (_, r) => (
        <span>
          {r.client ? <IdentityLink id={r.client.id} name={r.client.name} size={20} /> : '—'}
          <Typography.Text type="secondary"> → </Typography.Text>
          {r.worker ? <IdentityLink id={r.worker.id} name={r.worker.name} size={20} /> : '—'}
        </span>
      ),
    },
    {
      title: 'Amount',
      key: 'amount',
      align: 'right',
      render: (_, r) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {(r.releasedAmount ?? r.amount).toLocaleString()} {r.currency}
          {r.releasedAmount != null && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {' '}
              of {r.amount.toLocaleString()}
            </Typography.Text>
          )}
        </span>
      ),
    },
    { title: 'State', key: 'state', render: (_, r) => <StatusTag status={r.state} /> },
    {
      title: 'Receipt',
      key: 'receipt',
      responsive: ['lg'],
      render: (_, r) => (r.receiptNumber ? <Link to={`/r/${r.receiptNumber}`}>{r.receiptNumber}</Link> : '—'),
    },
    {
      title: 'Updated',
      key: 'date',
      responsive: ['sm'],
      render: (_, r) => new Date(r.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <PageContainer title={t('adminNav.payments')} subtitle={t('adminNav.paymentsSub')}>
      {!data ? (
        <Skeleton active />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {TILES.map((tile) => (
              <Col xs={12} md={6} key={tile.key}>
                <Card size="small" style={{ height: '100%' }}>
                  <Statistic
                    title={tile.label}
                    value={data.totals[tile.key]?.amount ?? 0}
                    suffix="RWF"
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {data.totals[tile.key]?.count ?? 0} · {tile.help}
                  </Typography.Text>
                </Card>
              </Col>
            ))}
          </Row>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: '12px 0 0' }}>
            {data.payoutCount} payouts issued · {data.liveDisputes} live dispute{data.liveDisputes === 1 ? '' : 's'}{' '}
            {data.liveDisputes > 0 && <Link to="/disputes">→</Link>}
          </Typography.Paragraph>
          <Card title="Latest transactions" style={{ marginTop: 16 }}>
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={data.recent}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </>
      )}
    </PageContainer>
  );
};

export default AdminPayments;
