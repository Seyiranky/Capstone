import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Col, Row, Statistic, Steps, Table, Typography } from 'antd';
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
      render: (_, tx) => new Date(tx.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <PageContainer
      title={t('wallet.title')}
      subtitle={isClient ? t('wallet.subtitleClient') : t('wallet.subtitleWorker')}
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={isClient ? t('wallet.totalPaid') : t('wallet.totalEarned')}
              value={confirmedTotal}
              suffix="RWF"
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title={t('wallet.pending')} value={pendingTotal} suffix="RWF" />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title={t('wallet.transactions')} value={transactions.length} />
          </Card>
        </Col>
      </Row>

      <Card title={t('wallet.howPaymentsWork')} style={{ marginTop: 16 }}>
        <Steps direction="vertical" size="small" current={-1} items={steps} />
        <Typography.Text type="secondary">{t('wallet.simulatedNotice')}</Typography.Text>
      </Card>

      <Card title={t('wallet.transactionHistory')} style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={transactions}
          pagination={{ pageSize: 8, hideOnSinglePage: true }}
          locale={{ emptyText: t('wallet.noTransactions') }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </PageContainer>
  );
};

export default Wallet;
