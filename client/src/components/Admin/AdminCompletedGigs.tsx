import { useEffect, useState } from 'react';
import { Card, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '../../api/adminApi';
import PageContainer from '../Layout/PageContainer';
import IdentityLink from '../common/IdentityLink';
import StatusTag from '../common/StatusTag';
import AdminNav from './AdminNav';
import type { Gig } from '../../types';

const AdminCompletedGigs = () => {
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .listGigs()
      .then(setGigs)
      .finally(() => setLoading(false));
  }, []);

  const completed = gigs.filter((g) => g.status === 'completed');

  const columns: ColumnsType<Gig> = [
    { title: 'Gig', dataIndex: 'title', key: 'title' },
    {
      title: 'Client',
      key: 'client',
      render: (_, g) =>
        g.client ? <IdentityLink id={g.client.id} name={g.client.name} size={22} /> : '—',
    },
    {
      title: 'Completed by',
      key: 'worker',
      render: (_, g) => {
        const w = g.matches?.find((m) => m.status === 'completed')?.worker;
        return w ? <IdentityLink id={w.id} name={w.name} size={22} /> : '—';
      },
    },
    {
      title: 'Budget',
      key: 'budget',
      align: 'right',
      render: (_, g) => `${Number(g.budget).toLocaleString()} RWF`,
    },
    {
      title: 'Payment',
      key: 'payment',
      render: (_, g) => {
        const tx = g.matches?.find((m) => m.status === 'completed')?.transaction;
        return tx ? (
          <StatusTag status={tx.status} />
        ) : (
          <Typography.Text type="secondary">No transaction</Typography.Text>
        );
      },
    },
    {
      title: 'Completed',
      key: 'date',
      render: (_, g) => {
        const m = g.matches?.find((x) => x.status === 'completed');
        return m ? new Date(m.updatedAt).toLocaleDateString() : '—';
      },
    },
  ];

  return (
    <PageContainer title="Completed gigs" subtitle="Finished gigs and who completed them.">
      <AdminNav />
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={completed}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: 'No gigs have been completed yet.' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </PageContainer>
  );
};

export default AdminCompletedGigs;
