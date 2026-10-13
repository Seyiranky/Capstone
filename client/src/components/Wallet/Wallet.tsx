import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Col, Flex, Grid, List, Row, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useAppSelector } from '../../store/hooks';
import { transactionApi } from '../../api/transactionApi';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import type { Transaction } from '../../types';

const Wallet = () => {
  const { t } = useTranslation();
  const { role } = useAppSelector((state) => state.auth);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const isClient = role === 'client';
  const screens = Grid.useBreakpoint();

  useEffect(() => {
    setLoading(true);
    transactionApi
      .listTransactions()
      .then(setTransactions)
      .finally(() => setLoading(false));
  }, []);

  const confirmedTotal = transactions
    .filter((x) => x.status === 'confirmed')
    .reduce((sum, x) => sum + Number(x.amount), 0);
  const pendingTotal = transactions
    .filter((x) => x.status === 'initiated')
    .reduce((sum, x) => sum + Number(x.amount), 0);

  const steps = isClient
    ? [
        { title: t('wallet.clientStep1Title'), description: t('wallet.clientStep1Body') },
        { title: t('wallet.clientStep2Title'), description: t('wallet.clientStep2Body') },
        { title: t('wallet.clientStep3Title'), description: t('wallet.clientStep3Body') },
      ]
    : [
        { title: t('wallet.workerStep1Title'), description: t('wallet.workerStep1Body') },
        { title: t('wallet.workerStep2Title'), description: t('wallet.workerStep2Body') },
        { title: t('wallet.workerStep3Title'), description: t('wallet.workerStep3Body') },
      ];

  const columns: ColumnsType<Transaction> = [
    {
      title: t('wallet.colGig'),
      key: 'gig',
      render: (_, tx) => tx.match?.gig?.title ?? t('wallet.colGig'),
    },
    {
      title: isClient ? t('wallet.colWorker') : t('wallet.colClient'),
      key: 'party',
      responsive: ['md'],
      render: (_, tx) => {
        const cp = isClient ? tx.match?.worker : tx.match?.gig?.client;
        return cp ? <IdentityLink id={cp.id} name={cp.name} size={22} /> : '—';
      },
    },
    {
      title: t('wallet.colAmount'),
      key: 'amount',
      align: 'right',
      render: (_, tx) => `${Number(tx.amount).toLocaleString()} RWF`,
    },
    {
      title: t('wallet.colStatus'),
      key: 'status',
      render: (_, tx) => <StatusTag status={tx.status} />,
    },
    {
      title: t('wallet.colDate'),
      key: 'date',
      responsive: ['sm'],
      render: (_, tx) => new Date(tx.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <PageContainer
      title={t('wallet.title')}
      subtitle={isClient ? t('wallet.subtitleClient') : t('wallet.subtitleWorker')}
    >
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic
              title={isClient ? t('wallet.totalPaid') : t('wallet.totalEarned')}
              value={confirmedTotal}
              suffix="RWF"
            />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic title={t('wallet.pending')} value={pendingTotal} suffix="RWF" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ height: '100%' }}>
            <Statistic title={t('wallet.transactions')} value={transactions.length} />
          </Card>
        </Col>
      </Row>

      <Card title={t('wallet.howPaymentsWork')} style={{ marginTop: 16 }}>
        {/* A how-to, not progress: antd Steps would highlight step 1 and grey the rest. */}
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {steps.map((step, i) => (
            <li key={step.title} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <span
                aria-hidden
                style={{
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'var(--ant-color-fill-secondary, #f4f4f5)',
                }}
              >
                {i + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <Typography.Text strong style={{ display: 'block' }}>
                  {step.title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {step.description}
                </Typography.Text>
              </div>
            </li>
          ))}
        </ol>
        <Typography.Paragraph
          type="secondary"
          style={{
            margin: 0,
            fontSize: 13,
            paddingTop: 12,
            borderTop: '1px solid var(--ant-color-border-secondary, #e4e4e7)',
          }}
        >
          {t('wallet.simulatedNotice')}
        </Typography.Paragraph>
      </Card>

      <Card title={t('wallet.transactionHistory')} style={{ marginTop: 16 }}>
        {/* Phones get a two-line list: a table there hides the status column
            behind a sideways scroll. */}
        {!screens.sm ? (
          <List
            loading={loading}
            dataSource={transactions}
            locale={{ emptyText: t('wallet.noTransactions') }}
            pagination={transactions.length > 8 ? { pageSize: 8, size: 'small' } : false}
            renderItem={(tx) => (
              <List.Item style={{ paddingInline: 0 }}>
                <Flex justify="space-between" align="flex-start" gap={12} style={{ width: '100%' }}>
                  <div style={{ minWidth: 0 }}>
                    <Typography.Text strong ellipsis style={{ display: 'block' }}>
                      {tx.match?.gig?.title ?? t('wallet.colGig')}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </Typography.Text>
                  </div>
                  <Flex vertical align="flex-end" gap={4} style={{ flexShrink: 0 }}>
                    <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
                      {Number(tx.amount).toLocaleString()} RWF
                    </Typography.Text>
                    <StatusTag status={tx.status} />
                  </Flex>
                </Flex>
              </List.Item>
            )}
          />
        ) : (
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={transactions}
            pagination={{ pageSize: 8, hideOnSinglePage: true }}
            locale={{ emptyText: t('wallet.noTransactions') }}
            scroll={{ x: 'max-content' }}
          />
        )}
      </Card>
    </PageContainer>
  );
};

export default Wallet;
