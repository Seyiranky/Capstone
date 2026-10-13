import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Table, Tag } from 'antd';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import RejectionBreakdownCard from './RejectionBreakdownCard';
import type { TradeRate } from '../../types';

const fmt = (n: number | null) => (n == null ? '—' : `${n.toLocaleString()} RWF`);

/** What each trade actually pays, and why applications in it are turned down. */
const AdminMarket = () => {
  const { t } = useTranslation();
  const [rates, setRates] = useState<TradeRate[] | null>(null);

  useEffect(() => {
    adminApi.rates().then(setRates);
  }, []);

  return (
    <PageContainer title={t('adminNav.market')} subtitle={t('adminNav.marketSub')}>
      <Card title="Usual pay by trade">
        <Table
          rowKey="category"
          size="small"
          loading={!rates}
          dataSource={rates ?? []}
          pagination={false}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Trade', dataIndex: 'name', key: 'name' },
            { title: 'Low (25th %)', key: 'p25', align: 'right', render: (_, r) => fmt(r.p25) },
            { title: 'Typical', key: 'median', align: 'right', render: (_, r) => <strong>{fmt(r.median)}</strong> },
            { title: 'High (75th %)', key: 'p75', align: 'right', render: (_, r) => fmt(r.p75) },
            {
              title: 'Based on',
              key: 'basis',
              render: (_, r) =>
                r.basis === 'none' ? (
                  <Tag>Not enough data</Tag>
                ) : (
                  <Tag color={r.basis === 'paid' ? 'green' : 'default'}>
                    {r.sampleSize} {r.basis === 'paid' ? 'paid jobs' : 'posted budgets'}
                  </Tag>
                ),
            },
          ]}
        />
      </Card>
      <RejectionBreakdownCard />
    </PageContainer>
  );
};

export default AdminMarket;
